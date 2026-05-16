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

# ── AgentCore-focused dev workflows ──────────────────────────────────────────

# Diff AgentCore-related stacks only
cdk-diff-agentcore stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    required_vars=(THIRD_PARTY_API_KEY_SECRET_ARN)
    for var in "${required_vars[@]}"; do
      if [[ -z "${!var:-}" ]]; then
        echo "ERROR: required environment variable $var is not set" >&2
        exit 1
      fi
    done
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    STACKS=(
      "AgentraSlideRuntimeStack-{{stage}}"
      "AgentraBedrockKbStack-{{stage}}"
      "AgentraDataAuthStack-{{stage}}"
      "AgentraAgentCoreRuntimeStack-{{stage}}"
    )
    pnpm --filter @agentra/infra-cdk exec cdk diff "${STACKS[@]}" \
      -c "stage={{stage}}" \
      -c "thirdPartyApiKeysSecretArn=${THIRD_PARTY_API_KEY_SECRET_ARN}"

# Deploy AgentCore-related stacks only (shorter cycle for AgentCore iteration)
cdk-deploy-agentcore stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    required_vars=(THIRD_PARTY_API_KEY_SECRET_ARN)
    for var in "${required_vars[@]}"; do
      if [[ -z "${!var:-}" ]]; then
        echo "ERROR: required environment variable $var is not set" >&2
        exit 1
      fi
    done
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    STACKS=(
      "AgentraSlideRuntimeStack-{{stage}}"
      "AgentraBedrockKbStack-{{stage}}"
      "AgentraDataAuthStack-{{stage}}"
      "AgentraAgentCoreRuntimeStack-{{stage}}"
    )
    pnpm --filter @agentra/infra-cdk exec cdk deploy "${STACKS[@]}" \
      --require-approval never \
      -c "stage={{stage}}" \
      -c "thirdPartyApiKeysSecretArn=${THIRD_PARTY_API_KEY_SECRET_ARN}"

# ── Smoke tests ───────────────────────────────────────────────────────────────

# Run AgentCore chat smoke test (requires AGENTCORE_RUNTIME_ARN in env)
# Note: script files are added by PR #194 — guard exits cleanly if not yet merged
smoke-agentcore stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    SCRIPT_ROOT="apps/agentcore-runtime-ts/scripts/smoke-agentcore-chat.ts"
    SCRIPT_PKG="scripts/smoke-agentcore-chat.ts"
    if [[ ! -f "$SCRIPT_ROOT" ]]; then
      echo "ERROR: $SCRIPT_ROOT not found. Merge PR #194 first." >&2
      exit 1
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx "$SCRIPT_PKG"

# Run slide generation smoke test (requires AGENTCORE_RUNTIME_ARN in env)
# Note: script files are added by PR #194 — guard exits cleanly if not yet merged
smoke-slide stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
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

# Follow AgentCore logs by runtimeSessionId in real time
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
