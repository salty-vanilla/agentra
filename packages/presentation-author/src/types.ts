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
}

import type { PresentationDiagnosticsResult } from './diagnostics.js';

export interface PresentationAuthorResult {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
  warnings: string[];
  execution: AuthoringScriptExecutionResult;
  diagnostics?: PresentationDiagnosticsResult | undefined;
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
  now?: (() => Date) | undefined;
  randomId?: (() => string) | undefined;
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
