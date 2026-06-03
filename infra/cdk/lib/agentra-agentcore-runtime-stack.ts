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
import {
  deriveEnvironmentKind,
  type EnvironmentKind,
  isDestroyable,
} from './environment.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraAgentCoreRuntimeStackProps extends StackProps {
  stage: string;
  environmentKind?: EnvironmentKind;
  slideRuntimeArn?: string;
  slideRuntimeQualifier?: string;
  thirdPartyApiKeysSecretArn?: string;
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
    const environmentKind = props.environmentKind ?? deriveEnvironmentKind(props.stage);
    const normalizedStage = props.stage.replace(/[^a-zA-Z0-9_]/g, '_');
    const runtimeNameSuffix =
      normalizedStage.length > 0
        ? normalizedStage.charAt(0).toUpperCase() + normalizedStage.slice(1)
        : 'Default';
    const thirdPartyApiKeysSecretArn =
      props.thirdPartyApiKeysSecretArn ??
      this.node.tryGetContext('thirdPartyApiKeysSecretArn');
    if (!thirdPartyApiKeysSecretArn) {
      throw new Error(
        'thirdPartyApiKeysSecretArn must be provided via props or context (-c thirdPartyApiKeysSecretArn=...).' +
          ' The secret must be JSON with keys: TAVILY_API_KEY, PEXELS_API_KEY',
      );
    }

    const thirdPartyApiKeysSecret = Secret.fromSecretCompleteArn(
      this,
      'ThirdPartyApiKeysSecret',
      thirdPartyApiKeysSecretArn,
    );

    const runtimeRole = new Role(this, 'AgentCoreRuntimeExecutionRole', {
      assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Execution role for Agentra AgentCore Runtime.',
    });

    // Bedrock permissions scoped to inference profiles
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
    thirdPartyApiKeysSecret.grantRead(runtimeRole);

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
      directory: join(__dirname, '../../..'),
      file: 'apps/agentcore-runtime-ts/Dockerfile',
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
          actions: ['bedrock:Retrieve', 'bedrock:RetrieveAndGenerate'],
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
        removalPolicy: isDestroyable(environmentKind)
          ? RemovalPolicy.DESTROY
          : RemovalPolicy.RETAIN,
        autoDeleteObjects: isDestroyable(environmentKind),
        lifecycleRules: isDestroyable(environmentKind)
          ? [{ expiration: Duration.days(30) }]
          : [],
      });

      // Grant least-privilege S3 access scoped to session prefix
      runtimeRole.addToPolicy(
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'],
          resources: [`${sessionBucket.bucketArn}/${sessionS3Prefix}/*`],
        }),
      );
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
        TAVILY_API_KEY_SECRET_ID: thirdPartyApiKeysSecret.secretArn,
        PEXELS_API_KEY_SECRET_ID: thirdPartyApiKeysSecret.secretArn,
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

    const endpointName = 'prod';
    const endpoint = new CfnRuntimeEndpoint(this, 'AgentCoreRuntimeEndpoint', {
      agentRuntimeId: runtime.attrAgentRuntimeId,
      agentRuntimeVersion: runtime.attrAgentRuntimeVersion,
      name: endpointName,
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
    // AgentCore writes structured logs to
    // /aws/bedrock-agentcore/runtimes/<runtimeId>-<endpoint>. The service always
    // provisions a `-DEFAULT` group plus one per named endpoint, so surface both
    // as the SSOT for `preview:smoke --with-log-correlation` (manifest
    // `agentCoreLogGroupNames` -> SMOKE_CLOUDWATCH_LOG_GROUP_NAMES fallback).
    const logGroupPrefix = `/aws/bedrock-agentcore/runtimes/${this.runtimeId}`;
    new CfnOutput(this, 'AgentCoreLogGroupNames', {
      value: `${logGroupPrefix}-DEFAULT,${logGroupPrefix}-${endpointName}`,
    });
    new CfnOutput(this, 'ThirdPartyApiKeysSecretArn', {
      value: thirdPartyApiKeysSecret.secretArn,
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
