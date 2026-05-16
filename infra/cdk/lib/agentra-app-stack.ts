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

    const sharedEnv = {
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
      AGENTCORE_RUNTIME_ARN: props.agentCoreRuntimeArn ?? '',
      AGENTCORE_RUNTIME_QUALIFIER: props.agentCoreRuntimeQualifier ?? '',
      SLIDE_AGENTCORE_RUNTIME_ARN: props.slideRuntimeArn ?? '',
      SLIDE_AGENTCORE_RUNTIME_QUALIFIER: props.slideRuntimeQualifier ?? '',
      PRESENTATION_ARTIFACT_BUCKET_NAME: props.presentationArtifactsBucketName ?? '',
      ALLOWED_CORS_ORIGINS: (props.allowedCorsOrigins ?? ['http://localhost:3000']).join(
        ',',
      ),
    };

    // REST Lambda — buffered mode, short timeout for CRUD endpoints
    const restHandler = new DockerImageFunction(this, 'RestHandler', {
      code: backendImage,
      architecture: Architecture.ARM_64,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        ...sharedEnv,
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
        ...sharedEnv,
        AWS_LWA_INVOKE_MODE: 'response_stream',
      },
    });

    for (const handler of [restHandler, streamingHandler]) {
      if (props.agentCoreRuntimeArn) {
        const runtimeEndpointArnPrefix = `${props.agentCoreRuntimeArn}/runtime-endpoint/*`;
        handler.addToRolePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['bedrock-agentcore:InvokeAgentRuntime'],
            resources: [props.agentCoreRuntimeArn, runtimeEndpointArnPrefix],
          }),
        );
      }

      if (props.slideRuntimeArn) {
        const slideRuntimeEndpointArnPrefix = `${props.slideRuntimeArn}/runtime-endpoint/*`;
        handler.addToRolePolicy(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['bedrock-agentcore:InvokeAgentRuntime'],
            resources: [props.slideRuntimeArn, slideRuntimeEndpointArnPrefix],
          }),
        );
      }

      props.dataAuthStack.usersTable.grantReadWriteData(handler);
      props.dataAuthStack.threadsTable.grantReadWriteData(handler);
      props.dataAuthStack.messagesTable.grantReadWriteData(handler);
    }

    const corsOptions = {
      allowOrigins: props.allowedCorsOrigins ?? ['http://localhost:3000'],
      allowHeaders: ['content-type', 'authorization'],
      allowMethods: Cors.ALL_METHODS,
    };

    // REST API — explicit routes only, no /chat, buffered transfer mode
    const restIntegration = new LambdaIntegration(restHandler);
    const restApi = new RestApi(this, 'RestApi', {
      endpointTypes: [EndpointType.REGIONAL],
      defaultCorsPreflightOptions: corsOptions,
    });

    restApi.root.addResource('health').addMethod('GET', restIntegration);

    const threads = restApi.root.addResource('threads');
    threads.addMethod('GET', restIntegration);
    threads.addMethod('POST', restIntegration);

    const thread = threads.addResource('{threadId}');
    thread.addMethod('GET', restIntegration);
    thread.addMethod('PATCH', restIntegration);
    thread.addMethod('DELETE', restIntegration);

    thread.addResource('messages').addMethod('GET', restIntegration);

    // Streaming API — /chat only, response_stream for SSE
    const streamingIntegration = new LambdaIntegration(streamingHandler, {
      responseTransferMode: ResponseTransferMode.STREAM,
    });
    const streamingApi = new RestApi(this, 'StreamingApi', {
      endpointTypes: [EndpointType.REGIONAL],
      defaultCorsPreflightOptions: corsOptions,
    });
    streamingApi.root.addResource('chat').addMethod('POST', streamingIntegration);

    this.apiEndpoint = restApi.url.replace(/\/$/, '');
    this.streamingApiEndpoint = streamingApi.url.replace(/\/$/, '');

    new CfnOutput(this, 'RestApiUrl', { value: this.apiEndpoint });
    new CfnOutput(this, 'StreamingApiUrl', { value: this.streamingApiEndpoint });
  }
}
