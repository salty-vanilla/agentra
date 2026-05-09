import { resolveBedrockKbStructuredRuntimeConfig } from './bedrock-kb-structured-config.js';
import type {
  BedrockStructuredPocCheck,
  BedrockStructuredPocCheckStatus,
  BedrockStructuredPocDiagnosticsInput,
  BedrockStructuredPocDiagnosticsOutput,
} from './bedrock-structured-poc-diagnostics-types.js';
import { runStructuredRagFlow } from './structured-rag-flow.js';

const DIAGNOSTICS_MARKER = 'bedrock-structured-poc-diagnostics-v1';

type CheckInput = {
  id: string;
  status: BedrockStructuredPocCheckStatus;
  message: string;
  details?: Record<string, unknown> | undefined;
};

function addCheck(checks: BedrockStructuredPocCheck[], input: CheckInput): void {
  checks.push({
    id: input.id,
    status: input.status,
    message: input.message,
    ...(input.details !== undefined ? { details: input.details } : {}),
  });
}

function uniqueActions(actions: string[]): string[] {
  return [...new Set(actions)];
}

function buildSummary(checks: BedrockStructuredPocCheck[]): string {
  const counts = checks.reduce(
    (acc, check) => {
      acc[check.status] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, unknown: 0 } as Record<
      BedrockStructuredPocCheckStatus,
      number
    >,
  );

  if (counts.fail > 0) {
    return `Diagnostics found ${counts.fail} blocking issue${counts.fail === 1 ? '' : 's'} and ${counts.warn} warning${counts.warn === 1 ? '' : 's'}.`;
  }

  if (counts.warn > 0) {
    return `Diagnostics passed with ${counts.warn} warning${counts.warn === 1 ? '' : 's'}.`;
  }

  if (counts.unknown > 0) {
    return `Diagnostics could not fully evaluate ${counts.unknown} check${counts.unknown === 1 ? '' : 's'}.`;
  }

  return 'Diagnostics passed with no warnings.';
}

function aggregateStatus(
  checks: BedrockStructuredPocCheck[],
): BedrockStructuredPocCheckStatus {
  if (checks.some((check) => check.status === 'fail')) {
    return 'fail';
  }

  if (checks.some((check) => check.status === 'warn')) {
    return 'warn';
  }

  if (checks.some((check) => check.status === 'unknown')) {
    return 'unknown';
  }

  return 'pass';
}

function buildEnvDetails(
  includeEnvValues: boolean,
  value: string | undefined,
): Record<string, unknown> {
  if (includeEnvValues) {
    return {
      value,
      present: value !== undefined,
    };
  }

  return {
    present: value !== undefined,
  };
}

function buildSampleStructuredQueryPlan() {
  return {
    id: 'bedrock-structured-poc-dry-run',
    createdAt: new Date('2026-05-09T00:00:00.000Z').toISOString(),
    intent: 'anomaly_summary' as const,
    dataSourceKind: 'bedrock_kb_structured' as const,
    question: 'temperature anomaly trend for line A',
    targetEntity: 'line A',
    metrics: ['average' as const],
    timeRange: {
      start: '2026-05-01',
      end: '2026-05-07',
    },
    confidence: 0.9,
    metadata: {
      targetSignals: ['temperature'],
    },
  };
}

export async function runBedrockStructuredPocDiagnostics(
  input: BedrockStructuredPocDiagnosticsInput = {},
): Promise<BedrockStructuredPocDiagnosticsOutput> {
  const includeEnvValues = input.includeEnvValues ?? false;
  const config = resolveBedrockKbStructuredRuntimeConfig();
  const checks: BedrockStructuredPocCheck[] = [];
  const nextActions: string[] = [];

  addCheck(checks, {
    id: 'runtime_mode',
    status:
      config.mode === 'live' && !config.liveEnabled
        ? 'fail'
        : config.mode === 'live'
          ? 'pass'
          : 'pass',
    message:
      config.mode === 'live'
        ? config.liveEnabled
          ? 'Live mode is enabled.'
          : 'Live mode is selected, but ENABLE_BEDROCK_KB_STRUCTURED_LIVE is disabled.'
        : `Runtime mode is ${config.mode}, which keeps live execution gated.`,
    details: buildEnvDetails(includeEnvValues, config.mode),
  });

  addCheck(checks, {
    id: 'region',
    status: config.region ? 'pass' : 'unknown',
    message: config.region
      ? `Resolved region is ${config.region}.`
      : 'Region could not be resolved.',
    details: buildEnvDetails(includeEnvValues, config.region),
  });

  if (config.knowledgeBaseId === undefined) {
    addCheck(checks, {
      id: 'knowledge_base_id',
      status: config.mode === 'live' ? 'fail' : 'warn',
      message:
        config.mode === 'live'
          ? 'BEDROCK_KB_STRUCTURED_ID is required for live mode.'
          : 'BEDROCK_KB_STRUCTURED_ID is missing, but stub and dry-run modes remain safe.',
      details: buildEnvDetails(includeEnvValues, config.knowledgeBaseId),
    });
    nextActions.push(
      'Set BEDROCK_KB_STRUCTURED_ID before enabling live structured execution.',
    );
  } else {
    addCheck(checks, {
      id: 'knowledge_base_id',
      status: 'pass',
      message: 'Bedrock Knowledge Base ID is configured.',
      details: buildEnvDetails(includeEnvValues, config.knowledgeBaseId),
    });
  }

  if (config.dataSourceName === undefined) {
    addCheck(checks, {
      id: 'data_source_name',
      status: 'warn',
      message: 'BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME is missing.',
      details: buildEnvDetails(includeEnvValues, config.dataSourceName),
    });
    nextActions.push(
      'Set BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME for clearer traceability.',
    );
  } else {
    addCheck(checks, {
      id: 'data_source_name',
      status: 'pass',
      message: 'Bedrock structured data source name is configured.',
      details: buildEnvDetails(includeEnvValues, config.dataSourceName),
    });
  }

  if (!config.liveEnabled) {
    addCheck(checks, {
      id: 'live_flag',
      status: config.mode === 'live' ? 'fail' : 'pass',
      message:
        config.mode === 'live'
          ? 'ENABLE_BEDROCK_KB_STRUCTURED_LIVE must be true for live mode.'
          : 'Live execution remains disabled, which is safe for local modes.',
      details: buildEnvDetails(includeEnvValues, String(config.liveEnabled)),
    });
    if (config.mode === 'live') {
      nextActions.push(
        'Set ENABLE_BEDROCK_KB_STRUCTURED_LIVE=true only after the live KB and Redshift values are ready.',
      );
    }
  } else {
    addCheck(checks, {
      id: 'live_flag',
      status: 'pass',
      message: 'Live execution flag is enabled.',
      details: buildEnvDetails(includeEnvValues, String(config.liveEnabled)),
    });
  }

  if (config.redshiftServerlessWorkgroupName === undefined) {
    addCheck(checks, {
      id: 'redshift_workgroup',
      status: 'warn',
      message: 'REDSHIFT_SERVERLESS_WORKGROUP_NAME is missing.',
      details: buildEnvDetails(includeEnvValues, config.redshiftServerlessWorkgroupName),
    });
    nextActions.push('Set REDSHIFT_SERVERLESS_WORKGROUP_NAME before live mode.');
  } else {
    addCheck(checks, {
      id: 'redshift_workgroup',
      status: 'pass',
      message: 'Redshift Serverless workgroup is configured.',
      details: buildEnvDetails(includeEnvValues, config.redshiftServerlessWorkgroupName),
    });
  }

  if (config.redshiftDatabaseName === undefined) {
    addCheck(checks, {
      id: 'redshift_database',
      status: 'warn',
      message: 'REDSHIFT_DATABASE_NAME is missing.',
      details: buildEnvDetails(includeEnvValues, config.redshiftDatabaseName),
    });
    nextActions.push('Set REDSHIFT_DATABASE_NAME before live mode.');
  } else {
    addCheck(checks, {
      id: 'redshift_database',
      status: 'pass',
      message: 'Redshift database is configured.',
      details: buildEnvDetails(includeEnvValues, config.redshiftDatabaseName),
    });
  }

  if (input.runDryFlow === true) {
    try {
      const dryFlowOutput = await runStructuredRagFlow({
        plan: buildSampleStructuredQueryPlan(),
        mode: 'readiness_only',
        validateAgainstCatalog: true,
        bedrockStructuredEnabled: false,
        allowMock: false,
        createBrief: false,
        metadata: {
          diagnostics: DIAGNOSTICS_MARKER,
        },
      });

      addCheck(checks, {
        id: 'dry_flow',
        status: dryFlowOutput.status === 'error' ? 'fail' : 'pass',
        message: `Dry flow completed with status ${dryFlowOutput.status}.`,
        details: {
          status: dryFlowOutput.status,
          nextAction: dryFlowOutput.nextAction,
        },
      });
    } catch (error) {
      addCheck(checks, {
        id: 'dry_flow',
        status: 'fail',
        message: `Dry flow smoke test failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      nextActions.push(
        'Investigate the structured RAG readiness path before enabling live mode.',
      );
    }
  } else {
    nextActions.push(
      'Run diagnostics with runDryFlow=true to exercise the readiness path.',
    );
  }

  if (input.runMockFlow === true) {
    try {
      const mockFlowOutput = await runStructuredRagFlow({
        plan: {
          id: 'bedrock-structured-poc-mock-run',
          createdAt: new Date('2026-05-09T00:00:00.000Z').toISOString(),
          intent: 'anomaly_summary',
          dataSourceKind: 'mock',
          question: 'temperature anomaly trend for line A',
          targetEntity: 'line A',
          metrics: ['average'],
          timeRange: {
            start: '2026-05-01',
            end: '2026-05-07',
          },
          confidence: 0.9,
          metadata: {
            targetSignals: ['temperature'],
          },
        },
        mode: 'execute_if_ready',
        preferredProvider: 'mock',
        validateAgainstCatalog: true,
        allowMock: true,
        createBrief: false,
        metadata: {
          diagnostics: DIAGNOSTICS_MARKER,
        },
      });

      addCheck(checks, {
        id: 'mock_flow',
        status: mockFlowOutput.status === 'executed' ? 'pass' : 'fail',
        message: `Mock flow completed with status ${mockFlowOutput.status}.`,
        details: {
          status: mockFlowOutput.status,
          nextAction: mockFlowOutput.nextAction,
        },
      });
    } catch (error) {
      addCheck(checks, {
        id: 'mock_flow',
        status: 'fail',
        message: `Mock flow smoke test failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      nextActions.push('Investigate the mock structured RAG execution path.');
    }
  } else {
    nextActions.push('Run diagnostics with runMockFlow=true to verify mock execution.');
  }

  const status = aggregateStatus(checks);

  if (status === 'warn') {
    nextActions.push(
      'Use stub or dry-run modes until live Bedrock and Redshift settings are complete.',
    );
  }

  if (status === 'pass') {
    nextActions.push(
      'The Bedrock structured KB + Redshift PoC is ready for the next validation step.',
    );
  }

  return {
    status,
    checks,
    summary: buildSummary(checks),
    nextActions: uniqueActions(nextActions),
    metadata: {
      ...input.metadata,
      diagnostics: DIAGNOSTICS_MARKER,
      mode: config.mode,
      liveEnabled: config.liveEnabled,
      ...(includeEnvValues
        ? {
            config: {
              knowledgeBaseId: config.knowledgeBaseId,
              region: config.region,
              dataSourceName: config.dataSourceName,
              redshiftServerlessWorkgroupName: config.redshiftServerlessWorkgroupName,
              redshiftDatabaseName: config.redshiftDatabaseName,
            },
          }
        : {}),
    },
  };
}
