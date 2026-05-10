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
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraAgentCoreRuntimeStackProps extends StackProps {
  stage: string;
  slideRuntimeArn?: string;
  slideRuntimeQualifier?: string;
  tavilyApiKeySecretArn?: string;
  memoryEnabled?: boolean;
  sessionS3Prefix?: string;
  normalKbArn?: string;
  normalKbId?: string;
}

export class AgentraAgentCoreRuntimeStack extends Stack {
  readonly runtimeArn: string;
  readonly runtimeId: string;
  readonly runtimeVersion: string;
  readonly endpointArn: string;

  constructor(scope: Construct, id: string, props: AgentraAgentCoreRuntimeStackProps) {
    super(scope, id, props);
    const normalizedStage = props.stage.replace(/[^a-zA-Z0-9_]/g, '_');
    const runtimeNameSuffix =
      normalizedStage.length > 0
        ? normalizedStage.charAt(0).toUpperCase() + normalizedStage.slice(1)
        : 'Default';
    const tavilyApiKeySecretArn =
      props.tavilyApiKeySecretArn ?? this.node.tryGetContext('tavilyApiKeySecretArn');
    if (!tavilyApiKeySecretArn) {
      throw new Error(
        'tavilyApiKeySecretArn must be provided via props or context (-c tavilyApiKeySecretArn=...)',
      );
    }

    const tavilyApiKeySecret = Secret.fromSecretCompleteArn(
      this,
      'TavilyApiKeySecret',
      tavilyApiKeySecretArn,
    );

    const runtimeRole = new Role(this, 'AgentCoreRuntimeExecutionRole', {
      assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for Agentra AgentCore Runtime.',
    });

    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      }),
    );
    tavilyApiKeySecret.grantRead(runtimeRole);

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

    const runtimeImageAsset = new DockerImageAsset(this, 'AgentCoreRuntimeImageAsset', {
      directory: join(__dirname, '../../../apps/agentcore-runtime-ts'),
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

    // Grant permission to invoke Slide Runtime if configured
    if (props.slideRuntimeArn) {
      runtimeRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['bedrock-agentcore:InvokeAgentRuntime'],
          resources: [
            props.slideRuntimeArn,
            `${props.slideRuntimeArn}/runtime-endpoint/*`,
          ],
        }),
      );
    }

    // Grant least-privilege retrieve permissions for normal Bedrock KB
    if (props.normalKbArn) {
      runtimeRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            'bedrock-agent-runtime:Retrieve',
            'bedrock-agent-runtime:RetrieveAndGenerate',
          ],
          resources: [props.normalKbArn],
        }),
      );
    }

    // --- Memory / Session S3 bucket ---
    const memoryEnabled = props.memoryEnabled ?? false;
    const sessionS3Prefix = props.sessionS3Prefix ?? 'sessions';
    let sessionBucket: Bucket | undefined;

    if (memoryEnabled) {
      sessionBucket = new Bucket(this, 'AgentSessionBucket', {
        blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
        encryption: BucketEncryption.S3_MANAGED,
        enforceSSL: true,
        removalPolicy:
          props.stage === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
        autoDeleteObjects: props.stage === 'dev',
        lifecycleRules: props.stage === 'dev' ? [{ expiration: Duration.days(30) }] : [],
      });

      // Grant S3 read/write to session prefix
      sessionBucket.grantReadWrite(runtimeRole, `${sessionS3Prefix}/*`);
      // ListBucket is needed for SessionManager snapshot listing
      runtimeRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [sessionBucket.bucketArn],
          conditions: {
            StringLike: {
              's3:prefix': [`${sessionS3Prefix}/*`],
            },
          },
        }),
      );
    }

    const runtime = new CfnRuntime(this, 'AgentCoreRuntime', {
      agentRuntimeName: `agentraRuntime${runtimeNameSuffix}`,
      description: 'Agentra TypeScript AgentCore Runtime (Strands).',
      roleArn: runtimeRole.roleArn,
      protocolConfiguration: 'HTTP',
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      environmentVariables: {
        BEDROCK_REGION: Stack.of(this).region,
        CLOUDWATCH_LOG_GROUP: `/aws/bedrock-agentcore/runtimes/agentcore-${props.stage}`,
        TAVILY_API_KEY_SECRET_ID: tavilyApiKeySecret.secretArn,
        SLIDE_AGENTCORE_RUNTIME_ARN: props.slideRuntimeArn ?? '',
        SLIDE_AGENTCORE_RUNTIME_QUALIFIER: props.slideRuntimeQualifier ?? '',
        AGENT_MEMORY_ENABLED: memoryEnabled ? 'true' : 'false',
        AGENT_SESSION_S3_BUCKET: sessionBucket?.bucketName ?? '',
        AGENT_SESSION_S3_PREFIX: sessionS3Prefix,
        AGENT_SESSION_S3_REGION: Stack.of(this).region,
        BEDROCK_KB_ID: props.normalKbId ?? '',
        BEDROCK_KB_REGION: Stack.of(this).region,
        ENABLE_KB_RETRIEVE_TOOL: props.normalKbId ? 'true' : 'false',
        ENABLE_KB_RAG_DIAGNOSTICS_TOOL: 'true',
        ENABLE_KB_QUERY_READINESS_TOOL: 'true',
        ENABLE_KB_RAG_FLOW_TOOL: 'true',
        ENABLE_KB_ANSWER_SYNTHESIS_TOOL: 'true',
      },
      agentRuntimeArtifact: {
        containerConfiguration: {
          containerUri: runtimeImageAsset.imageUri,
        },
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

    const endpoint = new CfnRuntimeEndpoint(this, 'AgentCoreRuntimeEndpoint', {
      agentRuntimeId: runtime.attrAgentRuntimeId,
      agentRuntimeVersion: runtime.attrAgentRuntimeVersion,
      name: 'prod',
      description: 'Production endpoint for Agentra AgentCore Runtime.',
    });
    endpoint.node.addDependency(runtime);

    this.runtimeArn = runtime.attrAgentRuntimeArn;
    this.runtimeId = runtime.attrAgentRuntimeId;
    this.runtimeVersion = runtime.attrAgentRuntimeVersion;
    this.endpointArn = endpoint.attrAgentRuntimeEndpointArn;

    new CfnOutput(this, 'AgentCoreRuntimeArn', { value: this.runtimeArn });
    new CfnOutput(this, 'AgentCoreRuntimeId', { value: this.runtimeId });
    new CfnOutput(this, 'AgentCoreRuntimeVersion', { value: this.runtimeVersion });
    new CfnOutput(this, 'AgentCoreRuntimeEndpointArn', { value: this.endpointArn });
    new CfnOutput(this, 'TavilyApiKeySecretArn', {
      value: tavilyApiKeySecret.secretArn,
    });
    new CfnOutput(this, 'AgentMemoryEnabled', {
      value: memoryEnabled ? 'true' : 'false',
    });
    if (sessionBucket) {
      new CfnOutput(this, 'AgentSessionS3BucketName', {
        value: sessionBucket.bucketName,
      });
    }
  }
}
