import { CfnOutput, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  OAuthScope,
  UserPool,
  UserPoolClient,
  UserPoolClientIdentityProvider,
} from 'aws-cdk-lib/aws-cognito';
import { AttributeType, BillingMode, ProjectionType, Table } from 'aws-cdk-lib/aws-dynamodb';
import type { Construct } from 'constructs';

export interface AgentraDataAuthStackProps extends StackProps {
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

    const cognitoDomainPrefix = props?.cognitoDomainPrefix ?? 'agentra-auth';
    const callbackUrls = props?.callbackUrls ?? ['http://localhost:3000/'];
    const logoutUrls = props?.logoutUrls ?? ['http://localhost:3000/'];

    this.userPool = new UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: { domainPrefix: cognitoDomainPrefix },
    });

    this.userPoolClient = new UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      supportedIdentityProviders: [UserPoolClientIdentityProvider.COGNITO],
      authFlows: {
        userPassword: true,
        adminUserPassword: true,
        userSrp: true,
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
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.threadsTable = new Table(this, 'ThreadsTable', {
      partitionKey: { name: 'threadId', type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
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
      removalPolicy: RemovalPolicy.DESTROY,
    });

    this.cognitoDomain = `${cognitoDomainPrefix}.auth.${Stack.of(this).region}.amazoncognito.com`;

    new CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, 'CognitoDomain', { value: this.cognitoDomain });
    new CfnOutput(this, 'UsersTableName', { value: this.usersTable.tableName });
    new CfnOutput(this, 'ThreadsTableName', { value: this.threadsTable.tableName });
    new CfnOutput(this, 'MessagesTableName', { value: this.messagesTable.tableName });
  }
}
