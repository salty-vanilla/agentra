/**
 * Argument parsing for `pnpm preview:cleanup`.
 *
 * Cleanup is account-wide and defaults to safe dry-run reporting. The mode is
 * selected by the boolean flags `--dry-run` (default) and `--execute`; supplying
 * both is an error. `--stage` optionally scopes the run to a single preview stage
 * and `--confirm` gates destructive `--execute`.
 *
 * Pure and side-effect free: value-level validation (stage pattern, confirmation
 * match) is delegated to `validatePreviewStage` and `assertCleanupConfirmation`.
 */

export interface RawCleanupArgs {
  mode: 'dry-run' | 'execute';
  stage?: string;
  confirm?: string;
}

/** Long flags accepted by the cleanup command (without the `--` prefix). */
const VALUE_FLAGS = new Set(['stage', 'confirm']);
const BOOLEAN_FLAGS = new Set(['dry-run', 'execute']);

function knownFlagList(): string {
  return [...VALUE_FLAGS, ...BOOLEAN_FLAGS].map((flag) => `--${flag}`).join(', ');
}

/**
 * Parse `--flag value` / `--flag=value` pairs and the boolean `--dry-run` /
 * `--execute` from an argv slice. Throws on unknown flags, missing values,
 * positional arguments, or supplying both mode flags. Defaults to `dry-run` when
 * neither mode flag is present. Returns a new object; never mutates the input.
 */
export function parseCleanupArgs(argv: readonly string[]): RawCleanupArgs {
  const values: Record<string, string> = {};
  let dryRun = false;
  let execute = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(
        `Unexpected argument "${token}". Cleanup takes --flag value pairs (${knownFlagList()}).`,
      );
    }

    const eqIndex = token.indexOf('=');
    const key = eqIndex !== -1 ? token.slice(2, eqIndex) : token.slice(2);

    if (BOOLEAN_FLAGS.has(key)) {
      if (eqIndex !== -1) {
        throw new Error(`Flag "--${key}" is a boolean and does not take a value.`);
      }
      if (key === 'dry-run') {
        dryRun = true;
      } else {
        execute = true;
      }
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

  if (dryRun && execute) {
    throw new Error(
      'Flags "--dry-run" and "--execute" are mutually exclusive. ' +
        'Omit both for the default dry-run, or pass exactly one.',
    );
  }

  const result: RawCleanupArgs = { mode: execute ? 'execute' : 'dry-run' };
  if (values.stage !== undefined) {
    result.stage = values.stage;
  }
  if (values.confirm !== undefined) {
    result.confirm = values.confirm;
  }
  return result;
}
