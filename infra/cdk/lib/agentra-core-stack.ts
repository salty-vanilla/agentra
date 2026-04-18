import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CorsHttpMethod, HttpApi, HttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import {
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { Construct } from 'constructs';

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
      },
    });

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
  }
}
