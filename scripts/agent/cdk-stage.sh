#!/usr/bin/env bash
# Shared helpers for stage-aware CDK justfile recipes.
#
# This file is meant to be sourced, not executed directly.
# Mirrors the stage contract enforced in infra/cdk/bin/agentra-cdk.ts.
#
# Functions:
#   validate_stage <stage>            Pattern + length check.
#   assert_ephemeral_stage <stage>    validate_stage + reject stable/prod names.
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
            echo "       Use a per-worktree stage like 'dev-issue-<N>' or 'dev-<agent>-<topic>'." >&2
            return 1
        fi
    done
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

# Convenience: does this group touch slide rendering?
group_includes_slide() {
    case "${1:-}" in
        agentcore|slide|all) return 0 ;;
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
# Always requires: THIRD_PARTY_API_KEY_SECRET_ARN
# When deploying web/all: also AMPLIFY_URL, AMPLIFY_GITHUB_PAT,
#                          AMPLIFY_GITHUB_REPOSITORY, AMPLIFY_GITHUB_BRANCH
#
# AMPLIFY_URL is also folded into Cognito callback / CORS context when set,
# matching the existing cdk-deploy-all behavior.
build_cdk_flags() {
    local group="${1:-}"
    local stage="${2:-}"
    validate_stage "$stage" || return 1

    # shellcheck disable=SC2034  # exported via name for the caller
    CDK_CONTEXT=()
    # shellcheck disable=SC2034
    CDK_PARAMS=()

    local required=(THIRD_PARTY_API_KEY_SECRET_ARN)
    case "$group" in
        web|all)
            required+=(AMPLIFY_URL AMPLIFY_GITHUB_PAT AMPLIFY_GITHUB_REPOSITORY AMPLIFY_GITHUB_BRANCH)
            ;;
    esac

    local var
    for var in "${required[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            echo "ERROR: required environment variable $var is not set (group=$group)" >&2
            return 1
        fi
    done

    CDK_CONTEXT+=(-c "stage=$stage")
    CDK_CONTEXT+=(-c "thirdPartyApiKeysSecretArn=${THIRD_PARTY_API_KEY_SECRET_ARN}")
    if [[ -n "${AMPLIFY_URL:-}" ]]; then
        CDK_CONTEXT+=(-c "callbackUrls=${AMPLIFY_URL},${AMPLIFY_URL}/")
        CDK_CONTEXT+=(-c "logoutUrls=${AMPLIFY_URL},${AMPLIFY_URL}/")
        CDK_CONTEXT+=(-c "corsOrigins=${AMPLIFY_URL}")
    elif [[ "$stage" != "dev" ]]; then
        # bin/agentra-cdk.ts only auto-applies localhost defaults for stage=dev.
        # For ephemeral stages we inject the same defaults so the developer's
        # local frontend can talk to the deployed Cognito + APIs.
        local local_urls="http://localhost:3000/,http://127.0.0.1:3000/"
        local local_origins="http://localhost:3000,http://127.0.0.1:3000"
        CDK_CONTEXT+=(-c "callbackUrls=${local_urls}")
        CDK_CONTEXT+=(-c "logoutUrls=${local_urls}")
        CDK_CONTEXT+=(-c "corsOrigins=${local_origins}")
    fi

    case "$group" in
        web|all)
            CDK_PARAMS+=(--parameters "AgentraWebHostingStack-${stage}:AmplifyGithubAccessToken=${AMPLIFY_GITHUB_PAT}")
            CDK_PARAMS+=(--parameters "AgentraWebHostingStack-${stage}:AmplifyRepositoryUrl=${AMPLIFY_GITHUB_REPOSITORY}")
            CDK_PARAMS+=(--parameters "AgentraWebHostingStack-${stage}:AmplifyBranchName=${AMPLIFY_GITHUB_BRANCH}")
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
