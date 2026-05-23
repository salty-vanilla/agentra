#!/usr/bin/env bash
# Shared helpers for stage-aware CDK justfile recipes.
#
# This file is meant to be sourced, not executed directly.
# Mirrors the stage contract enforced in infra/cdk/bin/agentra-cdk.ts.
#
# Functions:
#   validate_stage <stage>            Pattern + length check.
#   assert_ephemeral_stage <stage>    validate_stage + reject stable/prod names.
#   derive_environment_kind <stage>   Echo environmentKind for a stage.
#   resolve_stack_group <group> <stage>
#                                     Echo stack IDs (space-separated).
#   list_stack_groups                 Echo the known group names.
#   require_confirm_stage <stage>     Demand CONFIRM_STAGE=<stage> in env.
#   print_stage_info <stage> <group> [profile]
#                                     Print identity + resolved stacks. Skips
#                                     AWS identity if no profile is given.

set -euo pipefail

# ── stage validation ─────────────────────────────────────────────────────────

# Regex and length must match infra/cdk/bin/agentra-cdk.ts.
readonly AGENTRA_STAGE_PATTERN='^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'
readonly AGENTRA_STAGE_MAX_LENGTH=16

# Stages that must never be targeted by destructive or hotswap commands.
readonly AGENTRA_PROTECTED_STAGES=(prod production main master staging release)
# Stages that are considered "stable shared" — protected from cleanup too.
readonly AGENTRA_STABLE_STAGES=(dev "${AGENTRA_PROTECTED_STAGES[@]}")

validate_stage() {
    local stage="${1:-}"
    if [[ -z "$stage" ]]; then
        echo "ERROR: stage is required" >&2
        return 1
    fi
    if (( ${#stage} > AGENTRA_STAGE_MAX_LENGTH )); then
        echo "ERROR: stage '$stage' exceeds maximum length ${AGENTRA_STAGE_MAX_LENGTH}." >&2
        echo "       Keep stage names short to avoid collisions in AWS resource names." >&2
        return 1
    fi
    if ! [[ "$stage" =~ $AGENTRA_STAGE_PATTERN ]]; then
        echo "ERROR: invalid stage '$stage'." >&2
        echo "       Stage must contain only lowercase letters, digits, and hyphens," >&2
        echo "       and may not start or end with a hyphen." >&2
        echo "       Examples: dev, dev-issue-224, dev-codex-rag" >&2
        return 1
    fi
}

assert_ephemeral_stage() {
    local stage="${1:-}"
    validate_stage "$stage" || return 1
    local protected
    for protected in "${AGENTRA_STABLE_STAGES[@]}"; do
        if [[ "$stage" == "$protected" ]]; then
            echo "ERROR: '$stage' is a stable/protected stage and cannot be used here." >&2
            echo "       This command only operates on ephemeral stages." >&2
            echo "       Use a per-worktree stage like 'i<N>-<slug>' or '<feature>-<hash>'." >&2
            return 1
        fi
    done
}

# Derive environmentKind from stage name.
# Mirrors the logic in infra/cdk/lib/environment.ts::deriveEnvironmentKind.
#   prod/production/main/master/staging/release -> prod
#   dev                                         -> shared-dev
#   everything else                             -> ephemeral
derive_environment_kind() {
    local stage="${1:-}"
    local protected
    for protected in "${AGENTRA_PROTECTED_STAGES[@]}"; do
        if [[ "$stage" == "$protected" ]]; then
            echo "prod"
            return 0
        fi
    done
    if [[ "$stage" == "dev" ]]; then
        echo "shared-dev"
        return 0
    fi
    echo "ephemeral"
}

# ── stack groups ─────────────────────────────────────────────────────────────

list_stack_groups() {
    cat <<'EOF'
agentcore  AgentraSlideRuntimeStack, AgentraBedrockKbStack, AgentraDataAuthStack, AgentraAgentCoreRuntimeStack
runtime    AgentraAgentCoreRuntimeStack
kb         AgentraBedrockKbStack
slide      AgentraSlideRuntimeStack
api        AgentraAppStack
web        AgentraWebHostingStack
data       AgentraDataAuthStack
gateway    AgentraAgentCoreStack
all        every stack defined in infra/cdk/bin/agentra-cdk.ts
EOF
}

resolve_stack_group() {
    local group="${1:-}"
    local stage="${2:-}"
    if [[ -z "$group" ]]; then
        echo "ERROR: stack group is required" >&2
        echo "Known groups:" >&2
        list_stack_groups >&2
        return 1
    fi
    validate_stage "$stage" || return 1
    local stacks=()
    case "$group" in
        agentcore)
            stacks=(
                "AgentraSlideRuntimeStack-${stage}"
                "AgentraBedrockKbStack-${stage}"
                "AgentraDataAuthStack-${stage}"
                "AgentraAgentCoreRuntimeStack-${stage}"
            )
            ;;
        runtime)
            stacks=("AgentraAgentCoreRuntimeStack-${stage}")
            ;;
        kb)
            stacks=("AgentraBedrockKbStack-${stage}")
            ;;
        slide)
            stacks=("AgentraSlideRuntimeStack-${stage}")
            ;;
        api)
            stacks=("AgentraAppStack-${stage}")
            ;;
        web)
            stacks=("AgentraWebHostingStack-${stage}")
            ;;
        data)
            stacks=("AgentraDataAuthStack-${stage}")
            ;;
        gateway)
            stacks=("AgentraAgentCoreStack-${stage}")
            ;;
        all)
            stacks=(
                "AgentraDataAuthStack-${stage}"
                "AgentraAgentCoreStack-${stage}"
                "AgentraSlideRuntimeStack-${stage}"
                "AgentraBedrockKbStack-${stage}"
                "AgentraAgentCoreRuntimeStack-${stage}"
                "AgentraAppStack-${stage}"
                "AgentraWebHostingStack-${stage}"
            )
            ;;
        *)
            echo "ERROR: unknown stack group '$group'." >&2
            echo "Known groups:" >&2
            list_stack_groups >&2
            return 1
            ;;
    esac
    printf '%s\n' "${stacks[@]}"
}

# Convenience: does this group touch the agentcore runtime?
group_includes_runtime() {
    case "${1:-}" in
        agentcore|runtime|all) return 0 ;;
        *) return 1 ;;
    esac
}

# Slide smoke goes through main runtime -> create_slide_presentation tool ->
# slide runtime (see apps/agentcore-runtime-ts/scripts/smoke-agentcore-slide.ts),
# so it requires AgentCoreRuntimeArn from AgentraAgentCoreRuntimeStack. Only
# groups that deploy the main runtime can drive smoke-slide automatically.
# `slide` deploys SlideRuntimeStack only and is intentionally deploy-only here.
group_includes_slide() {
    case "${1:-}" in
        agentcore|all) return 0 ;;
        *) return 1 ;;
    esac
}

# ── destructive-command guard ────────────────────────────────────────────────

require_confirm_stage() {
    local stage="${1:-}"
    validate_stage "$stage" || return 1
    if [[ "${CONFIRM_STAGE:-}" != "$stage" ]]; then
        echo "ERROR: destructive command requires CONFIRM_STAGE=$stage in the environment." >&2
        echo "       Re-run as: CONFIRM_STAGE=$stage <command>" >&2
        return 1
    fi
}

# ── CDK env/context/parameter assembly ───────────────────────────────────────

# Populates the global arrays CDK_CONTEXT and CDK_PARAMS based on the target
# stack group, and validates that required environment variables are present.
#
# Args: <group> <stage> [mode=deploy]
#   mode = deploy   → full deploy semantics:
#                       - web/all also require AMPLIFY_GITHUB_PAT/REPO/BRANCH
#                       - CDK_PARAMS gets --parameters for AgentraWebHostingStack
#   mode = destroy  → cdk destroy semantics:
#                       - never require AMPLIFY_GITHUB_*
#                       - never populate CDK_PARAMS (cdk destroy ignores them)
#                       - URL context is still injected so app synthesis (which
#                         runs before destroy) does not throw "Missing URLs".
#
# Always requires: THIRD_PARTY_API_KEY_SECRET_ARN
# AMPLIFY_URL is folded into Cognito callback / CORS context when set,
# matching the existing cdk-deploy-all behavior. For ephemeral stages without
# AMPLIFY_URL, localhost defaults are injected so synth succeeds.
build_cdk_flags() {
    local group="${1:-}"
    local stage="${2:-}"
    local mode="${3:-deploy}"
    case "$mode" in
        deploy|destroy) ;;
        *)
            echo "ERROR: build_cdk_flags mode must be 'deploy' or 'destroy' (got '$mode')" >&2
            return 1
            ;;
    esac
    validate_stage "$stage" || return 1

    # shellcheck disable=SC2034  # exported via name for the caller
    CDK_CONTEXT=()
    # shellcheck disable=SC2034
    CDK_PARAMS=()

    local required=(THIRD_PARTY_API_KEY_SECRET_ARN)
    if [[ "$mode" == "deploy" ]]; then
        case "$group" in
            web|all)
                required+=(AMPLIFY_URL AMPLIFY_GITHUB_PAT AMPLIFY_GITHUB_REPOSITORY AMPLIFY_GITHUB_BRANCH)
                ;;
        esac
    fi

    local var
    for var in "${required[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            echo "ERROR: required environment variable $var is not set (group=$group, mode=$mode)" >&2
            return 1
        fi
    done

    local env_kind
    env_kind="$(derive_environment_kind "$stage")"

    CDK_CONTEXT+=(-c "stage=$stage")
    CDK_CONTEXT+=(-c "environmentKind=${env_kind}")
    CDK_CONTEXT+=(-c "thirdPartyApiKeysSecretArn=${THIRD_PARTY_API_KEY_SECRET_ARN}")
    if [[ -n "${AMPLIFY_URL:-}" ]]; then
        CDK_CONTEXT+=(-c "callbackUrls=${AMPLIFY_URL},${AMPLIFY_URL}/")
        CDK_CONTEXT+=(-c "logoutUrls=${AMPLIFY_URL},${AMPLIFY_URL}/")
        CDK_CONTEXT+=(-c "corsOrigins=${AMPLIFY_URL}")
    elif [[ "$env_kind" != "shared-dev" && "$env_kind" != "local" ]]; then
        # shared-dev and local kinds use localhost defaults auto-applied by the CDK app.
        # For ephemeral/prod stages without AMPLIFY_URL, inject localhost defaults so
        # synth succeeds for local development and cdk destroy works without a URL.
        local local_urls="http://localhost:3000/,http://127.0.0.1:3000/"
        local local_origins="http://localhost:3000,http://127.0.0.1:3000"
        CDK_CONTEXT+=(-c "callbackUrls=${local_urls}")
        CDK_CONTEXT+=(-c "logoutUrls=${local_urls}")
        CDK_CONTEXT+=(-c "corsOrigins=${local_origins}")
    fi

    if [[ "$mode" == "deploy" ]]; then
        case "$group" in
            web|all)
                CDK_PARAMS+=(--parameters "AgentraWebHostingStack-${stage}:AmplifyGithubAccessToken=${AMPLIFY_GITHUB_PAT}")
                CDK_PARAMS+=(--parameters "AgentraWebHostingStack-${stage}:AmplifyRepositoryUrl=${AMPLIFY_GITHUB_REPOSITORY}")
                CDK_PARAMS+=(--parameters "AgentraWebHostingStack-${stage}:AmplifyBranchName=${AMPLIFY_GITHUB_BRANCH}")
                ;;
        esac
    fi
}

# Load AGENTCORE_RUNTIME_ARN from .agentra/outputs/<stage>.json so smoke recipes
# work immediately after `just cdk-deploy-with-outputs` without manual env setup.
# Silent no-op when the file is missing or the env var is already set — the
# caller may have set AGENTCORE_RUNTIME_ARN manually, which we never overwrite.
# When the file is present but the AgentCore stack key is absent (typical for a
# slide-only deploy), prints an actionable hint to stderr without changing the
# exit status.
#
# Uses node -e for JSON parsing so there is no jq dependency. The file path is
# passed as argv to keep stage names out of the inline JS (no injection risk).
export_runtime_arn_from_outputs() {
    local stage="${1:-}"
    validate_stage "$stage" || return 1
    if [[ -n "${AGENTCORE_RUNTIME_ARN:-}" ]]; then
        return 0
    fi
    local outputs_file=".agentra/outputs/${stage}.json"
    if [[ ! -f "$outputs_file" ]]; then
        return 0
    fi
    local stack_id="AgentraAgentCoreRuntimeStack-${stage}"
    # status: "ok" (arn on stdout) | "missing-key" | "malformed"
    local result
    result=$(node -e '
        const fs = require("fs");
        // With `node -e <script> -- a b`, argv is [nodePath, a, b].
        const [, file, stackId] = process.argv;
        try {
            const o = JSON.parse(fs.readFileSync(file, "utf8"));
            const a = o?.[stackId]?.AgentCoreRuntimeArn;
            if (typeof a === "string" && a.length > 0) {
                process.stdout.write("ok:" + a);
            } else {
                process.stdout.write("missing-key:");
            }
        } catch {
            process.stdout.write("malformed:");
        }
    ' -- "$outputs_file" "$stack_id" 2>/dev/null) || return 0
    case "$result" in
        ok:*)
            export AGENTCORE_RUNTIME_ARN="${result#ok:}"
            echo "Loaded AGENTCORE_RUNTIME_ARN from $outputs_file"
            ;;
        missing-key:*)
            echo "Note: $outputs_file has no $stack_id.AgentCoreRuntimeArn entry." >&2
            echo "      Deploy the 'agentcore' or 'runtime' group, or set AGENTCORE_RUNTIME_ARN manually." >&2
            ;;
        *)
            # Malformed JSON or unexpected output — silent. The smoke script
            # will surface its own AGENTCORE_RUNTIME_ARN-required error if it
            # actually needs the ARN.
            ;;
    esac
}

# Probe whether the installed CDK CLI supports a given long flag.
# Used to keep --revert-drift optional (it lands in CDK ~v2.155+).
cdk_cli_supports_flag() {
    local flag="${1:-}"
    [[ -n "$flag" ]] || return 1
    pnpm --filter @agentra/infra-cdk exec cdk deploy --help 2>/dev/null \
        | grep -q -- "$flag"
}

# ── informational preamble ───────────────────────────────────────────────────

print_stage_info() {
    local stage="${1:-}"
    local group="${2:-}"
    local profile="${3:-}"
    validate_stage "$stage" || return 1
    echo "── CDK stage info ───────────────────────────────────────────"
    echo "stage:   $stage"
    echo "group:   ${group:-<none>}"
    echo "profile: ${profile:-<env credentials>}"
    if [[ -n "$profile" ]] && command -v aws >/dev/null 2>&1; then
        if aws sts get-caller-identity --profile "$profile" --output text \
            --query 'join(`  `, [Account, Arn])' 2>/dev/null; then
            :
        else
            echo "(skipped identity check — profile '$profile' has no usable credentials)" >&2
        fi
    fi
    if [[ -n "$group" ]]; then
        echo "stacks:"
        resolve_stack_group "$group" "$stage" | sed 's/^/  - /'
    fi
    echo "─────────────────────────────────────────────────────────────"
}
