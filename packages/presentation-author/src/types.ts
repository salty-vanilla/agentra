export type PresentationLanguage = 'ja' | 'en';

export interface PresentationAuthorInput {
  prompt: string;
  language?: PresentationLanguage | undefined;
  templatePath?: string | undefined;
  styleGuide?: string | undefined;
  outputDir?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface PresentationAuthorResult {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
  warnings: string[];
  execution: AuthoringScriptExecutionResult;
}

export interface AuthoringWorkspace {
  workDir: string;
  sourceJsPath: string;
  pptxPath: string;
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
}
