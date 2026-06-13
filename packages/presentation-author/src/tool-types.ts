import type { ArtifactRef } from '@agentra/shared';
import type { PresentationAuthorEngine } from './engine/types.js';
import type { IconConfig, IconResultMetadata } from './icons/types.js';
import type { ImageResultMetadata, PresentationImagesInput } from './images/types.js';

export type CreatePresentationLanguage = 'ja' | 'en';

export interface CreatePresentationToolInput {
  prompt: string;
  language?: CreatePresentationLanguage | undefined;
  traceId?: string | undefined;

  /**
   * Optional style guide text.
   * This can be plain text or markdown.
   */
  styleGuide?: string | undefined;

  /**
   * Optional path to a template PPTX.
   * Template analysis is not implemented yet, but this field is reserved.
   */
  templatePath?: string | undefined;

  /**
   * Optional output directory.
   * If omitted, a temp workspace is created.
   */
  outputDir?: string | undefined;

  /**
   * Enable diagnostics.
   * Default: true.
   */
  diagnostics?: boolean | undefined;

  /**
   * Enable one revision attempt.
   * Default: true.
   */
  revision?: boolean | undefined;

  /**
   * Script execution timeout in milliseconds.
   * Default uses existing package default.
   */
  timeoutMs?: number | undefined;

  /**
   * Optional BrandFrame ID for company template.
   * If omitted and brand frame is enabled, uses the default frame.
   */
  brandFrameId?: string | undefined;

  /**
   * Optional icon configuration.
   * If omitted, icons are enabled by default.
   */
  icons?: IconConfig | undefined;

  /**
   * Optional image asset configuration.
   * If omitted, images are disabled by default.
   */
  images?: PresentationImagesInput | undefined;

  /**
   * Optional authoring engine override.
   * Precedence: this field > `PRESENTATION_AUTHOR_ENGINE` env > default
   * (`agentra-pptxgenjs`). Omit to preserve existing behaviour.
   */
  engine?: PresentationAuthorEngine | undefined;
}

export type CreatePresentationArtifact = ArtifactRef;

export interface CreatePresentationToolOutput {
  success: boolean;

  /**
   * Human-readable compact summary for agent/user.
   */
  summary: string;

  /**
   * Engine that produced this result. Present on success.
   */
  engine?: PresentationAuthorEngine | undefined;

  workDir: string;
  pptxPath?: string | undefined;
  sourceJsPath?: string | undefined;
  contactSheetPath?: string | undefined;
  renderedSlidePaths?: string[] | undefined;

  /**
   * SDPM Workspace directory (sdpm-skill engine only). The runtime reads this to
   * sync the Deck Workspace and connect the deck preview (#446 / #448).
   */
  workspaceDir?: string | undefined;
  /** Path to the SDPM `deck.json` (sdpm-skill engine only). */
  deckJsonPath?: string | undefined;
  /** Paths to the SDPM `slides/{slug}.json` (sdpm-skill engine only). */
  slideJsonPaths?: string[] | undefined;

  diagnosticsStatus?: 'pass' | 'warn' | 'fail' | undefined;
  revisionAttempted?: boolean | undefined;
  revisionSucceeded?: boolean | undefined;
  revisionReason?: string | undefined;

  artifacts: CreatePresentationArtifact[];
  warnings: string[];

  brandFrameId?: string | undefined;
  brandFrameName?: string | undefined;

  icons?: IconResultMetadata | undefined;

  images?: ImageResultMetadata | undefined;

  /**
   * Error summary suitable for agent consumption.
   * Do not include huge stack traces.
   */
  error?:
    | {
        message: string;
        phase:
          | 'input-validation'
          | 'engine-selection'
          | 'llm-generation'
          | 'script-validation'
          | 'script-execution'
          | 'diagnostics'
          | 'revision'
          | 'unknown';
        details?: string | undefined;
      }
    | undefined;
}
