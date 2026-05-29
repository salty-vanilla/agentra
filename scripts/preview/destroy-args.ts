/**
 * Argument parsing for `pnpm preview:destroy`.
 *
 * Separate from `parseCommandArgs` (plan/deploy) because destroy needs a boolean
 * `--dry-run` flag and a `--confirm` value, and requires `--profile`. Pure and
 * side-effect free: returns a structured object; value-level validation (stage
 * pattern, profile, confirmation match) is delegated to `resolvePreviewConfig`
 * and `assertDestroyConfirmation`.
 *
 * The parser accepts an empty `--confirm=` value; rejecting empty / whitespace /
 * mismatched confirmation strings is the confirmation guard's job, not the
 * parser's, so there is a single source of truth for the confirmation policy.
 */

export interface RawDestroyArgs {
  stage: string;
  profile: string;
  confirm?: string;
  dryRun: boolean;
}

/** Long flags accepted by the destroy command (without the `--` prefix). */
const VALUE_FLAGS = new Set(['stage', 'profile', 'confirm']);
const BOOLEAN_FLAGS = new Set(['dry-run']);

function knownFlagList(): string {
  return [...VALUE_FLAGS, ...BOOLEAN_FLAGS].map((flag) => `--${flag}`).join(', ');
}

/**
 * Parse `--flag value` / `--flag=value` pairs and the boolean `--dry-run` from an
 * argv slice. Throws on unknown flags, missing values, positional arguments, or a
 * missing required `--stage` / `--profile`. Returns a new object; never mutates
 * the input.
 */
export function parseDestroyArgs(argv: readonly string[]): RawDestroyArgs {
  const values: Record<string, string> = {};
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(
        `Unexpected argument "${token}". Destroy takes --flag value pairs (${knownFlagList()}).`,
      );
    }

    const eqIndex = token.indexOf('=');
    const key = eqIndex !== -1 ? token.slice(2, eqIndex) : token.slice(2);

    if (BOOLEAN_FLAGS.has(key)) {
      if (eqIndex !== -1) {
        throw new Error(`Flag "--${key}" is a boolean and does not take a value.`);
      }
      dryRun = true;
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
  if (values.profile === undefined) {
    throw new Error(
      'Missing required flag "--profile". Destroy requires the preview profile ' +
        '(minimal-api | backend-ai | full) used for the original deploy.',
    );
  }

  const result: RawDestroyArgs = {
    stage: values.stage,
    profile: values.profile,
    dryRun,
  };
  if (values.confirm !== undefined) {
    result.confirm = values.confirm;
  }
  return result;
}
