import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CfnOutput,
  CfnResource,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import { CfnRuntime, CfnRuntimeEndpoint } from 'aws-cdk-lib/aws-bedrockagentcore';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import { type ISecret, Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraSlideRuntimeStackProps extends StackProps {
  stage: string;
  thirdPartyApiKeysSecretArn?: string;
}

export class AgentraSlideRuntimeStack extends Stack {
  readonly runtimeArn: string;
  readonly runtimeId: string;
  readonly runtimeVersion: string;
  readonly endpointArn: string;
  readonly artifactsBucketName: string;
  readonly artifactsBucketArn: string;
  readonly thirdPartyApiKeysSecret?: ISecret | undefined;

  constructor(scope: Construct, id: string, props: AgentraSlideRuntimeStackProps) {
    super(scope, id, props);

    const isDev = props.stage === 'dev';
    const normalizedStage = props.stage.replace(/[^a-zA-Z0-9_]/g, '_');
    const runtimeNameSuffix =
      normalizedStage.length > 0
        ? normalizedStage.charAt(0).toUpperCase() + normalizedStage.slice(1)
        : 'Default';

    // --- Presentation Artifacts Bucket ---
    const artifactsBucket = new Bucket(this, 'PresentationArtifactsBucket', {
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: isDev,
      lifecycleRules: [
        {
          prefix: 'runs/',
          expiration: Duration.days(isDev ? 7 : 30),
        },
      ],
    });

    // --- Slide Runtime Execution Role ---
    const runtimeRole = new Role(this, 'SlideRuntimeExecutionRole', {
      assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for Agentra Slide AgentCore Runtime.',
    });

    // Bedrock permissions — wildcarded over regions so that the global cross-region
    // inference profile (global.anthropic.claude-sonnet-4-6) can route to any region.
    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: [
          'arn:aws:bedrock:*::foundation-model/*',
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
          `arn:aws:bedrock:*:${this.account}:application-inference-profile/*`,
        ],
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
        resources: [`arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`],
      }),
    );

    // S3 artifact bucket permissions (scoped to runs/ prefix).
    // Split into two statements: s3:prefix is a bucket-level condition key and is
    // not present in the request context for object-level actions (GetObject, PutObject,
    // DeleteObject). Combining them in one statement with s3:prefix causes IAM to
    // evaluate the condition as false for object operations, effectively denying them.
    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
        resources: [`${artifactsBucket.bucketArn}/runs/*`],
      }),
    );
    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [artifactsBucket.bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': ['runs/*', 'runs'],
          },
        },
      }),
    );

    // --- Third-party API keys secret (optional; enables image retrieval when provided) ---
    const thirdPartyApiKeysSecretArn =
      props.thirdPartyApiKeysSecretArn ??
      this.node.tryGetContext('thirdPartyApiKeysSecretArn');
    let thirdPartyApiKeysSecret: ISecret | undefined;
    let thirdPartyEnvVars: Record<string, string> = {};

    if (thirdPartyApiKeysSecretArn) {
      thirdPartyApiKeysSecret = Secret.fromSecretCompleteArn(
        this,
        'ThirdPartyApiKeysSecret',
        thirdPartyApiKeysSecretArn,
      );
      thirdPartyApiKeysSecret.grantRead(runtimeRole);
      thirdPartyEnvVars = {
        PEXELS_API_KEY_SECRET_ID: thirdPartyApiKeysSecret.secretArn,
      };
      this.thirdPartyApiKeysSecret = thirdPartyApiKeysSecret;
    }

    // CloudWatch Logs permissions
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

    // ECR permissions
    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    // --- Docker Image Asset ---
    const runtimeImageAsset = new DockerImageAsset(this, 'SlideRuntimeImageAsset', {
      directory: join(__dirname, '../../..'),
      file: 'apps/presentation-author-runtime/Dockerfile',
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

    // --- AgentCore Runtime ---
    const runtime = new CfnRuntime(this, 'SlideAgentCoreRuntime', {
      agentRuntimeName: `agentraSlideRuntime${runtimeNameSuffix}`,
      description: 'Agentra Slide Generation AgentCore Runtime.',
      roleArn: runtimeRole.roleArn,
      protocolConfiguration: 'HTTP',
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      environmentVariables: {
        BEDROCK_REGION: Stack.of(this).region,
        BEDROCK_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
        PRESENTATION_AUTHOR_MODEL_ID: 'global.anthropic.claude-sonnet-4-6',
        PRESENTATION_AUTHOR_OUTPUT_DIR: '/tmp/presentation-author',
        PRESENTATION_AUTHOR_ENABLE_DIAGNOSTICS: 'true',
        PRESENTATION_AUTHOR_ENABLE_REVISION: 'true',
        PRESENTATION_ARTIFACT_BUCKET_NAME: artifactsBucket.bucketName,
        PRESENTATION_ARTIFACT_PREFIX: 'runs',
        PRESENTATION_ARTIFACT_PRESIGNED_URLS: 'true',
        PRESENTATION_ARTIFACT_URL_EXPIRES_SECONDS: '3600',
        PRESENTATION_IMAGE_RETRIEVAL_ENABLED: thirdPartyApiKeysSecret ? 'true' : 'false',
        PRESENTATION_IMAGE_GENERATION_ENABLED: 'false',
        CLOUDWATCH_LOG_GROUP: `/aws/bedrock-agentcore/runtimes/agentra-slide-${props.stage}`,
        LOG_LEVEL: 'info',
        ...thirdPartyEnvVars,
      },
      agentRuntimeArtifact: {
        containerConfiguration: {
          containerUri: runtimeImageAsset.imageUri,
        },
      },
      tags: {
        Project: 'agentra',
        Component: 'slide-runtime',
        ManagedBy: 'cdk',
      },
    });

    // Ensure runtime depends on the IAM policy being created first
    const rolePolicyResource = runtimeRole.node
      .findAll()
      .find(
        (child): child is CfnResource =>
          child instanceof CfnResource && child.cfnResourceType === 'AWS::IAM::Policy',
      );
    if (rolePolicyResource) {
      runtime.node.addDependency(rolePolicyResource);
    }

    // --- Runtime Endpoint ---
    const endpoint = new CfnRuntimeEndpoint(this, 'SlideAgentCoreRuntimeEndpoint', {
      agentRuntimeId: runtime.attrAgentRuntimeId,
      agentRuntimeVersion: runtime.attrAgentRuntimeVersion,
      name: 'prod',
      description: 'Production endpoint for Agentra Slide Generation Runtime.',
    });
    endpoint.node.addDependency(runtime);

    // --- Expose properties ---
    this.runtimeArn = runtime.attrAgentRuntimeArn;
    this.runtimeId = runtime.attrAgentRuntimeId;
    this.runtimeVersion = runtime.attrAgentRuntimeVersion;
    this.endpointArn = endpoint.attrAgentRuntimeEndpointArn;
    this.artifactsBucketName = artifactsBucket.bucketName;
    this.artifactsBucketArn = artifactsBucket.bucketArn;

    // --- Outputs ---
    new CfnOutput(this, 'SlideRuntimeArn', { value: this.runtimeArn });
    new CfnOutput(this, 'SlideRuntimeId', { value: this.runtimeId });
    new CfnOutput(this, 'SlideRuntimeVersion', { value: this.runtimeVersion });
    new CfnOutput(this, 'SlideRuntimeEndpointArn', { value: this.endpointArn });
    new CfnOutput(this, 'PresentationArtifactsBucketName', {
      value: artifactsBucket.bucketName,
    });
    new CfnOutput(this, 'PresentationArtifactsBucketArn', {
      value: artifactsBucket.bucketArn,
    });
    new CfnOutput(this, 'SlideRuntimeLogGroupName', {
      value: `/aws/bedrock-agentcore/runtimes/agentra-slide-${props.stage}`,
    });

    if (thirdPartyApiKeysSecret) {
      new CfnOutput(this, 'ThirdPartyApiKeysSecretArn', {
        value: thirdPartyApiKeysSecret.secretArn,
      });
    }
  }
}
