import { type Agent, tool } from '@strands-agents/sdk';
import { createWebResearchAgent } from '../agents/web-research/agent.js';
import {
  buildWebResearchAgentHandoffPrompt,
  type WebResearchAgentHandoffInput,
  type WebResearchAgentHandoffOutput,
  webResearchAgentHandoffInputSchema,
  webResearchAgentHandoffOutputSchema,
} from '../agents/web-research/handoff.js';
import { errorMessage, toolSuccess } from './tool-response.js';

type WebResearchAgentLike = Pick<Agent, 'invoke'>;
type WebResearchAgentFactory = () => WebResearchAgentLike;

let cachedWebResearchAgent: WebResearchAgentLike | undefined;

function getWebResearchAgent(): WebResearchAgentLike {
  if (!cachedWebResearchAgent) {
    cachedWebResearchAgent = createWebResearchAgent();
  }

  return cachedWebResearchAgent;
}

function normalizeHandoffOutput(value: unknown): WebResearchAgentHandoffOutput {
  const parsed = webResearchAgentHandoffOutputSchema.safeParse(value);
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
    answer: 'Web Research Agent did not return a usable handoff payload.',
    metadata: {
      rawValueType: typeof value,
    },
  };
}

export async function executeInvokeWebResearchAgentTool(
  input: WebResearchAgentHandoffInput,
  dependencies: {
    agentFactory?: WebResearchAgentFactory | undefined;
  } = {},
) {
  try {
    const agent = dependencies.agentFactory
      ? dependencies.agentFactory()
      : getWebResearchAgent();
    const prompt = buildWebResearchAgentHandoffPrompt(input);
    const result = await agent.invoke(prompt, {
      structuredOutputSchema: webResearchAgentHandoffOutputSchema,
    });
    const output = normalizeHandoffOutput(result.structuredOutput ?? result.toString());

    return toolSuccess(output);
  } catch (error) {
    const message = errorMessage(error);

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

const invokeWebResearchAgentTool = tool({
  name: 'invoke_web_research_agent',
  description:
    'Delegate public, current, or external research questions to the Web Research Agent and return a normalized handoff payload.',
  inputSchema: webResearchAgentHandoffInputSchema,
  callback: (input) => executeInvokeWebResearchAgentTool(input),
});

export { invokeWebResearchAgentTool, normalizeHandoffOutput };
