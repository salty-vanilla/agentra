import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { CfnAgent, CfnAgentAlias } from 'aws-cdk-lib/aws-bedrock';
import {
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { AwsCustomResource, AwsCustomResourcePolicy, PhysicalResourceId } from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';

// NOTE: Verify these model IDs are available in your region before deploying.
// Run: aws bedrock list-foundation-models --region ap-northeast-1 --query 'modelSummaries[?contains(modelId, `claude`)].modelId'
const BEDROCK_MODELS = {
  opus: 'anthropic.claude-opus-4-6-v1',
  sonnet: 'anthropic.claude-sonnet-4-6',
  haiku: 'anthropic.claude-haiku-4-5-20251001-v1:0"',
} as const;

const AGENT_INSTRUCTION =
  'あなたは製造ラインのサポートアシスタントです。' +
  'オペレーターからの質問に対して、正確かつ簡潔な日本語で回答してください。' +
  '技術的な内容も分かりやすく説明し、必要に応じて手順を示してください。';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class AgentraCoreStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // ── Cognito ────────────────────────────────────────────────────────────
    const userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    userPool.addDomain('UserPoolDomain', {
      cognitoDomain: { domainPrefix: 'agentra-auth' },
    });

    const userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls: ['http://localhost:3000/'],
        logoutUrls: ['http://localhost:3000/'],
      },
    });

    // ── DynamoDB ────────────────────────────────────────────────────────────
    const usersTable = new Table(this, 'UsersTable', {
      partitionKey: { name: 'sub', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const threadsTable = new Table(this, 'ThreadsTable', {
      partitionKey: { name: 'threadId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    threadsTable.addGlobalSecondaryIndex({
      indexName: 'userId-updatedAt-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    const messagesTable = new Table(this, 'MessagesTable', {
      partitionKey: { name: 'threadId', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const backendEntry = join(__dirname, '../../../apps/backend/src/lambda.ts');

    // ── Bedrock Agent IAM Role ─────────────────────────────────────────────
    const bedrockAgentRole = new Role(this, 'BedrockAgentRole', {
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
    });

    bedrockAgentRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel'],
        resources: Object.values(BEDROCK_MODELS).map(
          (modelId) =>
            `arn:aws:bedrock:${Stack.of(this).region}::foundation-model/${modelId}`,
        ),
      }),
    );

    // ── Bedrock Agents × 3 (Opus / Sonnet / Haiku) ───────────────────────
    const makeAgent = (id: string, modelId: string) =>
      new CfnAgent(this, `BedrockAgent${id}`, {
        agentName: `agentra-${id.toLowerCase()}`,
        agentResourceRoleArn: bedrockAgentRole.roleArn,
        foundationModel: modelId,
        instruction: AGENT_INSTRUCTION,
        idleSessionTtlInSeconds: 1800,
      });

    const makeAlias = (id: string, agent: CfnAgent) =>
      new CfnAgentAlias(this, `BedrockAgentAlias${id}`, {
        agentId: agent.attrAgentId,
        agentAliasName: 'latest',
        routingConfiguration: [{ agentVersion: 'DRAFT' }],
      });

    const opusAgent = makeAgent('Opus', BEDROCK_MODELS.opus);
    const sonnetAgent = makeAgent('Sonnet', BEDROCK_MODELS.sonnet);
    const haikuAgent = makeAgent('Haiku', BEDROCK_MODELS.haiku);

    // Prepare each agent after creation so InvokeAgent calls succeed.
    // CfnAgent creates the agent in DRAFT state but does not prepare it.
    const makePrepare = (id: string, agent: CfnAgent) => {
      const resource = new AwsCustomResource(this, `PrepareAgent${id}`, {
        onCreate: {
          service: 'BedrockAgent',
          action: 'prepareAgent',
          parameters: { agentId: agent.attrAgentId },
          physicalResourceId: PhysicalResourceId.fromResponse('agentId'),
        },
        onUpdate: {
          service: 'BedrockAgent',
          action: 'prepareAgent',
          parameters: { agentId: agent.attrAgentId },
          physicalResourceId: PhysicalResourceId.fromResponse('agentId'),
        },
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            actions: ['bedrock:PrepareAgent'],
            resources: [
              `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:agent/${agent.attrAgentId}`,
            ],
          }),
        ]),
      });
      resource.node.addDependency(agent);
      return resource;
    };

    makePrepare('Opus', opusAgent);
    makePrepare('Sonnet', sonnetAgent);
    makePrepare('Haiku', haikuAgent);

    const opusAlias = makeAlias('Opus', opusAgent);
    const sonnetAlias = makeAlias('Sonnet', sonnetAgent);
    const haikuAlias = makeAlias('Haiku', haikuAgent);

    const apiHandler = new NodejsFunction(this, 'BackendHandler', {
      entry: backendEntry,
      handler: 'handler',
      runtime: Runtime.NODEJS_22_X,
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        STORE_TYPE: 'dynamo',
        THREADS_TABLE_NAME: threadsTable.tableName,
        MESSAGES_TABLE_NAME: messagesTable.tableName,
        USERS_TABLE_NAME: usersTable.tableName,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
        COGNITO_REGION: Stack.of(this).region,
        BEDROCK_REGION: Stack.of(this).region,
        BEDROCK_AGENT_ID_OPUS: opusAgent.attrAgentId,
        BEDROCK_AGENT_ALIAS_ID_OPUS: opusAlias.attrAgentAliasId,
        BEDROCK_AGENT_ID_SONNET: sonnetAgent.attrAgentId,
        BEDROCK_AGENT_ALIAS_ID_SONNET: sonnetAlias.attrAgentAliasId,
        BEDROCK_AGENT_ID_HAIKU: haikuAgent.attrAgentId,
        BEDROCK_AGENT_ALIAS_ID_HAIKU: haikuAlias.attrAgentAliasId,
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

    usersTable.grantReadWriteData(apiHandler);
    threadsTable.grantReadWriteData(apiHandler);
    messagesTable.grantReadWriteData(apiHandler);

    const api = new HttpApi(this, 'HttpApi', {
      corsPreflight: {
        allowOrigins: ['http://localhost:3000'],
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

    new CfnOutput(this, 'ApiUrl', {
      value: api.apiEndpoint,
    });

    new CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new CfnOutput(this, 'CognitoDomain', {
      value: `agentra-auth.auth.${Stack.of(this).region}.amazoncognito.com`,
    });

    new CfnOutput(this, 'BedrockAgentIdOpus', { value: opusAgent.attrAgentId });
    new CfnOutput(this, 'BedrockAgentAliasIdOpus', { value: opusAlias.attrAgentAliasId });
    new CfnOutput(this, 'BedrockAgentIdSonnet', { value: sonnetAgent.attrAgentId });
    new CfnOutput(this, 'BedrockAgentAliasIdSonnet', { value: sonnetAlias.attrAgentAliasId });
    new CfnOutput(this, 'BedrockAgentIdHaiku', { value: haikuAgent.attrAgentId });
    new CfnOutput(this, 'BedrockAgentAliasIdHaiku', { value: haikuAlias.attrAgentAliasId });
  }
}
