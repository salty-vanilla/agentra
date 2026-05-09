export type BedrockStructuredPocCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export type BedrockStructuredPocCheck = {
  id: string;
  status: BedrockStructuredPocCheckStatus;
  message: string;
  details?: Record<string, unknown> | undefined;
};

export type BedrockStructuredPocDiagnosticsInput = {
  includeEnvValues?: boolean | undefined;
  runDryFlow?: boolean | undefined;
  runMockFlow?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type BedrockStructuredPocDiagnosticsOutput = {
  status: BedrockStructuredPocCheckStatus;
  checks: BedrockStructuredPocCheck[];
  summary: string;
  nextActions: string[];
  metadata?: Record<string, unknown> | undefined;
};
