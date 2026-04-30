import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  CfnParameter,
  CfnResource,
  SecretValue,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { CfnRuntime, CfnRuntimeEndpoint } from 'aws-cdk-lib/aws-bedrockagentcore';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraDeckForgeRuntimeStackProps extends StackProps {
  stage: string;
  bedrockImageModelId?: string;
  bedrockTextModelId?: string;
  artifactPrefix?: string;
}

export class AgentraDeckForgeRuntimeStack extends Stack {
  readonly runtimeArn: string;
  readonly runtimeId: string;
  readonly runtimeVersion: string;
  readonly endpointArn: string;

  constructor(scope: Construct, id: string, props: AgentraDeckForgeRuntimeStackProps) {
    super(scope, id, props);

    const normalizedStage = props.stage.replace(/[^a-zA-Z0-9_]/g, '_');
    const runtimeNameSuffix =
      normalizedStage.length > 0
        ? normalizedStage.charAt(0).toUpperCase() + normalizedStage.slice(1)
        : 'Default';

    const runtimeRole = new Role(this, 'DeckForgeRuntimeExecutionRole', {
      assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for Deck Forge AgentCore Runtime.',
    });

    const pexelsApiKeyParam = new CfnParameter(this, 'PexelsApiKey', {
      type: 'String',
      noEcho: true,
      description: 'Pexels API key for Deck Forge image retrieval.',
    });

    const pexelsApiKeySecret = new Secret(this, 'PexelsApiKeySecret', {
      secretName: `agentra/${props.stage}/pexels-api-key`,
      description: `Pexels API key for Agentra ${props.stage} Deck Forge runtime.`,
      secretObjectValue: {
        PEXELS_API_KEY: SecretValue.cfnParameter(pexelsApiKeyParam),
      },
    });

    pexelsApiKeySecret.grantRead(runtimeRole);

    const artifactBucket = new Bucket(this, 'DeckForgeArtifactBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
    artifactBucket.grantReadWrite(runtimeRole);

    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      }),
    );

    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'bedrock:GetInferenceProfile',
          'bedrock:ListInferenceProfiles',
          'bedrock:UseInferenceProfile',
        ],
        resources: ['*'],
      }),
    );

    runtimeRole.addToPolicy(
      new PolicyStatement({
        actions: ['logs:CreateLogGroup', 'logs:DescribeLogStreams'],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*`,
        ],
      }),
    );
    runtimeRole.addToPolicy(
      new PolicyStatement({
        actions: ['logs:DescribeLogGroups'],
        resources: [`arn:aws:logs:${this.region}:${this.account}:log-group:*`],
      }),
    );
    runtimeRole.addToPolicy(
      new PolicyStatement({
        actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [
          `arn:aws:logs:${this.region}:${this.account}:log-group:/aws/bedrock-agentcore/runtimes/*:log-stream:*`,
        ],
      }),
    );

    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    const runtimeImageAsset = new DockerImageAsset(this, 'DeckForgeRuntimeImageAsset', {
      directory: join(__dirname, '../../../apps/deck-forge-runtime'),
    });
    runtimeImageAsset.repository.grantPull(runtimeRole);
    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'ecr:BatchGetImage',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchCheckLayerAvailability',
        ],
        resources: [runtimeImageAsset.repository.repositoryArn],
      }),
    );

    const runtime = new CfnRuntime(this, 'DeckForgeRuntime', {
      agentRuntimeName: `deckForgeRuntime${runtimeNameSuffix}`,
      description: 'Agentra Deck Forge TypeScript AgentCore Runtime.',
      roleArn: runtimeRole.roleArn,
      protocolConfiguration: 'HTTP',
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      agentRuntimeArtifact: {
        containerConfiguration: {
          containerUri: runtimeImageAsset.imageUri,
        },
      },
      environmentVariables: {
        AWS_REGION: Stack.of(this).region,
        BEDROCK_REGION: Stack.of(this).region,
        CLOUDWATCH_LOG_GROUP: `/aws/bedrock-agentcore/runtimes/deck-forge-${props.stage}`,
        DECK_FORGE_BEDROCK_IMAGE_MODEL_ID:
          props.bedrockImageModelId ?? 'amazon.nova-canvas-v1:0',
        DECK_FORGE_BEDROCK_TEXT_MODEL_ID:
          props.bedrockTextModelId ?? 'global.anthropic.claude-sonnet-4-6',
        DECK_FORGE_ARTIFACT_BUCKET: artifactBucket.bucketName,
        DECK_FORGE_ARTIFACT_PREFIX: props.artifactPrefix ?? 'deck-forge/',
        PEXELS_API_KEY_SECRET_ID: pexelsApiKeySecret.secretArn,
      },
      tags: {
        Project: 'agentra',
        ManagedBy: 'cdk',
      },
    });

    const rolePolicyResource = runtimeRole.node
      .findAll()
      .find(
        (child): child is CfnResource =>
          child instanceof CfnResource && child.cfnResourceType === 'AWS::IAM::Policy',
      );
    if (rolePolicyResource) {
      runtime.node.addDependency(rolePolicyResource);
    }

    const endpoint = new CfnRuntimeEndpoint(this, 'DeckForgeRuntimeEndpoint', {
      agentRuntimeId: runtime.attrAgentRuntimeId,
      agentRuntimeVersion: runtime.attrAgentRuntimeVersion,
      name: 'prod',
      description: 'Production endpoint for Agentra Deck Forge Runtime.',
    });
    endpoint.node.addDependency(runtime);

    this.runtimeArn = runtime.attrAgentRuntimeArn;
    this.runtimeId = runtime.attrAgentRuntimeId;
    this.runtimeVersion = runtime.attrAgentRuntimeVersion;
    this.endpointArn = endpoint.attrAgentRuntimeEndpointArn;

    new CfnOutput(this, 'DeckForgeRuntimeArn', { value: this.runtimeArn });
    new CfnOutput(this, 'DeckForgeRuntimeId', { value: this.runtimeId });
    new CfnOutput(this, 'DeckForgeRuntimeVersion', { value: this.runtimeVersion });
    new CfnOutput(this, 'DeckForgeRuntimeEndpointArn', { value: this.endpointArn });
    new CfnOutput(this, 'DeckForgeArtifactBucketName', {
      value: artifactBucket.bucketName,
    });
    new CfnOutput(this, 'PexelsApiKeySecretArn', {
      value: pexelsApiKeySecret.secretArn,
    });
  }
}
