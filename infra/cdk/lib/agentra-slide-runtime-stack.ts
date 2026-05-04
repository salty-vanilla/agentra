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
import type { Construct } from 'constructs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraSlideRuntimeStackProps extends StackProps {
  stage: string;
}

export class AgentraSlideRuntimeStack extends Stack {
  readonly runtimeArn: string;
  readonly runtimeId: string;
  readonly runtimeVersion: string;
  readonly endpointArn: string;
  readonly artifactsBucketName: string;
  readonly artifactsBucketArn: string;

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

    // Bedrock permissions
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

    // S3 artifact bucket permissions
    artifactsBucket.grantReadWrite(runtimeRole);

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
        CLOUDWATCH_LOG_GROUP: `/aws/bedrock-agentcore/runtimes/agentra-slide-${props.stage}`,
        LOG_LEVEL: 'info',
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
  }
}
