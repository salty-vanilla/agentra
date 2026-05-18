import { type Agent, type AgentResult, tool } from '@strands-agents/sdk';
import { normalizeSubAgentHandoffOutput } from '../agents/handoff-normalizer.js';
import type { SubAgentHandoffMetadataSummary } from '../agents/handoff-types.js';
import {
  createWebResearchAgent,
  resolveWebResearchModelId,
} from '../agents/web-research/agent.js';
import {
  buildWebResearchAgentHandoffPrompt,
  type WebResearchAgentHandoffInput,
  type WebResearchAgentHandoffOutput,
  webResearchAgentHandoffInputSchema,
  webResearchAgentHandoffOutputSchema,
} from '../agents/web-research/handoff.js';
import type { SubAgentProgressEvent } from './invoke-manufacturing-line-agent.tool.js';
import { errorMessage, toolSuccess } from './tool-response.js';
import type { WebResearchToolOutput } from './web-research.tool.js';

type WebResearchAgentLike = Pick<Agent, 'invoke' | 'stream'>;
type WebResearchAgentFactory = () => WebResearchAgentLike;

let cachedWebResearchAgent: WebResearchAgentLike | undefined;

type WebResearchDeterministicArtifacts = {
  query?: string;
  sources: unknown[];
  citations: unknown[];
  brief?: unknown;
  rawResultSummary?: WebResearchToolOutput['rawResultSummary'];
};

function getWebResearchAgent(): WebResearchAgentLike {
  if (!cachedWebResearchAgent) {
    cachedWebResearchAgent = createWebResearchAgent();
  }

  return cachedWebResearchAgent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function parseStructuredContent(content: unknown): unknown[] {
  if (typeof content === 'string') {
    const parsed = parseJsonText(content);
    return parsed === undefined ? [] : [parsed];
  }

  if (Array.isArray(content)) {
    return content.flatMap((entry) => parseStructuredContent(entry));
  }

  if (!isRecord(content)) {
    return [];
  }

  const parsedNodes: unknown[] = [content];
  if (typeof content.text === 'string') {
    const parsed = parseJsonText(content.text);
    if (parsed !== undefined) {
      parsedNodes.push(parsed);
    }
  }
  if ('json' in content) {
    parsedNodes.push(...parseStructuredContent(content.json));
  }
  if ('content' in content) {
    parsedNodes.push(...parseStructuredContent(content.content));
  }

  return parsedNodes;
}

function extractWebResearchToolOutput(
  content: unknown,
): WebResearchDeterministicArtifacts | undefined {
  for (const candidate of parseStructuredContent(content)) {
    if (!isRecord(candidate)) {
      continue;
    }

    if (!Array.isArray(candidate.sources) || !Array.isArray(candidate.citations)) {
      continue;
    }

    const output: WebResearchDeterministicArtifacts = {
      sources: candidate.sources,
      citations: candidate.citations,
    };

    if (typeof candidate.query === 'string') {
      output.query = candidate.query;
    }
    if ('brief' in candidate) {
      output.brief = candidate.brief;
    }
    if (isRecord(candidate.rawResultSummary)) {
      output.rawResultSummary = {
        resultCount:
          typeof candidate.rawResultSummary.resultCount === 'number'
            ? candidate.rawResultSummary.resultCount
            : candidate.sources.length,
        hasAnswer: Boolean(candidate.rawResultSummary.hasAnswer),
        hasRawContent: Boolean(candidate.rawResultSummary.hasRawContent),
      };
    }

    return output;
  }

  return undefined;
}

function getSourceId(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return undefined;
  }

  const trimmed = value.id.trim();
  return trimmed ? trimmed : undefined;
}

function getCitationSourceId(value: unknown): string | undefined {
  if (!isRecord(value) || typeof value.sourceId !== 'string') {
    return undefined;
  }

  const trimmed = value.sourceId.trim();
  return trimmed ? trimmed : undefined;
}

function uniqueSourceIds(ids: Iterable<string | undefined>): string[] {
  const unique = new Set<string>();

  for (const id of ids) {
    if (typeof id !== 'string') {
      continue;
    }

    const trimmed = id.trim();
    if (trimmed) {
      unique.add(trimmed);
    }
  }

  return [...unique];
}

function buildMetadataSummary(
  artifacts: WebResearchDeterministicArtifacts | undefined,
): SubAgentHandoffMetadataSummary | undefined {
  if (!artifacts) {
    return {
      selectedModelId: resolveWebResearchModelId(),
    };
  }

  const summary: SubAgentHandoffMetadataSummary = {
    selectedModelId: resolveWebResearchModelId(),
    sourceCount: artifacts.sources.length,
    citationCount: artifacts.citations.length,
  };

  if (artifacts.query) {
    summary.query = artifacts.query;
  }

  if (artifacts.rawResultSummary) {
    summary.resultCount = artifacts.rawResultSummary.resultCount;
    summary.hasAnswer = artifacts.rawResultSummary.hasAnswer;
    summary.hasRawContent = artifacts.rawResultSummary.hasRawContent;
  }

  return summary;
}

function mergeDeterministicArtifacts(
  output: WebResearchAgentHandoffOutput,
  artifacts: WebResearchDeterministicArtifacts | undefined,
): WebResearchAgentHandoffOutput {
  const metadataSummary = {
    ...(output.metadataSummary ?? {}),
    ...(buildMetadataSummary(artifacts) ?? {}),
  };

  if (!artifacts) {
    return Object.keys(metadataSummary).length > 0
      ? { ...output, metadataSummary }
      : output;
  }

  const requestedSourceIds = uniqueSourceIds(
    output.usedSourceIds ??
      (Array.isArray(output.sources)
        ? output.sources.map((source) => getSourceId(source))
        : []),
  );
  const sourceIdSet =
    requestedSourceIds.length > 0 ? new Set(requestedSourceIds) : undefined;

  const sources = sourceIdSet
    ? artifacts.sources.filter((source) => {
        const sourceId = getSourceId(source);
        return sourceId !== undefined && sourceIdSet.has(sourceId);
      })
    : artifacts.sources;
  const citations = sourceIdSet
    ? artifacts.citations.filter((citation) => {
        const sourceId = getCitationSourceId(citation);
        return sourceId !== undefined && sourceIdSet.has(sourceId);
      })
    : artifacts.citations;
  const effectiveSources =
    sourceIdSet && sources.length === 0 ? artifacts.sources : sources;
  const effectiveCitations =
    sourceIdSet && sources.length === 0 ? artifacts.citations : citations;
  const fellBackToAllEvidence = sourceIdSet !== undefined && sources.length === 0;
  const usedSourceIds =
    requestedSourceIds.length > 0 && !fellBackToAllEvidence
      ? requestedSourceIds
      : uniqueSourceIds(effectiveSources.map((source) => getSourceId(source)));

  return {
    ...output,
    usedSourceIds: usedSourceIds.length > 0 ? usedSourceIds : output.usedSourceIds,
    sources: effectiveSources,
    citations: effectiveCitations,
    ...(artifacts.brief !== undefined ? { brief: artifacts.brief } : {}),
    ...(Object.keys(metadataSummary).length > 0 ? { metadataSummary } : {}),
  };
}

function buildHandoffOutput(
  result: AgentResult,
  input: WebResearchAgentHandoffInput,
  artifacts?: WebResearchDeterministicArtifacts,
): WebResearchAgentHandoffOutput {
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

  return mergeDeterministicArtifacts(output, artifacts);
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
    metadataSummary: {
      selectedModelId: resolveWebResearchModelId(),
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
    let latestResearchArtifacts: WebResearchDeterministicArtifacts | undefined;

    while (true) {
      const { value, done } = await agentStream.next();
      if (done) {
        const output = buildHandoffOutput(value, input, latestResearchArtifacts);
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
        if (event.result.status !== 'error' && stageName === 'web_research') {
          latestResearchArtifacts =
            extractWebResearchToolOutput(event.result.content) ?? latestResearchArtifacts;
        }
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
