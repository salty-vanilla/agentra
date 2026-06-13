// Invokes the vendored SDPM Skill (aws-samples/sample-spec-driven-presentation-maker,
// MIT-0) `pptx_builder.py` to turn an SDPM Deck Workspace into a PPTX (#442 / #448).
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPythonScript } from '../python-runner.js';

/** Env var pointing at the vendored SDPM skill root (contains `scripts/`, `sdpm/`). */
export const SDPM_SKILL_DIR_ENV = 'SDPM_SKILL_DIR';

const DEFAULT_GENERATE_TIMEOUT_MS = 120_000;

/** Resolve the SDPM skill directory from the environment (null when unset). */
export function resolveSdpmSkillDir(env: NodeJS.ProcessEnv = process.env): string | null {
  const dir = env[SDPM_SKILL_DIR_ENV]?.trim();
  return dir ? dir : null;
}

/** A single slide in the materialized workspace spec. */
export interface SdpmWorkspaceSlideSpec {
  slug: string;
  /** Outline message (the audience change). Goes into `specs/outline.md`. */
  message: string;
  /** The SDPM slide JSON (`{layout, notes?, elements:[...]}`). */
  json: Record<string, unknown>;
}

/** A complete SDPM Deck Workspace, ready to be written to disk. */
export interface SdpmWorkspaceSpec {
  /** deck.json contents (template/fonts/defaultTextColor). */
  deck: Record<string, unknown>;
  brief?: string | undefined;
  artDirectionHtml?: string | undefined;
  slides: SdpmWorkspaceSlideSpec[];
}

/**
 * Write an {@link SdpmWorkspaceSpec} to disk in the SDPM Deck Workspace layout
 * (`deck.json`, `specs/{brief,outline}.md`, `specs/art-direction.html`,
 * `slides/{slug}.json`). Returns the resolved file paths.
 */
export async function materializeSdpmWorkspace(
  dir: string,
  spec: SdpmWorkspaceSpec,
): Promise<{ deckJsonPath: string; slideJsonPaths: string[] }> {
  await mkdir(join(dir, 'specs'), { recursive: true });
  await mkdir(join(dir, 'slides'), { recursive: true });

  const deckJsonPath = join(dir, 'deck.json');
  await writeFile(deckJsonPath, `${JSON.stringify(spec.deck, null, 2)}\n`, 'utf-8');

  const outline = `${spec.slides.map((s) => `- [${s.slug}] ${s.message}`).join('\n')}\n`;
  await writeFile(join(dir, 'specs', 'outline.md'), outline, 'utf-8');
  await writeFile(join(dir, 'specs', 'brief.md'), spec.brief ?? '', 'utf-8');
  if (spec.artDirectionHtml) {
    await writeFile(
      join(dir, 'specs', 'art-direction.html'),
      spec.artDirectionHtml,
      'utf-8',
    );
  }

  const slideJsonPaths: string[] = [];
  for (const slide of spec.slides) {
    const path = join(dir, 'slides', `${slide.slug}.json`);
    await writeFile(path, `${JSON.stringify(slide.json, null, 2)}\n`, 'utf-8');
    slideJsonPaths.push(path);
  }

  return { deckJsonPath, slideJsonPaths };
}

export interface RunSdpmGenerateInput {
  /** SDPM workspace directory (deck.json + specs/ + slides/). */
  workspaceDir: string;
  /** Output PPTX path. */
  pptxPath: string;
  /** SDPM skill directory; defaults to {@link resolveSdpmSkillDir}. */
  skillDir?: string | undefined;
  timeoutMs?: number | undefined;
}

export interface RunSdpmGenerateResult {
  success: boolean;
  pptxPath: string | null;
  warnings: string[];
  stdout: string;
  stderr: string;
}

export type RunSdpmGenerateFn = (
  input: RunSdpmGenerateInput,
) => Promise<RunSdpmGenerateResult>;

/**
 * Run `pptx_builder.py generate <workspaceDir> -o <pptxPath>` against the
 * vendored SDPM skill. Degrades (never throws) to `success: false` with a
 * warning when the skill is unavailable or the subprocess fails — the caller can
 * then fall back or surface a clear error.
 */
export async function runSdpmGenerate(
  input: RunSdpmGenerateInput,
): Promise<RunSdpmGenerateResult> {
  const skillDir = input.skillDir ?? resolveSdpmSkillDir();
  if (!skillDir) {
    return {
      success: false,
      pptxPath: null,
      warnings: [`SDPM skill directory not configured (set ${SDPM_SKILL_DIR_ENV})`],
      stdout: '',
      stderr: '',
    };
  }

  const scriptPath = join(skillDir, 'scripts', 'pptx_builder.py');
  const result = await runPythonScript({
    scriptPath,
    args: ['generate', input.workspaceDir, '-o', input.pptxPath],
    cwd: skillDir,
    timeoutMs: input.timeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS,
  });

  if (!result.success) {
    return {
      success: false,
      pptxPath: null,
      warnings: [
        `SDPM generate failed (exit ${result.exitCode ?? 'null'}${
          result.timedOut ? ', timed out' : ''
        })`,
      ],
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  return {
    success: true,
    pptxPath: input.pptxPath,
    warnings: [],
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
