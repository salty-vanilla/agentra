import { type Agent, tool } from '@strands-agents/sdk';
import { normalizeSubAgentHandoffOutput } from '../agents/handoff-normalizer.js';
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
    const output = normalizeSubAgentHandoffOutput({
      value: result.structuredOutput ?? result.toString(),
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: input.freshnessRequired ? 'freshness_required' : 'standard',
      fallbackErrorMessage: 'Web Research Agent did not return a usable handoff payload.',
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        handoffMode: input.freshnessRequired ? 'freshness_required' : 'standard',
      },
    }) as WebResearchAgentHandoffOutput;

    return toolSuccess(output);
  } catch (error) {
    const message = errorMessage(error);
    const output = normalizeSubAgentHandoffOutput({
      value: undefined,
      agentKind: 'web_research',
      agentName: 'Web Research Agent',
      handoffMode: input.freshnessRequired ? 'freshness_required' : 'standard',
      fallbackErrorMessage: message,
      metadata: {
        parentAgent: 'router-agent',
        childAgent: 'web-research-agent',
        handoffTool: 'invoke_web_research_agent',
        handoffMode: input.freshnessRequired ? 'freshness_required' : 'standard',
      },
    }) as WebResearchAgentHandoffOutput;

    return {
      status: 'error' as const,
      content: [{ text: JSON.stringify(output) }],
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

export { invokeWebResearchAgentTool };
