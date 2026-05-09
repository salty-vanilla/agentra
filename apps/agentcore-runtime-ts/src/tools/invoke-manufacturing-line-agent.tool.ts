import { type Agent, tool } from '@strands-agents/sdk';
import { normalizeSubAgentHandoffOutput } from '../agents/handoff-normalizer.js';
import { createManufacturingLineAgent } from '../agents/manufacturing-line/agent.js';
import {
  buildManufacturingLineAgentHandoffPrompt,
  type ManufacturingLineAgentHandoffInput,
  type ManufacturingLineAgentHandoffOutput,
  manufacturingLineAgentHandoffInputSchema,
  manufacturingLineAgentHandoffOutputSchema,
} from '../agents/manufacturing-line/handoff.js';

type ManufacturingLineAgentLike = Pick<Agent, 'invoke'>;
type ManufacturingLineAgentFactory = () => ManufacturingLineAgentLike;

let cachedManufacturingLineAgent: ManufacturingLineAgentLike | undefined;

function getManufacturingLineAgent(): ManufacturingLineAgentLike {
  if (!cachedManufacturingLineAgent) {
    cachedManufacturingLineAgent = createManufacturingLineAgent();
  }

  return cachedManufacturingLineAgent;
}

export async function executeInvokeManufacturingLineAgentTool(
  input: ManufacturingLineAgentHandoffInput,
  dependencies: {
    agentFactory?: ManufacturingLineAgentFactory | undefined;
  } = {},
) {
  try {
    const agent = dependencies.agentFactory
      ? dependencies.agentFactory()
      : getManufacturingLineAgent();
    const prompt = buildManufacturingLineAgentHandoffPrompt(input);
    const result = await agent.invoke(prompt, {
      structuredOutputSchema: manufacturingLineAgentHandoffOutputSchema,
    });
    const output = normalizeSubAgentHandoffOutput({
      value: result.structuredOutput ?? result.toString(),
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      handoffMode: input.mode ?? 'auto',
      fallbackErrorMessage:
        'Manufacturing Line Agent did not return a usable handoff payload.',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
        handoffMode: input.mode ?? 'auto',
      },
    }) as ManufacturingLineAgentHandoffOutput;

    return {
      status: 'success' as const,
      content: [{ text: JSON.stringify(output) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = normalizeSubAgentHandoffOutput({
      value: undefined,
      agentKind: 'manufacturing_line',
      agentName: 'Manufacturing Line Agent',
      handoffMode: input.mode ?? 'auto',
      fallbackErrorMessage: message,
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'manufacturing-line-agent',
        handoffTool: 'invoke_manufacturing_line_agent',
        handoffMode: input.mode ?? 'auto',
      },
    }) as ManufacturingLineAgentHandoffOutput;

    return {
      status: 'error' as const,
      content: [{ text: JSON.stringify(output) }],
    };
  }
}

const invokeManufacturingLineAgentTool = tool({
  name: 'invoke_manufacturing_line_agent',
  description:
    'Delegate manufacturing-line questions to the Manufacturing Line Agent and return a normalized handoff payload.',
  inputSchema: manufacturingLineAgentHandoffInputSchema,
  callback: (input) => executeInvokeManufacturingLineAgentTool(input),
});

export { invokeManufacturingLineAgentTool };
