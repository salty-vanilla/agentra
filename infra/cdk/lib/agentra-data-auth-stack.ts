import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import {
  AttributeType,
  BillingMode,
  ProjectionType,
  Table,
} from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

export interface AgentraDataAuthStackProps extends StackProps {
  stage: string;
  cognitoDomainPrefix?: string;
  callbackUrls?: string[];
  logoutUrls?: string[];
}

export class AgentraDataAuthStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly usersTable: Table;
  readonly threadsTable: Table;
  readonly messagesTable: Table;
  readonly cognitoDomain: string;

  constructor(scope: Construct, id: string, props?: AgentraDataAuthStackProps) {
    super(scope, id, props);

    const isDev = props?.stage === 'dev';
    const cognitoDomainPrefix = props?.cognitoDomainPrefix ?? 'agentra-auth';
    const callbackUrls = props?.callbackUrls ?? ['http://localhost:3000/'];
    const logoutUrls = props?.logoutUrls ?? ['http://localhost:3000/'];

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: { domainPrefix: cognitoDomainPrefix },
    });

    this.userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      // Only enable OAuth authorization-code grant (used by frontend).
      // Direct password flows (userPassword, adminUserPassword, userSrp) are disabled
      // to minimize the public client attack surface since the browser app uses OAuth redirect.
      authFlows: {
        userPassword: false,
        adminUserPassword: false,
        userSrp: false,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [OAuthScope.OPENID, OAuthScope.EMAIL, OAuthScope.PROFILE],
        callbackUrls,
        logoutUrls,
      },
    });

    this.usersTable = new Table(this, 'UsersTable', {
      partitionKey: { name: 'sub', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.threadsTable = new Table(this, 'ThreadsTable', {
      partitionKey: { name: 'threadId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.threadsTable.addGlobalSecondaryIndex({
      indexName: 'userId-updatedAt-index',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'updatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.messagesTable = new Table(this, 'MessagesTable', {
      partitionKey: { name: 'threadId', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    this.cognitoDomain = `${cognitoDomainPrefix}.auth.${Stack.of(this).region}.amazoncognito.com`;

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
    });
    new CfnOutput(this, 'CognitoDomain', { value: this.cognitoDomain });
    new CfnOutput(this, 'UsersTableName', { value: this.usersTable.tableName });
    new CfnOutput(this, 'ThreadsTableName', { value: this.threadsTable.tableName });
    new CfnOutput(this, 'MessagesTableName', { value: this.messagesTable.tableName });
  }
}
