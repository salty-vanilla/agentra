import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CfnOutput, CfnResource, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnRuntime, CfnRuntimeEndpoint } from 'aws-cdk-lib/aws-bedrockagentcore';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export class AgentraAgentCoreRuntimeStack extends Stack {
  readonly runtimeArn: string;
  readonly runtimeId: string;
  readonly runtimeVersion: string;
  readonly endpointArn: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

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

    runtimeRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:GetInferenceProfile', 'bedrock:ListInferenceProfiles', 'bedrock:UseInferenceProfile'],
        resources: ['*'],
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
        actions: ['ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchCheckLayerAvailability'],
        resources: [runtimeImageAsset.repository.repositoryArn],
      }),
    );

    const runtime = new CfnRuntime(this, 'AgentCoreRuntime', {
      agentRuntimeName: 'agentraRuntime',
      description: 'Agentra TypeScript AgentCore Runtime (Strands).',
      roleArn: runtimeRole.roleArn,
      protocolConfiguration: 'HTTP',
      networkConfiguration: {
        networkMode: 'PUBLIC',
      },
      environmentVariables: {
        BEDROCK_REGION: Stack.of(this).region,
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
  }
}
