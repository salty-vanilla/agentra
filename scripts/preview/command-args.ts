/**
 * Argument parsing for the local preview CLI commands.
 *
 * Pure and side-effect free: takes an argv slice and returns a structured,
 * validated-shape object. Value-level validation (stage pattern, profile,
 * TTL bounds) is delegated to `resolvePreviewConfig` in preview-stage.ts so
 * there is a single source of truth for guardrails.
 */

export interface RawCommandArgs {
  stage: string;
  profile?: string;
  ttlHours?: number;
  owner?: string;
  source?: string;
}

/** Long flags accepted by the preview commands (without the `--` prefix). */
const KNOWN_FLAGS = new Set(['stage', 'profile', 'ttl-hours', 'owner', 'source']);

function knownFlagList(): string {
  return [...KNOWN_FLAGS].map((flag) => `--${flag}`).join(', ');
}

/**
 * Parse `--flag value` / `--flag=value` pairs from an argv slice.
 *
 * Throws on unknown flags, missing values, positional arguments, or a missing
 * required `--stage`. Returns a new object; never mutates the input.
 */
export function parseCommandArgs(argv: readonly string[]): RawCommandArgs {
  const values: Record<string, string> = {};

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) {
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(
        `Unexpected argument "${token}". Preview commands take --flag value pairs (${knownFlagList()}).`,
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

  const result: RawCommandArgs = { stage: values.stage };
  if (values.profile !== undefined) {
    result.profile = values.profile;
  }
  if (values.owner !== undefined) {
    result.owner = values.owner;
  }
  if (values.source !== undefined) {
    result.source = values.source;
  }
  if (values['ttl-hours'] !== undefined) {
    const parsed = Number(values['ttl-hours']);
    if (!Number.isFinite(parsed)) {
      throw new Error(`Invalid --ttl-hours "${values['ttl-hours']}": expected a number.`);
    }
    result.ttlHours = parsed;
  }

  return result;
}
