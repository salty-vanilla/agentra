import { type Agent, tool } from '@strands-agents/sdk';
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

function normalizeHandoffOutput(value: unknown): ManufacturingLineAgentHandoffOutput {
  const parsed = manufacturingLineAgentHandoffOutputSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }

  if (typeof value === 'string' && value.trim()) {
    return {
      status: 'success',
      answer: value.trim(),
    };
  }

  return {
    status: 'error',
    answer: 'Manufacturing Line Agent did not return a usable handoff payload.',
    metadata: {
      rawValueType: typeof value,
    },
  };
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
    const output = normalizeHandoffOutput(result.structuredOutput ?? result.toString());

    return {
      status: 'success' as const,
      content: [{ text: JSON.stringify(output) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: 'error' as const,
      content: [
        {
          text: JSON.stringify({
            status: 'error',
            answer: '',
            error: {
              message,
            },
          }),
        },
      ],
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

export { invokeManufacturingLineAgentTool, normalizeHandoffOutput };
