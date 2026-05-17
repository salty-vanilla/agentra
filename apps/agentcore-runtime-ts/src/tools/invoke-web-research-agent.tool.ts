import { type Agent, type AgentResult, tool } from '@strands-agents/sdk';
import { normalizeSubAgentHandoffOutput } from '../agents/handoff-normalizer.js';
import { createWebResearchAgent } from '../agents/web-research/agent.js';
import {
  buildWebResearchAgentHandoffPrompt,
  type WebResearchAgentHandoffInput,
  type WebResearchAgentHandoffOutput,
  webResearchAgentHandoffInputSchema,
  webResearchAgentHandoffOutputSchema,
} from '../agents/web-research/handoff.js';
import type { SubAgentProgressEvent } from './invoke-manufacturing-line-agent.tool.js';
import { errorMessage, toolSuccess } from './tool-response.js';

type WebResearchAgentLike = Pick<Agent, 'invoke' | 'stream'>;
type WebResearchAgentFactory = () => WebResearchAgentLike;

let cachedWebResearchAgent: WebResearchAgentLike | undefined;

function getWebResearchAgent(): WebResearchAgentLike {
  if (!cachedWebResearchAgent) {
    cachedWebResearchAgent = createWebResearchAgent();
  }

  return cachedWebResearchAgent;
}

function buildHandoffOutput(
  result: AgentResult,
  input: WebResearchAgentHandoffInput,
): WebResearchAgentHandoffOutput {
  return normalizeSubAgentHandoffOutput({
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
}

const NOT_CONFIGURED_PATTERNS = ['TAVILY_API_KEY_SECRET_ID', 'TAVILY_API_KEY_SSM_NAME'];

function classifyError(message: string): 'not_configured' | 'error' {
  return NOT_CONFIGURED_PATTERNS.some((p) => message.includes(p))
    ? 'not_configured'
    : 'error';
}

const ERROR_USER_ANSWERS: Record<'not_configured' | 'error', string> = {
  not_configured:
    'Web検索機能が未設定のため、現在この依頼を処理できません。管理者に設定確認を依頼してください。',
  error: 'Web Research Agentの処理中にエラーが発生しました。',
};

function buildErrorOutput(
  rawMessage: string,
  input: WebResearchAgentHandoffInput,
): WebResearchAgentHandoffOutput {
  const detectedStatus = classifyError(rawMessage);
  const handoffMode = input.freshnessRequired ? 'freshness_required' : 'standard';
  return {
    status: detectedStatus,
    agentKind: 'web_research',
    agentName: 'Web Research Agent',
    handoffMode,
    answer: ERROR_USER_ANSWERS[detectedStatus],
    metadata: {
      parentAgent: 'router-agent',
      childAgent: 'web-research-agent',
      handoffTool: 'invoke_web_research_agent',
      handoffMode,
      rawValueType: 'undefined',
      rawError: rawMessage,
    },
  };
}

export async function* streamInvokeWebResearchAgentTool(
  input: WebResearchAgentHandoffInput,
  dependencies: {
    agentFactory?: WebResearchAgentFactory | undefined;
  } = {},
): AsyncGenerator<
  SubAgentProgressEvent,
  { status: 'success' | 'error'; content: [{ text: string }] },
  never
> {
  try {
    const agent = dependencies.agentFactory
      ? dependencies.agentFactory()
      : getWebResearchAgent();
    const prompt = buildWebResearchAgentHandoffPrompt(input);
    const agentStream = agent.stream(prompt, {
      structuredOutputSchema: webResearchAgentHandoffOutputSchema,
    });

    const toolStarts = new Map<string, { name: string; startedAt: number }>();
    let currentInputTokens: number | undefined;

    while (true) {
      const { value, done } = await agentStream.next();
      if (done) {
        const output = buildHandoffOutput(value, input);
        return { status: 'success', content: [{ text: JSON.stringify(output) }] };
      }

      const event = value;

      if (
        event.type === 'modelStreamUpdateEvent' &&
        event.event.type === 'modelMetadataEvent' &&
        event.event.usage?.inputTokens !== undefined
      ) {
        currentInputTokens = event.event.usage.inputTokens;
        continue;
      }

      if (
        event.type === 'modelStreamUpdateEvent' &&
        event.event.type === 'modelContentBlockStartEvent' &&
        event.event.start?.type === 'toolUseStart'
      ) {
        const { toolUseId, name } = event.event.start;
        toolStarts.set(toolUseId, { name, startedAt: Date.now() });
        yield {
          stage: name,
          status: 'running',
          ...(currentInputTokens !== undefined
            ? { inputTokens: currentInputTokens }
            : {}),
        };
      } else if (
        event.type === 'contentBlockEvent' &&
        event.contentBlock.type === 'toolUseBlock'
      ) {
        const { toolUseId, name } = event.contentBlock;
        if (!toolStarts.has(toolUseId)) {
          toolStarts.set(toolUseId, { name, startedAt: Date.now() });
          yield {
            stage: name,
            status: 'running',
            ...(currentInputTokens !== undefined
              ? { inputTokens: currentInputTokens }
              : {}),
          };
        }
      } else if (event.type === 'toolResultEvent') {
        const start = toolStarts.get(event.result.toolUseId);
        toolStarts.delete(event.result.toolUseId);
        const stageName = start?.name ?? 'unknown';
        const durationMs = start ? Date.now() - start.startedAt : undefined;
        yield {
          stage: stageName,
          status:
            event.result.status === 'error' ? ('error' as const) : ('complete' as const),
          ...(durationMs !== undefined ? { durationMs } : {}),
          ...(currentInputTokens !== undefined
            ? { inputTokens: currentInputTokens }
            : {}),
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = buildErrorOutput(message, input);
    // Return success so the Router reads the error reason from content
    // rather than treating it as a transient tool failure to retry.
    return { status: 'success', content: [{ text: JSON.stringify(output) }] };
  }
}

export async function executeInvokeWebResearchAgentTool(
  input: WebResearchAgentHandoffInput,
  dependencies: {
    agentFactory?: (() => Pick<Agent, 'invoke'>) | undefined;
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
    return toolSuccess(buildHandoffOutput(result, input));
  } catch (error) {
    const message = errorMessage(error);
    const output = buildErrorOutput(message, input);
    // Return toolSuccess so the Router reads the error reason from content
    // rather than treating it as a transient failure to retry.
    return toolSuccess(output);
  }
}

const invokeWebResearchAgentTool = tool({
  name: 'invoke_web_research_agent',
  description:
    'Delegate public, current, or external research questions to the Web Research Agent and return a normalized handoff payload.',
  inputSchema: webResearchAgentHandoffInputSchema,
  callback: (input) => streamInvokeWebResearchAgentTool(input),
});

export { invokeWebResearchAgentTool };
