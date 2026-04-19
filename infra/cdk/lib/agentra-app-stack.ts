import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';
import type { AgentraBedrockStack } from './agentra-bedrock-stack.js';
import type { AgentraDataAuthStack } from './agentra-data-auth-stack.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraAppStackProps extends StackProps {
  dataAuthStack: AgentraDataAuthStack;
  bedrockStack: AgentraBedrockStack;
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
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        STORE_TYPE: 'dynamo',
        THREADS_TABLE_NAME: props.dataAuthStack.threadsTable.tableName,
        MESSAGES_TABLE_NAME: props.dataAuthStack.messagesTable.tableName,
        USERS_TABLE_NAME: props.dataAuthStack.usersTable.tableName,
        COGNITO_USER_POOL_ID: props.dataAuthStack.userPool.userPoolId,
        COGNITO_REGION: Stack.of(this).region,
        BEDROCK_REGION: Stack.of(this).region,
        BEDROCK_AGENT_ID_OPUS: props.bedrockStack.agentIds.opus,
        BEDROCK_AGENT_ALIAS_ID_OPUS: props.bedrockStack.agentAliasIds.opus,
        BEDROCK_AGENT_ID_SONNET: props.bedrockStack.agentIds.sonnet,
        BEDROCK_AGENT_ALIAS_ID_SONNET: props.bedrockStack.agentAliasIds.sonnet,
        BEDROCK_AGENT_ID_HAIKU: props.bedrockStack.agentIds.haiku,
        BEDROCK_AGENT_ALIAS_ID_HAIKU: props.bedrockStack.agentAliasIds.haiku,
      },
    });

    apiHandler.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeAgent'],
        resources: [
          `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:agent-alias/*`,
        ],
      }),
    );

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
