import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import {
  Cors,
  EndpointType,
  LambdaIntegration,
  ResponseTransferMode,
  RestApi,
} from 'aws-cdk-lib/aws-apigateway';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import {
  Architecture,
  DockerImageCode,
  DockerImageFunction,
} from 'aws-cdk-lib/aws-lambda';
import type { Construct } from 'constructs';
import type { AgentraDataAuthStack } from './agentra-data-auth-stack.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraAppStackProps extends StackProps {
  dataAuthStack: AgentraDataAuthStack;
  agentCoreRuntimeArn?: string;
  agentCoreRuntimeQualifier?: string;
  slideRuntimeArn?: string;
  slideRuntimeQualifier?: string;
  presentationArtifactsBucketName?: string;
  allowedCorsOrigins?: string[];
}

export class AgentraAppStack extends Stack {
  readonly apiEndpoint: string;
  readonly streamingApiEndpoint: string;

  constructor(scope: Construct, id: string, props: AgentraAppStackProps) {
    super(scope, id, props);

    const backendImage = DockerImageCode.fromImageAsset(join(__dirname, '../../../'), {
      file: 'apps/backend/Dockerfile',
      platform: Platform.LINUX_ARM64,
    });

    const baseEnv = {
      NODE_OPTIONS: '--enable-source-maps',
      PORT: '8080',
      AWS_LWA_PORT: '8080',
      AWS_LWA_READINESS_CHECK_PORT: '8080',
      AWS_LWA_READINESS_CHECK_PATH: '/health',
      STORE_TYPE: 'dynamo',
      THREADS_TABLE_NAME: props.dataAuthStack.threadsTable.tableName,
      MESSAGES_TABLE_NAME: props.dataAuthStack.messagesTable.tableName,
      USERS_TABLE_NAME: props.dataAuthStack.usersTable.tableName,
      COGNITO_USER_POOL_ID: props.dataAuthStack.userPool.userPoolId,
      COGNITO_USER_POOL_CLIENT_ID: props.dataAuthStack.userPoolClient.userPoolClientId,
      COGNITO_REGION: Stack.of(this).region,
      BEDROCK_REGION: Stack.of(this).region,
      ALLOWED_CORS_ORIGINS: (props.allowedCorsOrigins ?? ['http://localhost:3000']).join(
        ',',
      ),
    };

    // AgentCore / slide runtime env vars — StreamingHandler only
    const agentCoreEnv = {
      AGENTCORE_RUNTIME_ARN: props.agentCoreRuntimeArn ?? '',
      AGENTCORE_RUNTIME_QUALIFIER: props.agentCoreRuntimeQualifier ?? '',
      SLIDE_AGENTCORE_RUNTIME_ARN: props.slideRuntimeArn ?? '',
      SLIDE_AGENTCORE_RUNTIME_QUALIFIER: props.slideRuntimeQualifier ?? '',
      PRESENTATION_ARTIFACT_BUCKET_NAME: props.presentationArtifactsBucketName ?? '',
    };

    // HTTP API Lambda — buffered mode, short timeout for CRUD endpoints
    const restHandler = new DockerImageFunction(this, 'RestHandler', {
      code: backendImage,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        ...baseEnv,
        AWS_LWA_INVOKE_MODE: 'buffered',
      },
    });

    // Streaming Lambda — response_stream mode, long timeout for AgentCore SSE
    const streamingHandler = new DockerImageFunction(this, 'StreamingHandler', {
      code: backendImage,
      architecture: Architecture.ARM_64,
      timeout: Duration.minutes(15),
      memorySize: 512,
      environment: {
        ...baseEnv,
        ...agentCoreEnv,
        AWS_LWA_INVOKE_MODE: 'response_stream',
      },
    });

    // AgentCore InvokeAgentRuntime — StreamingHandler only (RestHandler never calls AgentCore)
    if (props.agentCoreRuntimeArn) {
      streamingHandler.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:InvokeAgentRuntime'],
          resources: [
            props.agentCoreRuntimeArn,
            `${props.agentCoreRuntimeArn}/runtime-endpoint/*`,
          ],
        }),
      );
    }

    if (props.slideRuntimeArn) {
      streamingHandler.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:InvokeAgentRuntime'],
          resources: [
            props.slideRuntimeArn,
            `${props.slideRuntimeArn}/runtime-endpoint/*`,
          ],
        }),
      );
    }

    // DynamoDB — both handlers need read/write
    for (const handler of [restHandler, streamingHandler]) {
      props.dataAuthStack.usersTable.grantReadWriteData(handler);
      props.dataAuthStack.threadsTable.grantReadWriteData(handler);
      props.dataAuthStack.messagesTable.grantReadWriteData(handler);
    }

    const allowedOrigins = props.allowedCorsOrigins ?? ['http://localhost:3000'];

    // HTTP API — normal CRUD routes (/health, /threads), lower cost + latency than REST API
    const httpIntegration = new HttpLambdaIntegration('HttpIntegration', restHandler);
    const httpApi = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: allowedOrigins,
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [CorsHttpMethod.ANY],
      },
    });

    httpApi.addRoutes({
      path: '/health',
      methods: [HttpMethod.GET],
      integration: httpIntegration,
    });
    httpApi.addRoutes({
      path: '/threads',
      methods: [HttpMethod.GET, HttpMethod.POST],
      integration: httpIntegration,
    });
    httpApi.addRoutes({
      path: '/threads/{threadId}',
      methods: [HttpMethod.GET, HttpMethod.PATCH, HttpMethod.DELETE],
      integration: httpIntegration,
    });
    httpApi.addRoutes({
      path: '/threads/{threadId}/messages',
      methods: [HttpMethod.GET],
      integration: httpIntegration,
    });

    // REST API — /chat only, response_stream for SSE (HTTP API does not support streaming)
    const streamingIntegration = new LambdaIntegration(streamingHandler, {
      responseTransferMode: ResponseTransferMode.STREAM,
    });
    const streamingApi = new RestApi(this, 'StreamingApi', {
      endpointTypes: [EndpointType.REGIONAL],
      defaultCorsPreflightOptions: {
        allowOrigins: allowedOrigins,
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: Cors.ALL_METHODS,
      },
    });
    streamingApi.root.addResource('chat').addMethod('POST', streamingIntegration);

    this.apiEndpoint = (httpApi.url ?? '').replace(/\/$/, '');
    this.streamingApiEndpoint = streamingApi.url.replace(/\/$/, '');

    new CfnOutput(this, 'HttpApiUrl', { value: this.apiEndpoint });
    new CfnOutput(this, 'StreamingApiUrl', { value: this.streamingApiEndpoint });
  }
}
