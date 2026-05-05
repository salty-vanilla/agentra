import type { IconConfig, IconProvider, IconResultMetadata } from './icons/types.js';
import type {
  ImageGenerationProvider,
  ImageResultMetadata,
  ImageRetrievalProvider,
  PresentationImagesInput,
} from './images/types.js';

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
  images?: PresentationImagesInput | undefined;
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
  images?: ImageResultMetadata | undefined;
  imageAssetPaths?: string[] | undefined;
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

// ---------------------------------------------------------------------------
// LLM Client — supports optional tool_use loop
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type ToolHandler = (input: unknown) => Promise<unknown>;

export interface LlmConverseInput {
  system?: string | undefined;
  prompt: string;
  tools?: ToolDefinition[] | undefined;
  toolHandlers?: Record<string, ToolHandler> | undefined;
  maxToolIterations?: number | undefined;
}

export interface LlmClient {
  converse(input: LlmConverseInput): Promise<string>;
}

export interface PresentationAuthorDeps {
  llm: LlmClient;
  iconProvider?: IconProvider | undefined;
  imageRetrievalProvider?: ImageRetrievalProvider | undefined;
  imageGenerationProvider?: ImageGenerationProvider | undefined;
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
