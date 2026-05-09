export type KbRagDiagnosticsCheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export type KbRagDiagnosticsCheck = {
  id: string;
  status: KbRagDiagnosticsCheckStatus;
  message: string;
  details?: Record<string, unknown> | undefined;
};

export type KbRagDiagnosticsInput = {
  includeEnvValues?: boolean | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export type KbRagDiagnosticsOutput = {
  status: KbRagDiagnosticsCheckStatus;
  checks: KbRagDiagnosticsCheck[];
  summary: string;
  nextActions: string[];
  metadata?: Record<string, unknown> | undefined;
};
