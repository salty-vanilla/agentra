import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnAgent, CfnAgentAlias } from 'aws-cdk-lib/aws-bedrock';
import { Effect, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
} from 'aws-cdk-lib/custom-resources';
import type { Construct } from 'constructs';

export const BEDROCK_MODELS = {
  opus: 'us.anthropic.claude-opus-4-6-v1',
  sonnet: 'us.anthropic.claude-sonnet-4-6',
  haiku: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
} as const;

export type BedrockModelKey = keyof typeof BEDROCK_MODELS;

const AGENT_INSTRUCTION =
  'あなたは製造ラインのサポートアシスタントです。' +
  'オペレーターからの質問に対して、正確かつ簡潔な日本語で回答してください。' +
  '技術的な内容も分かりやすく説明し、必要に応じて手順を示してください。';

export class AgentraBedrockStack extends Stack {
  readonly agentIds: Record<BedrockModelKey, string>;
  readonly agentAliasIds: Record<BedrockModelKey, string>;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const bedrockAgentRole = new Role(this, 'BedrockAgentRole', {
      assumedBy: new ServicePrincipal('bedrock.amazonaws.com'),
    });

    bedrockAgentRole.addToPolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
        resources: ['*'],
      }),
    );

    bedrockAgentRole.addToPolicy(
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

    const makeAgent = (idSuffix: string, profileId: string) =>
      new CfnAgent(this, `BedrockAgent${idSuffix}`, {
        agentName: `agentra-${idSuffix.toLowerCase()}`,
        agentResourceRoleArn: bedrockAgentRole.roleArn,
        foundationModel: profileId,
        instruction: AGENT_INSTRUCTION,
        idleSessionTtlInSeconds: 1800,
      });

    const makeAlias = (idSuffix: string, agent: CfnAgent) =>
      new CfnAgentAlias(this, `BedrockAgentAlias${idSuffix}`, {
        agentId: agent.attrAgentId,
        agentAliasName: 'latest',
      });

    const makePrepare = (idSuffix: string, agent: CfnAgent) => {
      const resource = new AwsCustomResource(this, `PrepareAgent${idSuffix}`, {
        installLatestAwsSdk: true,
        onCreate: {
          service: 'BedrockAgent',
          action: 'prepareAgent',
          parameters: { agentId: agent.attrAgentId },
          physicalResourceId: PhysicalResourceId.fromResponse('agentId'),
        },
        onUpdate: {
          service: 'BedrockAgent',
          action: 'prepareAgent',
          parameters: { agentId: agent.attrAgentId },
          physicalResourceId: PhysicalResourceId.fromResponse('agentId'),
        },
        policy: AwsCustomResourcePolicy.fromStatements([
          new PolicyStatement({
            actions: ['bedrock:PrepareAgent'],
            resources: [
              `arn:aws:bedrock:${Stack.of(this).region}:${Stack.of(this).account}:agent/${agent.attrAgentId}`,
            ],
          }),
        ]),
      });
      resource.node.addDependency(agent);
      return resource;
    };

    const opusAgent = makeAgent('Opus', BEDROCK_MODELS.opus);
    const sonnetAgent = makeAgent('Sonnet', BEDROCK_MODELS.sonnet);
    const haikuAgent = makeAgent('Haiku', BEDROCK_MODELS.haiku);

    makePrepare('Opus', opusAgent);
    makePrepare('Sonnet', sonnetAgent);
    makePrepare('Haiku', haikuAgent);

    const opusAlias = makeAlias('Opus', opusAgent);
    const sonnetAlias = makeAlias('Sonnet', sonnetAgent);
    const haikuAlias = makeAlias('Haiku', haikuAgent);

    this.agentIds = {
      opus: opusAgent.attrAgentId,
      sonnet: sonnetAgent.attrAgentId,
      haiku: haikuAgent.attrAgentId,
    };

    this.agentAliasIds = {
      opus: opusAlias.attrAgentAliasId,
      sonnet: sonnetAlias.attrAgentAliasId,
      haiku: haikuAlias.attrAgentAliasId,
    };

    new CfnOutput(this, 'BedrockAgentIdOpus', { value: this.agentIds.opus });
    new CfnOutput(this, 'BedrockAgentAliasIdOpus', { value: this.agentAliasIds.opus });
    new CfnOutput(this, 'BedrockAgentIdSonnet', { value: this.agentIds.sonnet });
    new CfnOutput(this, 'BedrockAgentAliasIdSonnet', {
      value: this.agentAliasIds.sonnet,
    });
    new CfnOutput(this, 'BedrockAgentIdHaiku', { value: this.agentIds.haiku });
    new CfnOutput(this, 'BedrockAgentAliasIdHaiku', { value: this.agentAliasIds.haiku });
  }
}
