export type PreviewProfile = 'minimal-api' | 'backend-ai' | 'full';

export type PreviewSource =
  | 'local-claude-code'
  | 'local-codex'
  | 'github-actions'
  | 'human';

export interface PreviewConfigInput {
  stage: string;
  // Typed as string so runtime validation produces a clear error for unknown values.
  profile?: string;
  ttlHours?: number;
  owner?: string;
  source?: string;
  now?: Date;
}

export interface PreviewConfig {
  stage: string;
  profile: PreviewProfile;
  ttlHours: number;
  owner: string;
  source: PreviewSource;
  createdAt: string;
  expiresAt: string;
  stackPrefix: string;
  tags: Readonly<Record<string, string>>;
}

const ALLOWED_PATTERNS: readonly RegExp[] = [
  /^pr-[0-9]+$/,
  /^sandbox-[a-z0-9-]+-[0-9]{12}$/,
  /^local-[a-z0-9-]+-[a-f0-9]{7,12}$/,
];

const FORBIDDEN_STAGES = new Set([
  'prod',
  'production',
  'staging',
  'stage',
  'demo',
  'dev',
  'main',
  'master',
  'default',
  'shared',
]);

const VALID_PROFILES: readonly PreviewProfile[] = ['minimal-api', 'backend-ai', 'full'];

const VALID_SOURCES: readonly PreviewSource[] = [
  'local-claude-code',
  'local-codex',
  'github-actions',
  'human',
];

const DEFAULT_PROFILE: PreviewProfile = 'minimal-api';
const DEFAULT_SOURCE: PreviewSource = 'human';
const DEFAULT_OWNER = 'unknown';
const DEFAULT_TTL_HOURS = 8;
const MIN_TTL_HOURS = 1;
const MAX_TTL_HOURS = 24;

function buildStageErrorMessage(stage: string): string {
  return (
    `Invalid preview stage "${stage}". ` +
    'Disposable preview stages must match pr-<number>, ' +
    'sandbox-<user>-<yyyymmddhhmm>, or local-<user>-<short-sha>. ' +
    'Reserved stages such as prod, staging, demo, dev, main, and shared are not allowed.'
  );
}

export function validatePreviewStage(stage: unknown): void {
  if (typeof stage !== 'string') {
    throw new Error(
      `Invalid preview stage: expected string, got ${typeof stage}. ` +
        'Disposable preview stages must match pr-<number>, ' +
        'sandbox-<user>-<yyyymmddhhmm>, or local-<user>-<short-sha>.',
    );
  }
  if (stage.trim() === '') {
    throw new Error(
      'Invalid preview stage: must not be empty or whitespace-only. ' +
        'Disposable preview stages must match pr-<number>, ' +
        'sandbox-<user>-<yyyymmddhhmm>, or local-<user>-<short-sha>.',
    );
  }
  if (FORBIDDEN_STAGES.has(stage.toLowerCase())) {
    throw new Error(buildStageErrorMessage(stage));
  }
  if (!ALLOWED_PATTERNS.some((re) => re.test(stage))) {
    throw new Error(buildStageErrorMessage(stage));
  }
}

export function isPreviewStage(stage: unknown): boolean {
  try {
    validatePreviewStage(stage);
    return true;
  } catch {
    return false;
  }
}

function validateProfile(profile: string): asserts profile is PreviewProfile {
  if (!(VALID_PROFILES as readonly string[]).includes(profile)) {
    throw new Error(
      `Invalid preview profile "${profile}". ` +
        `Expected one of: ${VALID_PROFILES.join(', ')}.`,
    );
  }
}

function validateSource(source: string): asserts source is PreviewSource {
  if (!(VALID_SOURCES as readonly string[]).includes(source)) {
    throw new Error(
      `Invalid preview source "${source}". ` +
        `Expected one of: ${VALID_SOURCES.join(', ')}.`,
    );
  }
}

function validateTTL(ttlHours: number): void {
  if (
    !Number.isInteger(ttlHours) ||
    ttlHours < MIN_TTL_HOURS ||
    ttlHours > MAX_TTL_HOURS
  ) {
    throw new Error(
      `Invalid ttlHours "${ttlHours}". ` +
        `Preview TTL must be an integer between ${MIN_TTL_HOURS} and ${MAX_TTL_HOURS} hours.`,
    );
  }
}

export function resolvePreviewConfig(input: PreviewConfigInput): PreviewConfig {
  validatePreviewStage(input.stage);

  const profile = input.profile ?? DEFAULT_PROFILE;
  validateProfile(profile);

  const source = input.source ?? DEFAULT_SOURCE;
  validateSource(source);

  const owner = input.owner?.trim() || DEFAULT_OWNER;

  const ttlHours = input.ttlHours ?? DEFAULT_TTL_HOURS;
  if (input.ttlHours !== undefined) {
    validateTTL(ttlHours);
  }

  const now = input.now ? new Date(input.now.getTime()) : new Date();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

  const stackPrefix = `AgentraPreview-${input.stage}`;

  const tags: Readonly<Record<string, string>> = Object.freeze({
    Project: 'Agentra',
    EnvironmentType: 'preview',
    Stage: input.stage,
    Owner: owner,
    Source: source,
    ExpiresAt: expiresAt,
    CreatedBy: 'preview-cli',
    ManagedBy: 'cdk',
  });

  return {
    stage: input.stage,
    profile,
    ttlHours,
    owner,
    source,
    createdAt,
    expiresAt,
    stackPrefix,
    tags,
  };
}
