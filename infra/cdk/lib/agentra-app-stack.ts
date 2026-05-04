import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
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

  constructor(scope: Construct, id: string, props: AgentraAppStackProps) {
    super(scope, id, props);

    const backendEntry = join(__dirname, '../../../apps/backend/src/lambda.ts');

    const apiHandler = new NodejsFunction(this, 'BackendHandler', {
      entry: backendEntry,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      memorySize: 512,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        STORE_TYPE: 'dynamo',
        THREADS_TABLE_NAME: props.dataAuthStack.threadsTable.tableName,
        MESSAGES_TABLE_NAME: props.dataAuthStack.messagesTable.tableName,
        USERS_TABLE_NAME: props.dataAuthStack.usersTable.tableName,
        COGNITO_USER_POOL_ID: props.dataAuthStack.userPool.userPoolId,
        COGNITO_REGION: Stack.of(this).region,
        BEDROCK_REGION: Stack.of(this).region,
        AGENTCORE_RUNTIME_ARN: props.agentCoreRuntimeArn ?? '',
        AGENTCORE_RUNTIME_QUALIFIER: props.agentCoreRuntimeQualifier ?? '',
        SLIDE_AGENTCORE_RUNTIME_ARN: props.slideRuntimeArn ?? '',
        SLIDE_AGENTCORE_RUNTIME_QUALIFIER: props.slideRuntimeQualifier ?? '',
        PRESENTATION_ARTIFACT_BUCKET_NAME: props.presentationArtifactsBucketName ?? '',
      },
    });

    if (props.agentCoreRuntimeArn) {
      const runtimeEndpointArnPrefix = `${props.agentCoreRuntimeArn}/runtime-endpoint/*`;
      apiHandler.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:InvokeAgentRuntime'],
          resources: [props.agentCoreRuntimeArn, runtimeEndpointArnPrefix],
        }),
      );
    }

    if (props.slideRuntimeArn) {
      const slideRuntimeEndpointArnPrefix = `${props.slideRuntimeArn}/runtime-endpoint/*`;
      apiHandler.addToRolePolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:InvokeAgentRuntime'],
          resources: [props.slideRuntimeArn, slideRuntimeEndpointArnPrefix],
        }),
      );
    }

    props.dataAuthStack.usersTable.grantReadWriteData(apiHandler);
    props.dataAuthStack.threadsTable.grantReadWriteData(apiHandler);
    props.dataAuthStack.messagesTable.grantReadWriteData(apiHandler);

    const api = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: props.allowedCorsOrigins ?? ['http://localhost:3000'],
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [CorsHttpMethod.ANY],
      },
    });

    const integration = new HttpLambdaIntegration('BackendIntegration', apiHandler);

    api.addRoutes({
      path: '/{proxy+}',
      methods: [HttpMethod.ANY],
      integration,
    });

    api.addRoutes({
      path: '/',
      methods: [HttpMethod.ANY],
      integration,
    });

    this.apiEndpoint = api.apiEndpoint;

    new CfnOutput(this, 'ApiUrl', { value: this.apiEndpoint });
  }
}
