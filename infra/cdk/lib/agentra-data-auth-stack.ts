import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  CfnUserPoolGroup,
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
import {
  deriveEnvironmentKind,
  type EnvironmentKind,
  isDestroyable,
} from './environment.js';

export interface AgentraDataAuthStackProps extends StackProps {
  stage: string;
  environmentKind?: EnvironmentKind;
  cognitoDomainPrefix?: string;
  callbackUrls?: string[];
  logoutUrls?: string[];
}

export class AgentraDataAuthStack extends Stack {
  readonly userPool: UserPool;
  readonly userPoolClient: UserPoolClient;
  readonly adminGroupName = 'agentra-admin';
  readonly usersTable: Table;
  readonly threadsTable: Table;
  readonly messagesTable: Table;
  readonly observabilityTable: Table;
  readonly cognitoDomain: string;

  constructor(scope: Construct, id: string, props?: AgentraDataAuthStackProps) {
    super(scope, id, props);

    const environmentKind =
      props?.environmentKind ?? deriveEnvironmentKind(props?.stage ?? 'dev');
    const isDev = isDestroyable(environmentKind);
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

    new CfnUserPoolGroup(this, 'AdminGroup', {
      userPoolId: this.userPool.userPoolId,
      groupName: this.adminGroupName,
      description: 'Admin users with access to the observability dashboard',
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

    this.observabilityTable = new Table(this, 'ObservabilityTable', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
    });

    // GSI1: look up a single record by traceId
    this.observabilityTable.addGlobalSecondaryIndex({
      indexName: 'gsi1-index',
      partitionKey: { name: 'gsi1pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // GSI2: list records by calendar day for cross-user aggregation
    this.observabilityTable.addGlobalSecondaryIndex({
      indexName: 'gsi2-index',
      partitionKey: { name: 'gsi2pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    // GSI3: list records by threadId
    this.observabilityTable.addGlobalSecondaryIndex({
      indexName: 'gsi3-index',
      partitionKey: { name: 'gsi3pk', type: AttributeType.STRING },
      sortKey: { name: 'gsi3sk', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
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
    new CfnOutput(this, 'ObservabilityTableName', {
      value: this.observabilityTable.tableName,
    });
  }
}
