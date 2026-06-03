set dotenv-load     := true
set dotenv-filename := ".env.local"

aws_profile   := env_var_or_default("AGENTRA_AWS_PROFILE", "quick-admin")
default_stage := env_var_or_default("AGENTRA_STAGE", "dev")

# Show available commands
default:
    just --list

# ── Local dev ─────────────────────────────────────────────────────────────────

# Install Node dependencies
install:
    pnpm install

# Lint, typecheck, and test
check:
    pnpm lint
    pnpm typecheck
    pnpm test

# Start the frontend dev server (port 3000)
dev-frontend:
    pnpm dev:frontend

# Start the backend dev server
dev-backend:
    pnpm dev:backend

# Start the backend dev server sourcing api-local env from CDK outputs.
# Automatically sets HOST=127.0.0.1, PORT=8080, and cloud DynamoDB/Cognito vars.
# Run `just outputs-env <stage> api-local` first to generate the env file.
dev-backend-local stage=default_stage:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE=".agentra/env/{{stage}}/api-local.env"
    if [[ ! -f "$ENV_FILE" ]]; then
      echo "ERROR: $ENV_FILE not found." >&2
      echo "       Run: just outputs-env {{stage}} api-local" >&2
      exit 1
    fi
    set -a
    # shellcheck source=/dev/null
    source "$ENV_FILE"
    set +a
    pnpm dev:backend

# ── Stage slug generation ─────────────────────────────────────────────────────

# Generate a safe CDK stage slug from the current git branch
stage-from-branch:
    #!/usr/bin/env bash
    set -euo pipefail
    bash scripts/agent/stage-slug.sh

# Generate a stage slug from an explicit branch string or --issue N
# Examples:
#   just stage-slug "fix/#252-env-kind"
#   just stage-slug --issue 252
stage-slug branch="":
    #!/usr/bin/env bash
    set -euo pipefail
    if [[ -z "{{branch}}" ]]; then
        bash scripts/agent/stage-slug.sh
    else
        bash scripts/agent/stage-slug.sh "{{branch}}"
    fi

# ── Identity ──────────────────────────────────────────────────────────────────

# Confirm the active AWS identity for the given profile
cdk-whoami profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity

# ── Full CDK workflows ────────────────────────────────────────────────────────

# Diff all stacks for the given stage
cdk-diff-all stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    required_vars=(THIRD_PARTY_API_KEY_SECRET_ARN AMPLIFY_URL)
    for var in "${required_vars[@]}"; do
      if [[ -z "${!var:-}" ]]; then
        echo "ERROR: required environment variable $var is not set" >&2
        exit 1
      fi
    done
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    pnpm --filter @agentra/infra-cdk exec cdk diff --all \
      -c "stage={{stage}}" \
      -c "thirdPartyApiKeysSecretArn=${THIRD_PARTY_API_KEY_SECRET_ARN}" \
      -c "callbackUrls=${AMPLIFY_URL},${AMPLIFY_URL}/" \
      -c "logoutUrls=${AMPLIFY_URL},${AMPLIFY_URL}/" \
      -c "corsOrigins=${AMPLIFY_URL}"

# Deploy all stacks for the given stage (validates required env vars first)
cdk-deploy-all stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    required_vars=(
      THIRD_PARTY_API_KEY_SECRET_ARN
      AMPLIFY_URL
      AMPLIFY_GITHUB_PAT
      AMPLIFY_GITHUB_REPOSITORY
      AMPLIFY_GITHUB_BRANCH
    )
    for var in "${required_vars[@]}"; do
      if [[ -z "${!var:-}" ]]; then
        echo "ERROR: required environment variable $var is not set" >&2
        exit 1
      fi
    done
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    pnpm --filter @agentra/infra-cdk exec cdk deploy --all \
      --require-approval never \
      -c "thirdPartyApiKeysSecretArn=${THIRD_PARTY_API_KEY_SECRET_ARN}" \
      -c "stage={{stage}}" \
      -c "callbackUrls=${AMPLIFY_URL},${AMPLIFY_URL}/" \
      -c "logoutUrls=${AMPLIFY_URL},${AMPLIFY_URL}/" \
      -c "corsOrigins=${AMPLIFY_URL}" \
      --parameters "AgentraWebHostingStack-{{stage}}:AmplifyGithubAccessToken=${AMPLIFY_GITHUB_PAT}" \
      --parameters "AgentraWebHostingStack-{{stage}}:AmplifyRepositoryUrl=${AMPLIFY_GITHUB_REPOSITORY}" \
      --parameters "AgentraWebHostingStack-{{stage}}:AmplifyBranchName=${AMPLIFY_GITHUB_BRANCH}"

# ── Worktree-safe CDK helpers (see docs/development/cdk-verify.md) ───────────
# These recipes use scripts/agent/cdk-stage.sh to enforce stage naming, named
# stack groups, and destructive-command guards. Existing AgentCore recipes
# below delegate to these wrappers so muscle memory still works.

# Validate a stage name (pattern + length, mirrors infra/cdk/bin/agentra-cdk.ts)
cdk-validate-stage stage:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    validate_stage '{{stage}}'
    echo "stage '{{stage}}' is valid"

# Print AWS identity, target stage, and resolved stack names for a group
cdk-stage-info group="agentcore" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'

# Groups: agentcore | runtime | kb | slide | api | web | data | gateway | all
# Diff a named stack group for the given stage
cdk-diff group="agentcore" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    build_cdk_flags '{{group}}' '{{stage}}'
    mapfile -t STACKS < <(resolve_stack_group '{{group}}' '{{stage}}')
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    pnpm --filter @agentra/infra-cdk exec cdk diff "${STACKS[@]}" "${CDK_CONTEXT[@]}"

# Deploy a named stack group for the given stage
cdk-deploy group="agentcore" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    build_cdk_flags '{{group}}' '{{stage}}'
    mapfile -t STACKS < <(resolve_stack_group '{{group}}' '{{stage}}')
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    pnpm --filter @agentra/infra-cdk exec cdk deploy "${STACKS[@]}" \
      --require-approval never \
      "${CDK_CONTEXT[@]}" \
      "${CDK_PARAMS[@]}"

# Deploy and write outputs to .agentra/outputs/<stage>.json for smoke scripts
cdk-deploy-with-outputs group="agentcore" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    build_cdk_flags '{{group}}' '{{stage}}'
    mapfile -t STACKS < <(resolve_stack_group '{{group}}' '{{stage}}')
    OUTPUT_DIR=".agentra/outputs"
    OUTPUT_FILE="${OUTPUT_DIR}/{{stage}}.json"
    mkdir -p "$OUTPUT_DIR"
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    pnpm --filter @agentra/infra-cdk exec cdk deploy "${STACKS[@]}" \
      --require-approval never \
      --outputs-file "$OUTPUT_FILE" \
      "${CDK_CONTEXT[@]}" \
      "${CDK_PARAMS[@]}"
    echo "CDK outputs written to: $OUTPUT_FILE"

# Faster iteration via --hotswap-fallback; reject stable/prod stages. Run
# `just cdk-reconcile` before opening a PR to revert any CloudFormation drift.
# Hotswap deploy for ephemeral stages only (dev-issue-*, dev-<agent>-<topic>)
cdk-deploy-dev group="runtime" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    assert_ephemeral_stage '{{stage}}'
    build_cdk_flags '{{group}}' '{{stage}}'
    mapfile -t STACKS < <(resolve_stack_group '{{group}}' '{{stage}}')
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'
    echo "⚠️  Hotswap-fallback deploy. May introduce CloudFormation drift."
    echo "    Run 'just cdk-reconcile {{group}} {{stage}} {{profile}}' before PR."
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    pnpm --filter @agentra/infra-cdk exec cdk deploy "${STACKS[@]}" \
      --require-approval never \
      --hotswap-fallback \
      "${CDK_CONTEXT[@]}" \
      "${CDK_PARAMS[@]}"

# Uses --revert-drift when the installed CDK CLI supports it; falls back to
# a plain deploy otherwise.
# Reconcile a stack group after hotswap iterations
cdk-reconcile group="agentcore" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    build_cdk_flags '{{group}}' '{{stage}}'
    mapfile -t STACKS < <(resolve_stack_group '{{group}}' '{{stage}}')
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'
    DRIFT_FLAG=()
    if cdk_cli_supports_flag --revert-drift; then
      DRIFT_FLAG=(--revert-drift)
      echo "Using --revert-drift to reconcile post-hotswap drift."
    else
      echo "Installed CDK CLI does not support --revert-drift; running plain deploy."
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    pnpm --filter @agentra/infra-cdk exec cdk deploy "${STACKS[@]}" \
      --require-approval never \
      "${DRIFT_FLAG[@]}" \
      "${CDK_CONTEXT[@]}" \
      "${CDK_PARAMS[@]}"

# Destroy a stack group for an ephemeral stage. Requires CONFIRM_STAGE=<stage>.
cdk-destroy group="agentcore" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    assert_ephemeral_stage '{{stage}}'
    require_confirm_stage '{{stage}}'
    build_cdk_flags '{{group}}' '{{stage}}' destroy
    mapfile -t STACKS < <(resolve_stack_group '{{group}}' '{{stage}}')
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'
    echo "⚠️  Destroying the stacks above. CloudFormation retention policies may"
    echo "    leave S3 buckets, log groups, DynamoDB tables, or OpenSearch"
    echo "    collections behind. See docs/development/cdk-verify.md#retained-resources."
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    pnpm --filter @agentra/infra-cdk exec cdk destroy "${STACKS[@]}" \
      --force \
      "${CDK_CONTEXT[@]}"

# Destroy every stack for an ephemeral stage. Requires CONFIRM_STAGE=<stage>.
cdk-cleanup-ephemeral stage=default_stage profile=aws_profile:
    just cdk-destroy all {{stage}} {{profile}}

# ── AgentCore-focused dev workflows ──────────────────────────────────────────
# Kept as delegates for backwards compatibility. New code should call the
# generic wrappers above (cdk-diff / cdk-deploy with group=agentcore).

# Diff AgentCore-related stacks only
cdk-diff-agentcore stage=default_stage profile=aws_profile:
    just cdk-diff agentcore {{stage}} {{profile}}

# Deploy AgentCore-related stacks only (shorter cycle for AgentCore iteration)
cdk-deploy-agentcore stage=default_stage profile=aws_profile:
    just cdk-deploy agentcore {{stage}} {{profile}}

# ── Preview environments (disposable, AI-safe) ───────────────────────────────
# PROFILE is the preview *profile* (minimal-api | backend-ai | full).
# `profile` is the AWS *credentials* profile (AGENTRA_AWS_PROFILE). These differ.
# Destroy is intentionally not provided here (handled by a separate workflow).

# Validate + synth a preview stage and write .agentra/preview/<stage>/plan.json (no AWS mutation)
preview-plan STAGE PROFILE="minimal-api" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile '{{profile}}')}"
    pnpm preview:plan --stage '{{STAGE}}' --profile '{{PROFILE}}'

# Deploy explicit preview stacks for a stage; writes cdk-outputs.json + manifest.json
preview-deploy STAGE PROFILE="minimal-api" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile '{{profile}}')}"
    pnpm preview:deploy --stage '{{STAGE}}' --profile '{{PROFILE}}'

# Normalize CDK outputs into manifest.json + env files (no AWS/CDK calls)
preview-outputs STAGE:
    pnpm preview:outputs --stage '{{STAGE}}'

# Smoke-test a deployed preview stage (reads manifest.json; the preview profile
# comes from the manifest). Exports AWS creds so the optional AgentCore probe can
# authenticate on backend-ai / full. Set SMOKE_JWT_TOKEN to exercise /threads and
# /chat; without it those checks skip with an explicit reason.
#
# MODE=core (default) runs only health/threads; MODE=full adds chat SSE / AgentCore.
# CORRELATION=true adds the CloudWatch requestId correlation check and requires
# MODE=full (log groups come from the manifest's agentCoreLogGroupNames).
preview-smoke STAGE MODE="core" CORRELATION="false" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    case '{{MODE}}' in core|full) ;; *) echo "MODE must be core|full" >&2; exit 2 ;; esac
    if [ '{{CORRELATION}}' = 'true' ] && [ '{{MODE}}' != 'full' ]; then
      echo "CORRELATION=true requires MODE=full" >&2; exit 2
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile '{{profile}}')}"
    if [ '{{CORRELATION}}' = 'true' ]; then
      pnpm preview:smoke --stage '{{STAGE}}' --mode '{{MODE}}' --with-log-correlation
    else
      pnpm preview:smoke --stage '{{STAGE}}' --mode '{{MODE}}'
    fi

# Dry-run preview destroy: validate + list accepted/rejected stacks, no AWS mutation.
# PROFILE must be the same preview profile used for preview-deploy.
preview-destroy-dry-run STAGE PROFILE="minimal-api" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile '{{profile}}')}"
    pnpm preview:destroy --stage '{{STAGE}}' --profile '{{PROFILE}}' --dry-run

# Destroy validated preview stacks for a stage (requires --confirm == STAGE).
# PROFILE must be the same preview profile used for preview-deploy.
preview-destroy STAGE PROFILE="minimal-api" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile '{{profile}}')}"
    pnpm preview:destroy --stage '{{STAGE}}' --profile '{{PROFILE}}' --confirm '{{STAGE}}'

# Dry-run account-wide preview cleanup: classify stale stacks by TTL + safety,
# write a report, no AWS mutation. Optional STAGE scopes to one preview stage.
preview-cleanup-dry-run STAGE="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile '{{profile}}')}"
    if [ -n '{{STAGE}}' ]; then
        pnpm preview:cleanup --dry-run --stage '{{STAGE}}'
    else
        pnpm preview:cleanup --dry-run
    fi

# Execute preview cleanup: destroy expired + validated stacks. Account-wide requires
# CONFIRM=all; a scoped run (STAGE set) requires CONFIRM equal to STAGE.
preview-cleanup-execute STAGE="" CONFIRM="all" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    export AWS_REGION="${AWS_REGION:-$(aws configure get region --profile '{{profile}}')}"
    if [ -n '{{STAGE}}' ]; then
        pnpm preview:cleanup --execute --stage '{{STAGE}}' --confirm '{{CONFIRM}}'
    else
        pnpm preview:cleanup --execute --confirm '{{CONFIRM}}'
    fi

# ── Smoke tests ───────────────────────────────────────────────────────────────

# Run AgentCore chat smoke test. Auto-loads AGENTCORE_RUNTIME_ARN from
# .agentra/outputs/<stage>.json when present; otherwise reads it from env.
# Note: script files are added by PR #194 — guard exits cleanly if not yet merged
smoke-agentcore stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    export_runtime_arn_from_outputs '{{stage}}' || true
    SCRIPT_ROOT="apps/agentcore-runtime-ts/scripts/smoke-agentcore-chat.ts"
    SCRIPT_PKG="scripts/smoke-agentcore-chat.ts"
    if [[ ! -f "$SCRIPT_ROOT" ]]; then
      echo "ERROR: $SCRIPT_ROOT not found. Merge PR #194 first." >&2
      exit 1
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx "$SCRIPT_PKG"

# Run slide generation smoke test. Auto-loads AGENTCORE_RUNTIME_ARN from
# .agentra/outputs/<stage>.json when present; otherwise reads it from env.
# Note: script files are added by PR #194 — guard exits cleanly if not yet merged
smoke-slide stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    export_runtime_arn_from_outputs '{{stage}}' || true
    SCRIPT_ROOT="apps/agentcore-runtime-ts/scripts/smoke-agentcore-slide.ts"
    SCRIPT_PKG="scripts/smoke-agentcore-slide.ts"
    if [[ ! -f "$SCRIPT_ROOT" ]]; then
      echo "ERROR: $SCRIPT_ROOT not found. Merge PR #194 first." >&2
      exit 1
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx "$SCRIPT_PKG"

# Run local Web Research Agent smoke (no AgentCore Runtime deploy required)
# Optional first arg: model id  e.g. just smoke-local-research us.anthropic.claude-haiku-4-5-20251001
smoke-local-research model="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    extra_args=""
    [[ -n "{{model}}" ]] && extra_args="-- --model {{model}}"
    AWS_REGION=ap-northeast-1 pnpm --filter @agentra/agentcore-runtime-ts smoke:local:research $extra_args

# Deploy AgentCore stacks then run chat + slide smoke tests
dev-deploy-agentcore-and-smoke stage=default_stage profile=aws_profile:
    just cdk-deploy-agentcore {{stage}} {{profile}}
    just smoke-agentcore {{stage}} {{profile}}
    just smoke-slide {{stage}} {{profile}}

# ── Env generation from CDK outputs ──────────────────────────────────────────
# Targets: frontend-local | frontend-api-cloud | api-local | agent-local | kb-smoke | bff-smoke
# Reads .agentra/outputs/<stage>.json (written by cdk-deploy-with-outputs).
# Writes .agentra/env/<stage>/<target>.env (gitignored).
# See docs/development/dev-modes.md for usage examples.
outputs-env stage=default_stage target="":
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{target}}" ]] && {
      echo "ERROR: target is required." >&2
      echo "  Usage: just outputs-env [stage] <target>" >&2
      echo "  Targets: frontend-local, frontend-api-cloud, api-local, agent-local, kb-smoke, bff-smoke" >&2
      exit 1
    }
    pnpm --filter @agentra/infra-cdk exec tsx ../../scripts/agent/generate-env.ts \
      --stage "{{stage}}" --target "{{target}}"

# Run BFF /health smoke — no auth required.
# Loads URL from .agentra/env/<stage>/bff-smoke.env when present.
# Run `just outputs-env <stage> bff-smoke` first to generate the env file.
# Requires: AGENTRA_API_BASE_URL
smoke-bff-health stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE=".agentra/env/{{stage}}/bff-smoke.env"
    if [[ -f "$ENV_FILE" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "$ENV_FILE"
      set +a
      echo "Loaded env from $ENV_FILE"
    fi
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/backend exec tsx scripts/smoke-bff.ts health

# Run BFF /threads smoke — SMOKE_JWT_TOKEN required (add to bff-smoke.env).
# Loads env from .agentra/env/<stage>/bff-smoke.env when present.
# Run `just outputs-env <stage> bff-smoke` first to generate the env file.
# Requires: AGENTRA_API_BASE_URL, SMOKE_JWT_TOKEN
smoke-bff-threads stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE=".agentra/env/{{stage}}/bff-smoke.env"
    if [[ -f "$ENV_FILE" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "$ENV_FILE"
      set +a
      echo "Loaded env from $ENV_FILE"
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/backend exec tsx scripts/smoke-bff.ts threads

# Run BFF /chat SSE smoke test against a deployed stage.
# Auto-loads env from .agentra/env/<stage>/bff-smoke.env when present.
# Run `just outputs-env <stage> bff-smoke` first to generate the env file.
# Requires: AGENTRA_STREAMING_API_BASE_URL, SMOKE_JWT_TOKEN (add to bff-smoke.env)
smoke-bff-chat stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    ENV_FILE=".agentra/env/{{stage}}/bff-smoke.env"
    if [[ -f "$ENV_FILE" ]]; then
      set -a
      # shellcheck source=/dev/null
      source "$ENV_FILE"
      set +a
      echo "Loaded env from $ENV_FILE"
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/backend exec tsx scripts/smoke-bff.ts chat

# Run all BFF smokes: health -> threads -> chat (stop on first failure).
# Preferred entry point for stage-based smoke runs.
# For local env: pnpm smoke:bff (reads env vars directly)
# Requires: AGENTRA_API_BASE_URL, AGENTRA_STREAMING_API_BASE_URL, SMOKE_JWT_TOKEN
smoke-bff stage=default_stage profile=aws_profile:
    just smoke-bff-health {{stage}} {{profile}}
    just smoke-bff-threads {{stage}} {{profile}}
    just smoke-bff-chat {{stage}} {{profile}}

# Run BFF /chat smoke and scan recent AgentCore logs for the returned requestId.
# Combines smoke-bff-chat with agentcore-errors to verify requestId propagation.
smoke-bff-chat-logs stage=default_stage since="5m" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    just smoke-bff-chat '{{stage}}' '{{profile}}'
    just agentcore-errors '{{stage}}' '{{since}}' '{{profile}}'

# ── Worktree-safe verification workflows (see docs/development/cdk-verify.md) ─

# Run AgentCore chat + slide smoke tests and scan recent error logs
verify-agentcore stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    just cdk-stage-info agentcore '{{stage}}' '{{profile}}'
    just smoke-agentcore '{{stage}}' '{{profile}}'
    just smoke-slide '{{stage}}' '{{profile}}'
    just agentcore-errors '{{stage}}' 15m '{{profile}}'
    echo
    echo "── verify-agentcore evidence ───────────────────────────────"
    echo "stage:    {{stage}}"
    echo "profile:  {{profile}}"
    echo "commands: smoke-agentcore, smoke-slide, agentcore-errors (15m)"
    echo "────────────────────────────────────────────────────────────"

# Run slide smoke test and scan recent error logs
verify-slide stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    just cdk-stage-info slide '{{stage}}' '{{profile}}'
    just smoke-slide '{{stage}}' '{{profile}}'
    just agentcore-errors '{{stage}}' 15m '{{profile}}'
    echo
    echo "── verify-slide evidence ───────────────────────────────────"
    echo "stage:    {{stage}}"
    echo "profile:  {{profile}}"
    echo "commands: smoke-slide, agentcore-errors (15m)"
    echo "────────────────────────────────────────────────────────────"

# Stage-info -> diff -> deploy-with-outputs -> smoke -> error log scan
# Canonical agent verification command for any stack group
verify-cdk group="agentcore" stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    source scripts/agent/cdk-stage.sh
    print_stage_info '{{stage}}' '{{group}}' '{{profile}}'
    just cdk-diff '{{group}}' '{{stage}}' '{{profile}}'
    just cdk-deploy-with-outputs '{{group}}' '{{stage}}' '{{profile}}'
    if group_includes_runtime '{{group}}'; then
      just smoke-agentcore '{{stage}}' '{{profile}}'
    fi
    if group_includes_slide '{{group}}'; then
      just smoke-slide '{{stage}}' '{{profile}}'
    fi
    just agentcore-errors '{{stage}}' 15m '{{profile}}'
    echo
    echo "── verify-cdk evidence ─────────────────────────────────────"
    echo "stage:    {{stage}}"
    echo "group:    {{group}}"
    echo "profile:  {{profile}}"
    echo "outputs:  .agentra/outputs/{{stage}}.json"
    echo "commands: cdk-diff, cdk-deploy-with-outputs, smoke-*, agentcore-errors (15m)"
    echo "────────────────────────────────────────────────────────────"

# ── AgentCore Log Discovery ───────────────────────────────────────────────────

# List all AgentCore Runtime log groups
agentcore-log-groups stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts groups "{{stage}}"

# Search recent AgentCore logs (default: last 30m)
agentcore-logs stage=default_stage since="30m" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts general "{{stage}}" "{{since}}"

# Search AgentCore logs by keyword (any free-text match, e.g. a requestId or userId)
agentcore-logs-keyword stage=default_stage keyword="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{keyword}}" ]] && { echo "ERROR: keyword required. Usage: just agentcore-logs-keyword [stage] <keyword>" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts request "{{stage}}" "1h" "{{keyword}}"

# Filter AgentCore logs by traceId
agentcore-logs-trace stage=default_stage traceId="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{traceId}}" ]] && { echo "ERROR: traceId required. Usage: just agentcore-logs-trace [stage] <traceId>" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts request "{{stage}}" "1h" "{{traceId}}"

# Filter AgentCore logs by API requestId (matches the requestId field in structured logs / API response)
agentcore-logs-request stage=default_stage requestId="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{requestId}}" ]] && { echo "ERROR: requestId required. Usage: just agentcore-logs-request [stage] <requestId>" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts request "{{stage}}" "1h" "{{requestId}}"

# Filter AgentCore logs by threadId (conversation/session identifier emitted in structured logs)
agentcore-logs-session stage=default_stage sessionId="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{sessionId}}" ]] && { echo "ERROR: sessionId required. Usage: just agentcore-logs-session [stage] <sessionId>" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts session "{{stage}}" "1h" "{{sessionId}}"

# Search AgentCore error logs (default: last 1h)
agentcore-errors stage=default_stage since="1h" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts errors "{{stage}}" "{{since}}"

# Follow AgentCore logs in real time (Ctrl-C to stop)
agentcore-logs-follow stage=default_stage since="5m" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts general "{{stage}}" "{{since}}" "" --follow

# Follow AgentCore logs by keyword in real time
agentcore-logs-follow-keyword stage=default_stage keyword="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{keyword}}" ]] && { echo "ERROR: keyword required" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts request "{{stage}}" "5m" "{{keyword}}" --follow

# Follow AgentCore logs by traceId in real time
agentcore-logs-follow-trace stage=default_stage traceId="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{traceId}}" ]] && { echo "ERROR: traceId required" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts request "{{stage}}" "5m" "{{traceId}}" --follow

# Follow AgentCore logs by API requestId in real time
agentcore-logs-follow-request stage=default_stage requestId="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{requestId}}" ]] && { echo "ERROR: requestId required" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts request "{{stage}}" "5m" "{{requestId}}" --follow

# Follow AgentCore logs by threadId in real time
agentcore-logs-follow-session stage=default_stage sessionId="" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    [[ -z "{{sessionId}}" ]] && { echo "ERROR: sessionId required" >&2; exit 1; }
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts session "{{stage}}" "5m" "{{sessionId}}" --follow

# Follow AgentCore error logs in real time
agentcore-errors-follow stage=default_stage since="5m" profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx scripts/agentcore-logs.ts errors "{{stage}}" "{{since}}" "" --follow
