/**
 * Argument parsing for `pnpm preview:smoke`.
 *
 * Pure and side-effect free: takes an argv slice and returns a structured,
 * validated-shape object. Value-level validation (stage pattern) is delegated
 * to `validatePreviewStage` in preview-stage.ts so guardrails live in one place.
 *
 * Unlike the standard preview commands, smoke accepts an explicit `--manifest`
 * path (defaulting to `.agentra/preview/<stage>/manifest.json`) and takes no
 * `--profile` — the preview profile is read from the manifest itself.
 */

/** Smoke depth: `core` runs only the cheap GET checks; `full` adds the heavy ones. */
export type SmokeMode = 'core' | 'full';

export const SMOKE_MODES: readonly SmokeMode[] = ['core', 'full'];
export const DEFAULT_SMOKE_MODE: SmokeMode = 'core';

export interface RawSmokeArgs {
  stage: string;
  manifest?: string;
  /**
   * Smoke depth. `core` (default) runs only `bff.health` / `bff.threads`. `full`
   * additionally runs the heavy checks (`bff.chatSse`, `agentcore.invoke`, and —
   * with `--with-log-correlation` — `bff.chatLogCorrelation`).
   */
  mode: SmokeMode;
  /** Opt-in: enable the CloudWatch Logs requestId correlation check (full mode). */
  withLogCorrelation: boolean;
}

/** Long flags that take a value (without the `--` prefix). */
const VALUE_FLAGS = new Set(['stage', 'manifest', 'mode']);
/** Long boolean flags that take no value (presence = `true`). */
const BOOLEAN_FLAGS = new Set(['with-log-correlation']);

function knownFlagList(): string {
  return [...VALUE_FLAGS, ...BOOLEAN_FLAGS].map((flag) => `--${flag}`).join(', ');
}

function isSmokeMode(value: string): value is SmokeMode {
  return (SMOKE_MODES as readonly string[]).includes(value);
}

/**
 * Parse `--flag value` / `--flag=value` pairs and boolean `--flag` switches from
 * an argv slice.
 *
 * Throws on unknown flags, missing values for value flags, positional arguments,
 * or a missing required `--stage`. Boolean flags (`--with-log-correlation`) take
 * no value; an explicit `--with-log-correlation=false` disables it. Returns a new
 * object; never mutates the input.
 */
export function parseSmokeArgs(argv: readonly string[]): RawSmokeArgs {
  const values: Record<string, string> = {};
  let withLogCorrelation = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(
        `Unexpected argument "${token}". preview:smoke takes --flag value pairs (${knownFlagList()}).`,
      );
    }

    const eqIndex = token.indexOf('=');
    const key = eqIndex !== -1 ? token.slice(2, eqIndex) : token.slice(2);

    if (BOOLEAN_FLAGS.has(key)) {
      withLogCorrelation = eqIndex !== -1 ? token.slice(eqIndex + 1) !== 'false' : true;
      continue;
    }

    if (!VALUE_FLAGS.has(key)) {
      throw new Error(`Unknown flag "--${key}". Known flags: ${knownFlagList()}.`);
    }

    let value: string;
    if (eqIndex !== -1) {
      value = token.slice(eqIndex + 1);
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Missing value for flag "--${key}".`);
      }
      value = next;
      i++;
    }
    values[key] = value;
  }

  if (values.stage === undefined) {
    throw new Error(`Missing required flag "--stage". Known flags: ${knownFlagList()}.`);
  }

  let mode: SmokeMode = DEFAULT_SMOKE_MODE;
  if (values.mode !== undefined) {
    if (!isSmokeMode(values.mode)) {
      throw new Error(
        `Invalid --mode "${values.mode}". Allowed: ${SMOKE_MODES.join(', ')}.`,
      );
    }
    mode = values.mode;
  }

  const result: RawSmokeArgs = { stage: values.stage, mode, withLogCorrelation };
  if (values.manifest !== undefined) {
    result.manifest = values.manifest;
  }
  return result;
}
