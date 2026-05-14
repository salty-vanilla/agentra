#!/usr/bin/env node
// Synth-time context validation script
// Usage: pnpm exec tsx infra/cdk/validate-context.ts

const STAGE_PATTERN = /^[a-z0-9-]+$/;
const MAX_STAGE_LENGTH = 16;

interface TestCase {
  stage: string;
  shouldPass: boolean;
  description: string;
}

const testCases: TestCase[] = [
  { stage: 'dev', shouldPass: true, description: 'Simple dev stage' },
  { stage: 'prod', shouldPass: true, description: 'Simple prod stage' },
  { stage: 'staging-v2', shouldPass: true, description: 'Stage with hyphens' },
  { stage: 'test1', shouldPass: true, description: 'Stage with numbers' },
  { stage: 'a', shouldPass: true, description: 'Single character stage' },
  {
    stage: 'verylongstagethatwillexceedlimit',
    shouldPass: false,
    description: 'Stage exceeds max length',
  },
  { stage: 'DEV', shouldPass: false, description: 'Uppercase characters not allowed' },
  { stage: 'dev_stage', shouldPass: false, description: 'Underscores not allowed' },
  { stage: 'dev.stage', shouldPass: false, description: 'Dots not allowed' },
  { stage: 'dev stage', shouldPass: false, description: 'Spaces not allowed' },
  {
    stage: 'dev@stage',
    shouldPass: false,
    description: 'Special characters not allowed',
  },
  { stage: '-dev', shouldPass: false, description: 'Cannot start with hyphen' },
  { stage: 'dev-', shouldPass: false, description: 'Cannot end with hyphen' },
];

function validateStage(stage: string): { valid: boolean; error?: string } {
  if (!STAGE_PATTERN.test(stage)) {
    return {
      valid: false,
      error: `Invalid characters: must contain only lowercase letters, numbers, and hyphens (not at start/end)`,
    };
  }
  if (stage.length > MAX_STAGE_LENGTH) {
    return {
      valid: false,
      error: `Length ${stage.length} exceeds maximum ${MAX_STAGE_LENGTH}`,
    };
  }
  return { valid: true };
}

let passed = 0;
let failed = 0;

console.log('Running CDK context validation tests...\n');

for (const { stage, shouldPass, description } of testCases) {
  const result = validateStage(stage);
  const isCorrect = result.valid === shouldPass;

  if (isCorrect) {
    passed++;
    const status = shouldPass ? '✓ PASS' : '✓ REJECT';
    console.log(`${status}: "${stage}" — ${description}`);
  } else {
    failed++;
    const status = shouldPass ? '✗ FAIL' : '✗ FAIL';
    const details = result.error ? ` (${result.error})` : '';
    console.log(
      `${status}: "${stage}" — ${description}` +
        (shouldPass
          ? ` (should have passed${details})`
          : ` (should have been rejected${details})`),
    );
  }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
