/**
 * Text-based assertions for the manual preview GitHub Actions workflow
 * (`.github/workflows/preview-environment.yml`).
 *
 * The repo has no YAML lint/dependency, so these checks read the workflow as
 * text and assert the safety-critical invariants from issue #319: OIDC + minimal
 * permissions, `environment: preview`, stage-keyed concurrency, correct preview
 * CLI flags, the smoke manifest-restore step, and the absence of raw
 * `cdk ... --all` mutation. They are a guardrail against accidental regressions
 * in the workflow, not a substitute for running it.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workflowPath = fileURLToPath(
  new URL('../../.github/workflows/preview-environment.yml', import.meta.url),
);
const workflow = readFileSync(workflowPath, 'utf8');

describe('preview-environment workflow', () => {
  it('is a manual workflow_dispatch with the expected inputs', () => {
    expect(workflow).toContain('workflow_dispatch:');
    for (const input of ['action:', 'stage:', 'profile:', 'ttlHours:', 'prNumber:']) {
      expect(workflow).toContain(input);
    }
  });

  it('adds a run-name for identification in the Actions UI', () => {
    expect(workflow).toContain('run-name:');
  });

  it('declares minimal permissions including actions: read for artifact download', () => {
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('contents: read');
    expect(workflow).toContain('actions: read');
    expect(workflow).toContain('pull-requests: write');
  });

  it('targets the protected preview environment', () => {
    expect(workflow).toContain('environment: preview');
  });

  it('serializes operations per stage and never cancels in progress', () => {
    // Regex (not a plain string) so the literal `${{ ... }}` is not flagged as a
    // mistyped JS template placeholder.
    expect(workflow).toMatch(/group: preview-\$\{\{ inputs\.stage \}\}/);
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('uses GitHub OIDC to assume the preview role', () => {
    expect(workflow).toContain('aws-actions/configure-aws-credentials@v4');
    expect(workflow).toContain('secrets.AWS_PREVIEW_ROLE_ARN');
    expect(workflow).toMatch(/role-to-assume: \$\{\{ secrets\.AWS_PREVIEW_ROLE_ARN \}\}/);
  });

  it('fails clearly when the preview role ARN is not configured', () => {
    expect(workflow).toContain('Require preview role ARN');
  });

  it('invokes preview scripts with the correct ttl flag (--ttl-hours, not --ttlHours)', () => {
    expect(workflow).toContain('--ttl-hours');
    expect(workflow).not.toContain('--ttlHours');
  });

  it('passes --source github-actions on plan and deploy', () => {
    expect(workflow).toContain(
      'pnpm preview:plan --stage "$STAGE" --profile "$PROFILE" --ttl-hours "$TTL" --source github-actions',
    );
    expect(workflow).toContain(
      'pnpm preview:deploy --stage "$STAGE" --profile "$PROFILE" --ttl-hours "$TTL" --source github-actions',
    );
  });

  it('runs preview:outputs after deploy so env.* artifacts are produced', () => {
    expect(workflow).toContain('pnpm preview:outputs --stage "$STAGE"');
  });

  it('destroy passes --stage, --profile, and --confirm "$STAGE"', () => {
    expect(workflow).toContain(
      'pnpm preview:destroy --stage "$STAGE" --profile "$PROFILE" --confirm "$STAGE"',
    );
  });

  it('restores the deploy manifest before standalone smoke using a resolved run id', () => {
    expect(workflow).toContain("if: inputs.action == 'smoke'");
    expect(workflow).toContain('Restore manifest from latest deploy artifact');
    // Must download by a concrete run id, not by artifact name alone.
    expect(workflow).toContain('gh run download "$RUN_ID"');
    expect(workflow).toContain('/artifacts');
    expect(workflow).toContain('manifest.json');
  });

  it('never runs raw cdk --all mutation commands', () => {
    expect(workflow).not.toContain('cdk deploy --all');
    expect(workflow).not.toContain('cdk destroy --all');
  });

  it('uploads preview artifacts even on failure', () => {
    expect(workflow).toContain('actions/upload-artifact@v4');
    expect(workflow).toMatch(/path: \.agentra\/preview\/\$\{\{ inputs\.stage \}\}\//);
  });

  it('posts a best-effort PR comment gated on prNumber', () => {
    expect(workflow).toContain("if: always() && inputs.prNumber != ''");
    expect(workflow).toContain('continue-on-error: true');
  });
});
