aws_profile   := env_var_or_default("AGENTRA_AWS_PROFILE", "quick-admin")
default_stage := env_var_or_default("AGENTRA_STAGE", "dev")

# Show available commands
default:
    just --list

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
# Note: script files are added by PR #193 — guard exits cleanly if not yet merged
smoke-agentcore stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    SCRIPT="apps/agentcore-runtime-ts/scripts/smoke-agentcore-chat.ts"
    if [[ ! -f "$SCRIPT" ]]; then
      echo "ERROR: $SCRIPT not found. Merge PR #193 first." >&2
      exit 1
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx "$SCRIPT"

# Run slide generation smoke test (requires AGENTCORE_RUNTIME_ARN in env)
# Note: script files are added by PR #193 — guard exits cleanly if not yet merged
smoke-slide stage=default_stage profile=aws_profile:
    #!/usr/bin/env bash
    set -euo pipefail
    SCRIPT="apps/agentcore-runtime-ts/scripts/smoke-agentcore-slide.ts"
    if [[ ! -f "$SCRIPT" ]]; then
      echo "ERROR: $SCRIPT not found. Merge PR #193 first." >&2
      exit 1
    fi
    eval "$(aws configure export-credentials --profile '{{profile}}' --format env)"
    aws sts get-caller-identity
    AGENTRA_STAGE="{{stage}}" pnpm --filter @agentra/agentcore-runtime-ts exec tsx "$SCRIPT"

# Deploy AgentCore stacks then run chat + slide smoke tests
dev-deploy-agentcore-and-smoke stage=default_stage profile=aws_profile:
    just cdk-deploy-agentcore {{stage}} {{profile}}
    just smoke-agentcore {{stage}} {{profile}}
    just smoke-slide {{stage}} {{profile}}
