import type {
  StructuredPlanNextAction,
  StructuredPlanReadinessInput,
  StructuredPlanReadinessResult,
  StructuredPlanReadinessStatus,
  StructuredProviderPath,
  StructuredQueryPlanValidationIssue,
  StructuredQueryPlanValidationResult,
} from './structured-plan-readiness-types.js';
import {
  STRUCTURED_QUERY_CAPABILITY_CATALOG,
  type StructuredQueryCatalogIntent,
} from './structured-query-capability-catalog.js';
import type { StructuredQueryPlan } from './structured-query-types.js';

function trimText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (values === undefined) {
    return [];
  }

  const deduped = new Set<string>();
  for (const value of values) {
    const trimmed = trimText(value);
    if (trimmed) {
      deduped.add(trimmed);
    }
  }

  return [...deduped];
}

function normalizeValidationIssue(
  issue: StructuredQueryPlanValidationIssue,
): StructuredQueryPlanValidationIssue {
  return {
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    ...(issue.path !== undefined ? { path: issue.path } : {}),
    ...(issue.details !== undefined ? { details: issue.details } : {}),
  };
}

function buildMissingSlotIssues(
  missingSlots: string[],
): StructuredQueryPlanValidationIssue[] {
  return missingSlots.map((slot) => ({
    severity: 'error' as const,
    code: 'missing_slot',
    message: `Missing required slot: ${slot}.`,
    details: { slot },
  }));
}

function resolvePreferredProvider(
  plan: StructuredQueryPlan,
  preferredProvider: StructuredProviderPath | undefined,
): StructuredProviderPath {
  if (preferredProvider !== undefined) {
    return preferredProvider;
  }

  switch (plan.dataSourceKind) {
    case 'bedrock_kb_structured':
      return 'bedrock_kb_structured';
    case 'mock':
      return 'mock';
    default:
      return 'unknown';
  }
}

function normalizeValidation(
  plan: StructuredQueryPlan,
  validation: StructuredPlanReadinessInput['validation'],
): StructuredQueryPlanValidationResult {
  if (validation !== undefined) {
    return {
      valid: validation.valid,
      issues: validation.issues.map(normalizeValidationIssue),
      ...(validation.metadata !== undefined ? { metadata: validation.metadata } : {}),
    };
  }

  return validateStructuredQueryPlanAgainstCatalog(plan);
}

function buildValidationIssues(
  plan: StructuredQueryPlan,
  validation: StructuredQueryPlanValidationResult,
): {
  missingSlots: string[];
  blockingIssues: StructuredQueryPlanValidationIssue[];
  warnings: StructuredQueryPlanValidationIssue[];
} {
  const missingSlots = normalizeStringArray(plan.missingSlots);
  const missingSlotIssues = buildMissingSlotIssues(missingSlots);
  const normalizedIssues = validation.issues.map(normalizeValidationIssue);
  const blockingIssues = [
    ...missingSlotIssues,
    ...normalizedIssues.filter((issue) => issue.severity === 'error'),
  ];
  const warnings = normalizedIssues.filter((issue) => issue.severity === 'warning');

  return {
    missingSlots,
    blockingIssues,
    warnings,
  };
}

function determinePlanSupport(
  input: StructuredPlanReadinessInput,
  blockingIssues: StructuredQueryPlanValidationIssue[],
): {
  status: StructuredPlanReadinessStatus;
  nextAction: StructuredPlanNextAction;
  executable: boolean;
} {
  if (blockingIssues.length > 0) {
    return {
      status: 'needs_clarification',
      nextAction: 'ask_follow_up',
      executable: false,
    };
  }

  switch (input.preferredProvider ?? resolvePreferredProvider(input.plan, undefined)) {
    case 'bedrock_kb_structured':
      if (!input.bedrockStructuredEnabled) {
        return {
          status: 'not_configured',
          nextAction: 'inspect_catalog',
          executable: false,
        };
      }

      return {
        status: 'ready',
        nextAction: 'execute_bedrock_structured',
        executable: true,
      };
    case 'mock':
      if (!input.allowMock) {
        return {
          status: 'not_configured',
          nextAction: 'ask_follow_up',
          executable: false,
        };
      }

      return {
        status: 'ready',
        nextAction: 'execute_mock',
        executable: true,
      };
    case 'athena_query_generator_future':
      if (!input.queryGeneratorEnabled) {
        return {
          status: 'unsupported',
          nextAction: 'not_supported',
          executable: false,
        };
      }

      return {
        status: 'ready',
        nextAction: 'inspect_catalog',
        executable: false,
      };
    default:
      return {
        status: 'unsupported',
        nextAction: 'not_supported',
        executable: false,
      };
  }
}

function buildRationale(
  input: StructuredPlanReadinessInput,
  options: {
    recommendedProvider: StructuredProviderPath;
    status: StructuredPlanReadinessStatus;
    nextAction: StructuredPlanNextAction;
    blockingIssues: StructuredQueryPlanValidationIssue[];
  },
): string[] {
  const rationale: string[] = [];
  const missingSlots = normalizeStringArray(input.plan.missingSlots);

  if (missingSlots.length > 0) {
    rationale.push(`Plan has missing slots: ${missingSlots.join(', ')}.`);
  }

  for (const issue of options.blockingIssues) {
    if (issue.code !== 'missing_slot') {
      rationale.push(issue.message);
    }
  }

  if (options.status === 'needs_clarification' && rationale.length === 0) {
    rationale.push('Plan needs clarification before structured execution.');
  }

  switch (options.recommendedProvider) {
    case 'bedrock_kb_structured':
      if (options.status === 'ready') {
        rationale.push('Plan is ready for Bedrock structured execution.');
      } else if (options.status === 'not_configured') {
        rationale.push('Bedrock structured provider is preferred but not enabled.');
      }
      break;
    case 'mock':
      if (options.status === 'ready') {
        rationale.push('Plan is ready for mock execution.');
      } else if (options.status === 'not_configured') {
        rationale.push('Mock execution is disabled.');
      }
      break;
    case 'athena_query_generator_future':
      if (options.status === 'unsupported') {
        rationale.push('Future QueryGenerator provider is not enabled.');
      } else if (options.status === 'ready') {
        rationale.push(
          'Future QueryGenerator provider is enabled, but this phase does not execute it.',
        );
      }
      break;
    case 'unknown':
      if (options.status === 'unsupported') {
        rationale.push('No supported provider path is available for this plan.');
      }
      break;
  }

  if (options.nextAction === 'ask_follow_up' && rationale.length === 0) {
    rationale.push('Ask a follow-up question to resolve the missing information.');
  }

  return rationale;
}

export function validateStructuredQueryPlanAgainstCatalog(
  plan: StructuredQueryPlan,
): StructuredQueryPlanValidationResult {
  const issues: StructuredQueryPlanValidationIssue[] = [];
  const intent = plan.intent as
    | StructuredQueryCatalogIntent
    | 'generic_lookup'
    | 'unknown';
  const capability =
    STRUCTURED_QUERY_CAPABILITY_CATALOG[intent as StructuredQueryCatalogIntent];

  if (intent === 'generic_lookup' || intent === 'unknown') {
    issues.push({
      severity: 'warning',
      code: 'unsupported_intent',
      message: `Intent ${intent} is not a structured execution target.`,
    });
  } else if (capability === undefined) {
    issues.push({
      severity: 'error',
      code: 'unsupported_intent',
      message: `Intent ${intent} is not supported by the structured query capability catalog.`,
    });
  }

  for (const missingSlot of normalizeStringArray(plan.missingSlots)) {
    issues.push({
      severity: 'error',
      code: 'missing_slot',
      message: `Missing required slot: ${missingSlot}.`,
      details: { slot: missingSlot },
    });
  }

  if (plan.dataSourceKind === 'unknown') {
    issues.push({
      severity: 'warning',
      code: 'unknown_provider',
      message: 'Data source kind is unknown; provider selection may need clarification.',
    });
  }

  return {
    valid: issues.every((issue) => issue.severity !== 'error'),
    issues,
    metadata: {
      validator: 'structured-plan-readiness-v1',
    },
  };
}

export function evaluateStructuredPlanReadiness(
  input: StructuredPlanReadinessInput,
): StructuredPlanReadinessResult {
  const validation = normalizeValidation(input.plan, input.validation);
  const { missingSlots, blockingIssues, warnings } = buildValidationIssues(
    input.plan,
    validation,
  );
  const recommendedProvider = resolvePreferredProvider(
    input.plan,
    input.preferredProvider,
  );
  const decision = determinePlanSupport(input, blockingIssues);
  const rationale = buildRationale(input, {
    recommendedProvider,
    status: decision.status,
    nextAction: decision.nextAction,
    blockingIssues,
  });

  return {
    status: decision.status,
    recommendedProvider,
    nextAction: decision.nextAction,
    executable: decision.executable,
    missingSlots,
    blockingIssues,
    warnings,
    rationale,
    plan: input.plan,
    metadata: {
      ...input.metadata,
      evaluator: 'structured-plan-readiness-v1',
      recommendedProvider,
      status: decision.status,
      executable: decision.executable,
    },
  };
}
