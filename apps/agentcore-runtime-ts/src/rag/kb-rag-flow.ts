import { BedrockKbRetrieveProvider } from './bedrock-kb-retrieve-provider.js';
import { createKbQueryPlan } from './kb-query-planning.js';
import type { KbQueryPlan } from './kb-query-planning-types.js';
import type {
  KbRagFlowInput,
  KbRagFlowOutput,
  KbRagFlowStatus,
} from './kb-rag-flow-types.js';
import { evaluateKbRetrievalReadiness } from './kb-retrieval-readiness.js';
import type { KbRetrievalReadinessResult } from './kb-retrieval-readiness-types.js';
import { RagService } from './rag-service.js';
import type { RagSearchInput } from './types.js';

const FLOW_METADATA_MARKER = 'kb-rag-flow-v1';

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function mergeFlowMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    flow: FLOW_METADATA_MARKER,
  };
}

function resolvePlan(
  input: KbRagFlowInput,
  dependencies: KbRagFlowDependencies,
): {
  plan: KbQueryPlan;
  source: 'plan' | 'planInput' | 'query';
} {
  const planFactory = dependencies.planFactory ?? createKbQueryPlan;

  if (input.plan !== undefined) {
    return {
      plan: input.plan,
      source: 'plan',
    };
  }

  if (input.planInput !== undefined) {
    return {
      plan: planFactory(input.planInput),
      source: 'planInput',
    };
  }

  const query = trimText(input.query);
  if (query !== undefined) {
    return {
      plan: planFactory({ query }),
      source: 'query',
    };
  }

  throw new Error('KB RAG flow requires a plan, planInput, or query.');
}

function resolveReadiness(
  plan: KbQueryPlan,
  input: KbRagFlowInput,
  dependencies: KbRagFlowDependencies,
): KbRetrievalReadinessResult {
  const readinessEvaluator =
    dependencies.readinessEvaluator ?? evaluateKbRetrievalReadiness;

  return readinessEvaluator({
    plan,
    kbRetrieveEnabled: input.kbRetrieveEnabled,
    knowledgeBaseConfigured: resolveKnowledgeBaseConfigured(input),
    allowWebFallback: input.allowWebFallback,
    metadata: mergeFlowMetadata(input.metadata),
  });
}

function resolveKnowledgeBaseConfigured(input: KbRagFlowInput): boolean | undefined {
  if (input.knowledgeBaseConfigured !== undefined) {
    return input.knowledgeBaseConfigured;
  }

  return trimText(process.env.BEDROCK_KB_ID) !== undefined;
}

function createDefaultService(): Pick<RagService, 'search'> {
  const knowledgeBaseId = trimText(process.env.BEDROCK_KB_ID);
  if (!knowledgeBaseId) {
    throw new Error('knowledgeBaseId must be configured before KB retrieval.');
  }

  return new RagService(
    new BedrockKbRetrieveProvider({
      knowledgeBaseId,
      region: process.env.BEDROCK_KB_REGION ?? process.env.AWS_REGION,
    }),
  );
}

function resolveRetrievalInput(plan: KbQueryPlan, input: KbRagFlowInput): RagSearchInput {
  return {
    query: plan.query,
    topK: plan.topK,
    ...(input.createBrief !== undefined ? { createBrief: input.createBrief } : {}),
    ...(plan.scoreThreshold !== undefined ? { scoreThreshold: plan.scoreThreshold } : {}),
    ...(plan.queryRewriteHint !== undefined
      ? { queryRewriteHint: plan.queryRewriteHint }
      : {}),
    metadata: mergeFlowMetadata(input.metadata),
  };
}

function buildNextAction(
  status: KbRagFlowStatus,
  readiness?: KbRetrievalReadinessResult,
) {
  if (status === 'planned') {
    return 'review_plan';
  }

  if (status === 'ready') {
    return 'retrieve_kb';
  }

  if (status === 'retrieved' || status === 'answer_ready') {
    return 'review_results';
  }

  if (readiness !== undefined) {
    return readiness.nextAction;
  }

  if (status === 'error') {
    return 'inspect_error';
  }

  return 'review_readiness';
}

export type KbRagFlowDependencies = {
  planFactory?: typeof createKbQueryPlan | undefined;
  readinessEvaluator?: typeof evaluateKbRetrievalReadiness | undefined;
  serviceFactory?: () => Pick<RagService, 'search'>;
};

export async function runKbRagFlow(
  input: KbRagFlowInput,
  dependencies: KbRagFlowDependencies = {},
): Promise<KbRagFlowOutput> {
  const mode = input.mode ?? 'retrieve_if_ready';
  const resolved = resolvePlan(input, dependencies);
  const metadata = mergeFlowMetadata(input.metadata);
  const messages: string[] = [
    resolved.source === 'plan' ? 'KB RAG plan accepted.' : 'KB RAG plan created.',
  ];

  if (mode === 'plan_only') {
    return {
      status: 'planned',
      plan: resolved.plan,
      nextAction: 'review_plan',
      messages,
      metadata,
    };
  }

  const readiness = resolveReadiness(resolved.plan, input, dependencies);
  messages.push('KB retrieval readiness evaluated.');

  if (mode === 'readiness_only') {
    return {
      status: readiness.status,
      plan: resolved.plan,
      readiness,
      nextAction: buildNextAction(readiness.status, readiness),
      messages,
      metadata,
    };
  }

  if (!readiness.executable || readiness.status !== 'ready') {
    return {
      status: readiness.status,
      plan: resolved.plan,
      readiness,
      nextAction: buildNextAction(readiness.status, readiness),
      messages,
      metadata,
    };
  }

  try {
    const service = dependencies.serviceFactory?.() ?? createDefaultService();
    const retrieval = await service.search(resolveRetrievalInput(resolved.plan, input));
    messages.push('KB retrieval completed.');

    return {
      status: 'retrieved',
      plan: resolved.plan,
      readiness,
      retrieval,
      nextAction: 'review_results',
      messages,
      metadata,
    };
  } catch (error) {
    messages.push(
      error instanceof Error
        ? error.message
        : 'KB retrieval failed with an unknown error.',
    );

    return {
      status: 'error',
      plan: resolved.plan,
      readiness,
      nextAction: 'inspect_error',
      messages,
      metadata,
    };
  }
}
