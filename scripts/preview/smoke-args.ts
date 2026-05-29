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

export interface RawSmokeArgs {
  stage: string;
  manifest?: string;
}

/** Long flags accepted by `preview:smoke` (without the `--` prefix). */
const KNOWN_FLAGS = new Set(['stage', 'manifest']);

function knownFlagList(): string {
  return [...KNOWN_FLAGS].map((flag) => `--${flag}`).join(', ');
}

/**
 * Parse `--flag value` / `--flag=value` pairs from an argv slice.
 *
 * Throws on unknown flags, missing values, positional arguments, or a missing
 * required `--stage`. Returns a new object; never mutates the input.
 */
export function parseSmokeArgs(argv: readonly string[]): RawSmokeArgs {
  const values: Record<string, string> = {};

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
    let key: string;
    let value: string;

    if (eqIndex !== -1) {
      key = token.slice(2, eqIndex);
      value = token.slice(eqIndex + 1);
    } else {
      key = token.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        throw new Error(`Missing value for flag "--${key}".`);
      }
      value = next;
      i++;
    }

    if (!KNOWN_FLAGS.has(key)) {
      throw new Error(`Unknown flag "--${key}". Known flags: ${knownFlagList()}.`);
    }
    values[key] = value;
  }

  if (values.stage === undefined) {
    throw new Error(`Missing required flag "--stage". Known flags: ${knownFlagList()}.`);
  }

  const result: RawSmokeArgs = { stage: values.stage };
  if (values.manifest !== undefined) {
    result.manifest = values.manifest;
  }
  return result;
}
