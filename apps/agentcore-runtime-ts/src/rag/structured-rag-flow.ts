import { BedrockKbStructuredProvider } from './bedrock-kb-structured-provider.js';
import { MockStructuredQueryProvider } from './mock-structured-query-provider.js';
import { StructuredQueryExecutor } from './structured-query-executor.js';
import { createStructuredQueryPlan } from './structured-query-planner.js';
import {
  evaluateStructuredPlanReadiness,
  validateStructuredQueryPlanAgainstCatalog,
} from './structured-plan-readiness.js';
import type {
  StructuredRagFlowInput,
  StructuredRagFlowOutput,
} from './structured-rag-flow-types.js';
import type { StructuredProviderPath } from './structured-plan-readiness-types.js';

const FLOW_METADATA_MARKER = 'structured-rag-flow-v1';

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
  input: StructuredRagFlowInput,
): { plan: StructuredRagFlowOutput['plan']; source: 'plan' | 'planInput' | 'question' } {
  if (input.plan !== undefined) {
    return { plan: input.plan, source: 'plan' };
  }

  if (input.planInput !== undefined) {
    return {
      plan: createStructuredQueryPlan(input.planInput),
      source: 'planInput',
    };
  }

  const question = trimText(input.question);
  if (question !== undefined) {
    return {
      plan: createStructuredQueryPlan({ question }),
      source: 'question',
    };
  }

  throw new Error('Structured RAG flow requires a plan, planInput, or question.');
}

function resolveValidation(
  plan: StructuredRagFlowOutput['plan'],
  validateAgainstCatalog: boolean | undefined,
) {
  if (validateAgainstCatalog === false) {
    return undefined;
  }

  return validateStructuredQueryPlanAgainstCatalog(plan);
}

function canExecuteProvider(provider: StructuredProviderPath, input: StructuredRagFlowInput) {
  switch (provider) {
    case 'bedrock_kb_structured':
      return input.bedrockStructuredEnabled === true;
    case 'mock':
      return input.allowMock === true;
    case 'athena_query_generator_future':
    case 'unknown':
      return false;
  }
}

async function executePlan(
  provider: StructuredProviderPath,
  input: StructuredRagFlowInput,
  plan: StructuredRagFlowOutput['plan'],
): Promise<StructuredRagFlowOutput['execution']> {
  const executor =
    provider === 'mock'
      ? new StructuredQueryExecutor(new MockStructuredQueryProvider())
      : new StructuredQueryExecutor(new BedrockKbStructuredProvider());

  return executor.execute({
    plan,
    createBrief: input.createBrief,
    metadata: mergeFlowMetadata(input.metadata),
  });
}

export async function runStructuredRagFlow(
  input: StructuredRagFlowInput,
): Promise<StructuredRagFlowOutput> {
  const mode = input.mode ?? 'execute_if_ready';
  const resolved = resolvePlan(input);
  const metadata = mergeFlowMetadata(input.metadata);
  const messages: string[] = [
    resolved.source === 'plan' ? 'Structured query plan accepted.' : 'Structured query plan created.',
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

  const validation = resolveValidation(resolved.plan, input.validateAgainstCatalog);
  messages.push(
    validation !== undefined ? 'Plan validation completed.' : 'Plan validation skipped.',
  );

  if (mode === 'validate_only') {
    return {
      status: 'validated',
      plan: resolved.plan,
      validation,
      nextAction: 'review_validation',
      messages,
      metadata,
    };
  }

  const readiness = evaluateStructuredPlanReadiness({
    plan: resolved.plan,
    validation,
    skipCatalogValidation: input.validateAgainstCatalog === false,
    preferredProvider: input.preferredProvider,
    allowMock: input.allowMock,
    bedrockStructuredEnabled: input.bedrockStructuredEnabled,
    queryGeneratorEnabled: input.queryGeneratorEnabled,
    metadata,
  });
  messages.push('Plan readiness evaluated.');

  if (
    readiness.recommendedProvider === 'athena_query_generator_future' ||
    readiness.recommendedProvider === 'unknown'
  ) {
    return {
      status: 'unsupported',
      plan: resolved.plan,
      validation,
      readiness,
      nextAction: 'not_supported',
      messages,
      metadata,
    };
  }

  if (mode === 'readiness_only') {
    return {
      status: readiness.status,
      plan: resolved.plan,
      validation,
      readiness,
      nextAction: readiness.nextAction,
      messages,
      metadata,
    };
  }

  if (!readiness.executable) {
    return {
      status: readiness.status,
      plan: resolved.plan,
      validation,
      readiness,
      nextAction: readiness.nextAction,
      messages,
      metadata,
    };
  }

  const provider = readiness.recommendedProvider;
  if (!canExecuteProvider(provider, input)) {
    return {
      status:
        provider === 'bedrock_kb_structured' && input.bedrockStructuredEnabled !== true
          ? 'not_configured'
          : provider === 'mock' && input.allowMock !== true
            ? 'not_configured'
            : 'unsupported',
      plan: resolved.plan,
      validation,
      readiness,
      nextAction: readiness.nextAction,
      messages,
      metadata,
    };
  }

  const execution = await executePlan(provider, input, resolved.plan);
  messages.push(
    provider === 'mock'
      ? 'Mock execution completed.'
      : 'Bedrock structured execution completed.',
  );

  return {
    status: 'executed',
    plan: resolved.plan,
    validation,
    readiness,
    execution,
    nextAction: 'review_results',
    messages,
    metadata,
  };
}
