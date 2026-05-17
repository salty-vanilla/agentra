#!/usr/bin/env bash
# Minimal pure-bash tests for scripts/agent/cdk-stage.sh.
# Runs without bats so it works in any local or CI environment.
#
# Usage:  bash scripts/agent/cdk-stage.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./cdk-stage.sh
source "$SCRIPT_DIR/cdk-stage.sh"

PASS=0
FAIL=0
FAILED_NAMES=()

# Disable set -e effects for assertions; we want to keep running.
set +e

# assert_pass <name> <command...>
assert_pass() {
    local name="$1"; shift
    if "$@" >/dev/null 2>&1; then
        PASS=$((PASS + 1))
        echo "  ok   $name"
    else
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        echo "  FAIL $name"
    fi
}

# assert_fail <name> <command...>   (expects non-zero exit)
assert_fail() {
    local name="$1"; shift
    if "$@" >/dev/null 2>&1; then
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        echo "  FAIL $name (expected non-zero exit)"
    else
        PASS=$((PASS + 1))
        echo "  ok   $name"
    fi
}

# assert_equal <name> <expected> <actual>
assert_equal() {
    local name="$1"
    local expected="$2"
    local actual="$3"
    if [[ "$expected" == "$actual" ]]; then
        PASS=$((PASS + 1))
        echo "  ok   $name"
    else
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        echo "  FAIL $name"
        echo "       expected: $expected"
        echo "       actual:   $actual"
    fi
}

echo "── validate_stage ────────────────────────────────────────────"
assert_pass  "valid: dev"                validate_stage dev
assert_pass  "valid: dev-issue-224"      validate_stage dev-issue-224
assert_pass  "valid: dev-codex-rag"      validate_stage dev-codex-rag
assert_pass  "valid: 16-char boundary"   validate_stage abcdefghij012345  # 16 chars
assert_fail  "invalid: empty"            validate_stage ""
assert_fail  "invalid: uppercase"        validate_stage Dev
assert_fail  "invalid: underscore"       validate_stage dev_issue
assert_fail  "invalid: trailing hyphen"  validate_stage dev-
assert_fail  "invalid: leading hyphen"   validate_stage -dev
assert_fail  "invalid: dot"              validate_stage dev.1
assert_fail  "invalid: too long (17)"    validate_stage abcdefghij0123456

echo "── assert_ephemeral_stage ────────────────────────────────────"
assert_pass  "ephemeral: dev-issue-224"  assert_ephemeral_stage dev-issue-224
assert_pass  "ephemeral: dev-codex-rag"  assert_ephemeral_stage dev-codex-rag
assert_fail  "protected: dev"            assert_ephemeral_stage dev
assert_fail  "protected: prod"           assert_ephemeral_stage prod
assert_fail  "protected: production"     assert_ephemeral_stage production
assert_fail  "protected: main"           assert_ephemeral_stage main
assert_fail  "protected: master"         assert_ephemeral_stage master
assert_fail  "protected: staging"        assert_ephemeral_stage staging
assert_fail  "still validates: BAD"      assert_ephemeral_stage BAD

echo "── resolve_stack_group ───────────────────────────────────────"
expected_agentcore="AgentraSlideRuntimeStack-dev-issue-224
AgentraBedrockKbStack-dev-issue-224
AgentraDataAuthStack-dev-issue-224
AgentraAgentCoreRuntimeStack-dev-issue-224"
assert_equal "agentcore group expands"   "$expected_agentcore" \
             "$(resolve_stack_group agentcore dev-issue-224)"

assert_equal "runtime single stack"      "AgentraAgentCoreRuntimeStack-dev-issue-224" \
             "$(resolve_stack_group runtime dev-issue-224)"

assert_equal "data single stack"         "AgentraDataAuthStack-dev" \
             "$(resolve_stack_group data dev)"

assert_equal "all has 7 stacks"          "7" \
             "$(resolve_stack_group all dev | wc -l | tr -d ' ')"

assert_fail  "unknown group rejected"    resolve_stack_group bogus dev
assert_fail  "missing group rejected"    resolve_stack_group "" dev
assert_fail  "bad stage rejected"        resolve_stack_group agentcore BAD

echo "── group_includes_runtime / group_includes_slide ─────────────"
assert_pass  "agentcore includes runtime" group_includes_runtime agentcore
assert_pass  "runtime includes runtime"   group_includes_runtime runtime
assert_pass  "all includes runtime"       group_includes_runtime all
assert_fail  "kb does not include runtime" group_includes_runtime kb
assert_pass  "agentcore includes slide"   group_includes_slide agentcore
assert_pass  "all includes slide"         group_includes_slide all
# Slide smoke needs main-runtime ARN; deploying slide stack alone cannot
# satisfy it, so the helper deliberately excludes the `slide` group.
assert_fail  "slide group excludes slide smoke" group_includes_slide slide
assert_fail  "runtime alone excludes slide" group_includes_slide runtime
assert_fail  "kb excludes slide"          group_includes_slide kb

# Save/restore env vars without subshells so counters stay in this shell.
saved_secret="${THIRD_PARTY_API_KEY_SECRET_ARN:-}"
saved_url="${AMPLIFY_URL:-}"
saved_pat="${AMPLIFY_GITHUB_PAT:-}"
saved_repo="${AMPLIFY_GITHUB_REPOSITORY:-}"
saved_branch="${AMPLIFY_GITHUB_BRANCH:-}"
saved_confirm="${CONFIRM_STAGE:-}"

echo "── build_cdk_flags ───────────────────────────────────────────"
export THIRD_PARTY_API_KEY_SECRET_ARN="arn:aws:secretsmanager:us-east-1:000000000000:secret:foo"
unset AMPLIFY_URL AMPLIFY_GITHUB_PAT AMPLIFY_GITHUB_REPOSITORY AMPLIFY_GITHUB_BRANCH
assert_pass "agentcore group: minimal env ok" build_cdk_flags agentcore dev-issue-224

unset THIRD_PARTY_API_KEY_SECRET_ARN
assert_fail "missing THIRD_PARTY_API_KEY_SECRET_ARN" build_cdk_flags agentcore dev-issue-224

export THIRD_PARTY_API_KEY_SECRET_ARN="arn:foo"
unset AMPLIFY_URL AMPLIFY_GITHUB_PAT AMPLIFY_GITHUB_REPOSITORY AMPLIFY_GITHUB_BRANCH
assert_fail "web group: requires AMPLIFY_URL" build_cdk_flags web dev-issue-224

export AMPLIFY_URL="https://example.com"
export AMPLIFY_GITHUB_PAT="ghp_token"
export AMPLIFY_GITHUB_REPOSITORY="https://github.com/example/repo"
export AMPLIFY_GITHUB_BRANCH="main"
assert_pass "web group: full env ok" build_cdk_flags web dev-issue-224
build_cdk_flags web dev-issue-224 >/dev/null 2>&1
# CDK_PARAMS = 3 --parameters entries = 6 array items
assert_equal "web group adds CFN parameters" "6" "${#CDK_PARAMS[@]}"

build_cdk_flags agentcore dev-issue-224 >/dev/null 2>&1
# 5 -c pairs = 10 items (stage, arn, callbackUrls, logoutUrls, corsOrigins)
assert_equal "AMPLIFY_URL folds into context" "10" "${#CDK_CONTEXT[@]}"

unset AMPLIFY_URL AMPLIFY_GITHUB_PAT AMPLIFY_GITHUB_REPOSITORY AMPLIFY_GITHUB_BRANCH
build_cdk_flags agentcore dev-issue-224 >/dev/null 2>&1
# Ephemeral stage without AMPLIFY_URL: stage + arn + 3 localhost url contexts = 10 items
assert_equal "ephemeral stage: localhost defaults injected" "10" "${#CDK_CONTEXT[@]}"

build_cdk_flags agentcore dev >/dev/null 2>&1
# stage=dev without AMPLIFY_URL: stage + arn only = 4 items (CDK app supplies the rest)
assert_equal "stage=dev: no extra URL context" "4" "${#CDK_CONTEXT[@]}"

echo "── build_cdk_flags mode=destroy ──────────────────────────────"
export THIRD_PARTY_API_KEY_SECRET_ARN="arn:foo"
unset AMPLIFY_URL AMPLIFY_GITHUB_PAT AMPLIFY_GITHUB_REPOSITORY AMPLIFY_GITHUB_BRANCH
assert_pass "destroy + web + missing Amplify env: OK" build_cdk_flags web dev-issue-224 destroy
build_cdk_flags web dev-issue-224 destroy >/dev/null 2>&1
assert_equal "destroy: CDK_PARAMS stays empty"   "0"  "${#CDK_PARAMS[@]}"
# stage + arn + 3 url contexts = 10 items
assert_equal "destroy: URL context still injected" "10" "${#CDK_CONTEXT[@]}"

build_cdk_flags agentcore dev destroy >/dev/null 2>&1
assert_equal "destroy + stage=dev: 4 ctx, 0 params" "4|0" \
             "${#CDK_CONTEXT[@]}|${#CDK_PARAMS[@]}"

assert_fail "invalid mode rejected" build_cdk_flags agentcore dev-issue-224 bogus

# Deploy + web still requires Amplify env (regression guard)
unset AMPLIFY_GITHUB_PAT
export AMPLIFY_URL="https://example.com"
export AMPLIFY_GITHUB_REPOSITORY="https://github.com/example/repo"
export AMPLIFY_GITHUB_BRANCH="main"
assert_fail "deploy + web still requires AMPLIFY_GITHUB_PAT" build_cdk_flags web dev-issue-224 deploy
unset AMPLIFY_URL AMPLIFY_GITHUB_PAT AMPLIFY_GITHUB_REPOSITORY AMPLIFY_GITHUB_BRANCH

echo "── require_confirm_stage ─────────────────────────────────────"
unset CONFIRM_STAGE
assert_fail "missing CONFIRM_STAGE" require_confirm_stage dev-issue-224
export CONFIRM_STAGE=dev-issue-999
assert_fail "wrong CONFIRM_STAGE" require_confirm_stage dev-issue-224
export CONFIRM_STAGE=dev-issue-224
assert_pass "matching CONFIRM_STAGE" require_confirm_stage dev-issue-224

echo "── export_runtime_arn_from_outputs ───────────────────────────"
# Run from a temp working dir so the helper's relative .agentra/outputs path is
# isolated from the real repo state.
saved_pwd="$PWD"
tmpdir="$(mktemp -d -t cdk-stage-test.XXXXXX)"
cd "$tmpdir"
mkdir -p .agentra/outputs

# Case 1: missing file → silent no-op
unset AGENTCORE_RUNTIME_ARN
assert_pass "missing outputs file: no-op"        export_runtime_arn_from_outputs dev-issue-224
assert_equal "missing outputs file: arn unset"   ""    "${AGENTCORE_RUNTIME_ARN:-}"

# Case 2: file present + key present → exports arn
cat > .agentra/outputs/dev-issue-224.json <<'EOF'
{
  "AgentraAgentCoreRuntimeStack-dev-issue-224": {
    "AgentCoreRuntimeArn": "arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/test",
    "AgentCoreRuntimeId": "test-id"
  }
}
EOF
unset AGENTCORE_RUNTIME_ARN
assert_pass "valid outputs file: load succeeds"  export_runtime_arn_from_outputs dev-issue-224
assert_equal "valid outputs file: arn exported"  \
    "arn:aws:bedrock-agentcore:us-east-1:000000000000:runtime/test" \
    "${AGENTCORE_RUNTIME_ARN:-}"

# Case 3: file present but stack key missing → no-op + actionable hint to stderr
cat > .agentra/outputs/dev-issue-225.json <<'EOF'
{"AgentraSlideRuntimeStack-dev-issue-225": {"SlideRuntimeArn": "arn:foo"}}
EOF
unset AGENTCORE_RUNTIME_ARN
hint_stderr=$(export_runtime_arn_from_outputs dev-issue-225 2>&1 >/dev/null)
assert_equal "missing stack key: arn unset"      ""    "${AGENTCORE_RUNTIME_ARN:-}"
if [[ "$hint_stderr" == *"AgentraAgentCoreRuntimeStack-dev-issue-225"* ]]; then
    PASS=$((PASS + 1))
    echo "  ok   missing stack key: hint printed to stderr"
else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("missing stack key: hint printed to stderr")
    echo "  FAIL missing stack key: hint printed to stderr"
    echo "       stderr was: $hint_stderr"
fi
if [[ "$hint_stderr" == *"agentcore"* && "$hint_stderr" == *"runtime"* ]]; then
    PASS=$((PASS + 1))
    echo "  ok   missing stack key: hint references agentcore/runtime groups"
else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("missing stack key: hint references agentcore/runtime groups")
    echo "  FAIL missing stack key: hint references agentcore/runtime groups"
fi

# Case 4: existing AGENTCORE_RUNTIME_ARN must not be overwritten
export AGENTCORE_RUNTIME_ARN="arn:preset"
export_runtime_arn_from_outputs dev-issue-224 >/dev/null
assert_equal "preset env value preserved"        "arn:preset"  "${AGENTCORE_RUNTIME_ARN:-}"

# Case 5: malformed JSON → silent no-op
echo "{not json" > .agentra/outputs/dev-issue-226.json
unset AGENTCORE_RUNTIME_ARN
assert_pass "malformed JSON: no-op"              export_runtime_arn_from_outputs dev-issue-226
assert_equal "malformed JSON: arn unset"         ""    "${AGENTCORE_RUNTIME_ARN:-}"

cd "$saved_pwd"
rm -rf "$tmpdir"
unset AGENTCORE_RUNTIME_ARN

# Restore env so the script leaves the caller's shell clean (in case it's sourced).
[[ -n "$saved_secret" ]]  && export THIRD_PARTY_API_KEY_SECRET_ARN="$saved_secret"  || unset THIRD_PARTY_API_KEY_SECRET_ARN
[[ -n "$saved_url" ]]     && export AMPLIFY_URL="$saved_url"                        || unset AMPLIFY_URL
[[ -n "$saved_pat" ]]     && export AMPLIFY_GITHUB_PAT="$saved_pat"                 || unset AMPLIFY_GITHUB_PAT
[[ -n "$saved_repo" ]]    && export AMPLIFY_GITHUB_REPOSITORY="$saved_repo"         || unset AMPLIFY_GITHUB_REPOSITORY
[[ -n "$saved_branch" ]]  && export AMPLIFY_GITHUB_BRANCH="$saved_branch"           || unset AMPLIFY_GITHUB_BRANCH
[[ -n "$saved_confirm" ]] && export CONFIRM_STAGE="$saved_confirm"                  || unset CONFIRM_STAGE

echo
echo "passed: $PASS    failed: $FAIL"
if (( FAIL > 0 )); then
    echo "failing tests:"
    printf '  - %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
