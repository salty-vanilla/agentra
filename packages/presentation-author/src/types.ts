import type { IconConfig, IconProvider, IconResultMetadata } from './icons/types.js';

export type PresentationLanguage = 'ja' | 'en';

export interface DiagnosticsOptions {
  render?: boolean | undefined;
  contactSheet?: boolean | undefined;
  overflow?: boolean | undefined;
  fonts?: boolean | undefined;
}

export interface PresentationAuthorInput {
  prompt: string;
  language?: PresentationLanguage | undefined;
  templatePath?: string | undefined;
  styleGuide?: string | undefined;
  outputDir?: string | undefined;
  timeoutMs?: number | undefined;
  diagnostics?: boolean | DiagnosticsOptions | undefined;
  revision?: boolean | RevisionOptions | undefined;
  brandFrameId?: string | undefined;
  icons?: IconConfig | undefined;
}

import type {
  PresentationDiagnosticsInput,
  PresentationDiagnosticsResult,
} from './diagnostics.js';

export interface RevisionOptions {
  enabled?: boolean | undefined;
}

export type RevisionAttemptReason =
  | 'disabled'
  | 'diagnostics-pass'
  | 'diagnostics-not-run'
  | 'revision-succeeded'
  | 'revision-generation-failed'
  | 'revision-validation-failed'
  | 'revision-execution-failed'
  | 'revision-output-missing';

export interface RevisionAttemptResult {
  attempted: boolean;
  succeeded: boolean;
  reason: RevisionAttemptReason;
  sourceJsPath?: string | undefined;
  pptxPath?: string | undefined;
  execution?: AuthoringScriptExecutionResult | undefined;
  diagnostics?: PresentationDiagnosticsResult | undefined;
  warnings: string[];
}

export interface PresentationAuthorResult {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
  warnings: string[];
  execution: AuthoringScriptExecutionResult;
  diagnostics?: PresentationDiagnosticsResult | undefined;
  revision?: RevisionAttemptResult | undefined;
  brandFrameId?: string | undefined;
  brandFrameName?: string | undefined;
  icons?: IconResultMetadata | undefined;
}

export interface AuthoringWorkspace {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
  helpersDir: string;
  scriptsDir: string;
  renderDir: string;
  artifactsDir: string;
  packageJsonPath: string;
}

export interface LlmClient {
  generateText(input: { system?: string | undefined; prompt: string }): Promise<string>;
}

export interface PresentationAuthorDeps {
  llm: LlmClient;
  iconProvider?: IconProvider | undefined;
  now?: (() => Date) | undefined;
  randomId?: (() => string) | undefined;
  runDiagnostics?: (
    input: PresentationDiagnosticsInput,
  ) => Promise<PresentationDiagnosticsResult>;
}

export interface AuthoringScriptExecutionResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut?: boolean | undefined;
  nodePathUsed?: string | undefined;
}
