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
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentraAgentCoreRuntimeStackProps extends StackProps {
  stage: string;
  slideRuntimeArn?: string;
  slideRuntimeQualifier?: string;
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
    const tavilyApiKeyParam = new CfnParameter(this, 'TavilyApiKey', {
      type: 'String',
      noEcho: true,
      description: 'Tavily API key for runtime web search tools.',
    });

    const tavilyApiKeySecret = new Secret(this, 'TavilyApiKeySecret', {
      secretName: `agentra/${props.stage}/tavily-api-key`,
      description: `Tavily API key for Agentra ${props.stage} runtime.`,
      secretObjectValue: {
        TAVILY_API_KEY: SecretValue.cfnParameter(tavilyApiKeyParam),
      },
    });

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
  }
}
