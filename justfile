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

# Deploy AgentCore stacks then run chat + slide smoke tests
dev-deploy-agentcore-and-smoke stage=default_stage profile=aws_profile:
    just cdk-deploy-agentcore {{stage}} {{profile}}
    just smoke-agentcore {{stage}} {{profile}}
    just smoke-slide {{stage}} {{profile}}

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
