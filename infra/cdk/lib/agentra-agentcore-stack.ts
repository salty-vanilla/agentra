import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnGateway } from 'aws-cdk-lib/aws-bedrockagentcore';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export class AgentraAgentCoreStack extends Stack {
  readonly gatewayId: string;
  readonly gatewayUrl: string;
  readonly gatewayArn: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const gatewayRole = new Role(this, 'AgentCoreGatewayRole', {
      assumedBy: new ServicePrincipal('bedrock-agentcore.amazonaws.com'),
      description: 'Service role for AgentCore Gateway.',
    });

    const gateway = new CfnGateway(this, 'AgentCoreGateway', {
      name: 'agentra-gateway',
      description: 'Agentra tool gateway for MCP targets.',
      roleArn: gatewayRole.roleArn,
      protocolType: 'MCP',
      authorizerType: 'AWS_IAM',
      tags: {
        Project: 'agentra',
        ManagedBy: 'cdk',
      },
    });

    this.gatewayId = gateway.attrGatewayIdentifier;
    this.gatewayUrl = gateway.attrGatewayUrl;
    this.gatewayArn = gateway.attrGatewayArn;

    new CfnOutput(this, 'AgentCoreGatewayId', { value: this.gatewayId });
    new CfnOutput(this, 'AgentCoreGatewayUrl', { value: this.gatewayUrl });
    new CfnOutput(this, 'AgentCoreGatewayArn', { value: this.gatewayArn });
  }
}
