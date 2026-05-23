#!/usr/bin/env bash
# Tests for scripts/agent/stage-slug.sh
# Usage: bash scripts/agent/stage-slug.test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SLUG_SCRIPT="$SCRIPT_DIR/stage-slug.sh"

PASS=0
FAIL=0
FAILED_NAMES=()

set +e

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
        echo "       expected: '$expected'"
        echo "       actual:   '$actual'"
    fi
}

assert_max_len() {
    local name="$1"
    local max="$2"
    local actual="$3"
    if (( ${#actual} <= max )); then
        PASS=$((PASS + 1))
        echo "  ok   $name (len=${#actual})"
    else
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        echo "  FAIL $name: len=${#actual} > $max  (value='$actual')"
    fi
}

assert_valid_slug() {
    local name="$1"
    local actual="$2"
    if [[ "$actual" =~ ^[a-z0-9]([a-z0-9-]*[a-z0-9])?$ ]] && (( ${#actual} <= 16 )); then
        PASS=$((PASS + 1))
        echo "  ok   $name (slug='$actual')"
    else
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
        echo "  FAIL $name: invalid slug='$actual'"
    fi
}

run_slug() {
    bash "$SLUG_SCRIPT" "$@" 2>/dev/null
}

echo "── issue-based slugs ─────────────────────────────────────────"

# fix/#252-env-kind-stages -> i252-env-kind (fits without hash)
result="$(run_slug "fix/#252-env-kind-stages")"
assert_valid_slug "fix/#252-env-kind-stages: valid" "$result"
assert_max_len    "fix/#252-env-kind-stages: ≤16"   16 "$result"
# Should start with i252-
[[ "$result" == i252-* ]] && { PASS=$((PASS+1)); echo "  ok   fix/#252-env-kind-stages: starts i252-"; } \
                           || { FAIL=$((FAIL+1)); FAILED_NAMES+=("fix/#252-env-kind-stages: starts i252-"); echo "  FAIL fix/#252-env-kind-stages: starts i252-, got '$result'"; }

# fix/#252-files -> i252-files (short topic, no hash needed)
result="$(run_slug "fix/#252-files")"
assert_equal      "fix/#252-files: exact match"     "i252-files" "$result"

# fix/#1-x -> i1-x (very short)
result="$(run_slug "fix/#1-x")"
assert_valid_slug  "fix/#1-x: valid"  "$result"
[[ "$result" == i1-* ]] && { PASS=$((PASS+1)); echo "  ok   fix/#1-x: starts i1-"; } \
                         || { FAIL=$((FAIL+1)); FAILED_NAMES+=("fix/#1-x: starts i1-"); echo "  FAIL fix/#1-x: starts i1-, got '$result'"; }

# fix/#9999-very-long-description-here -> i9999-ve... ≤16
result="$(run_slug "fix/#9999-very-long-description-here")"
assert_valid_slug "fix/#9999-long-desc: valid"  "$result"
assert_max_len   "fix/#9999-long-desc: ≤16"     16 "$result"
[[ "$result" == i9999-* ]] && { PASS=$((PASS+1)); echo "  ok   fix/#9999-long-desc: starts i9999-"; } \
                            || { FAIL=$((FAIL+1)); FAILED_NAMES+=("fix/#9999-long-desc: starts i9999-"); echo "  FAIL fix/#9999-long-desc: starts i9999-, got '$result'"; }

# --issue flag
result="$(run_slug --issue 252)"
assert_valid_slug "--issue 252: valid" "$result"
[[ "$result" == i252-* ]] && { PASS=$((PASS+1)); echo "  ok   --issue 252: starts i252-"; } \
                           || { FAIL=$((FAIL+1)); FAILED_NAMES+=("--issue 252: starts i252-"); echo "  FAIL --issue 252: starts i252-, got '$result'"; }

echo "── branch-only slugs ─────────────────────────────────────────"

# feature/thread-cache -> thread-cac-HASH
result="$(run_slug "feature/thread-cache")"
assert_valid_slug "feature/thread-cache: valid" "$result"
assert_max_len   "feature/thread-cache: ≤16"  16 "$result"

# Very long branch name
result="$(run_slug "feature/some-very-long-feature-branch-name")"
assert_valid_slug "long branch: valid"  "$result"
assert_max_len   "long branch: ≤16"    16 "$result"

# Single-word branch
result="$(run_slug "main")"
assert_valid_slug "main branch: valid"  "$result"
assert_max_len   "main branch: ≤16"    16 "$result"

echo "── determinism ───────────────────────────────────────────────"
result1="$(run_slug "fix/#252-env-kind-stages")"
result2="$(run_slug "fix/#252-env-kind-stages")"
assert_equal "same input → same output" "$result1" "$result2"

result1="$(run_slug "fix/#252-files")"
result2="$(run_slug "fix/#252-files")"
assert_equal "fix/#252-files deterministic" "$result1" "$result2"

echo "── different inputs produce different slugs ──────────────────"
slug_a="$(run_slug "fix/#252-files")"
slug_b="$(run_slug "fix/#253-files")"
if [[ "$slug_a" != "$slug_b" ]]; then
    PASS=$((PASS + 1))
    echo "  ok   different issue numbers -> different slugs"
else
    FAIL=$((FAIL + 1))
    FAILED_NAMES+=("different issue numbers -> different slugs")
    echo "  FAIL different issue numbers -> different slugs: '$slug_a' == '$slug_b'"
fi

echo
echo "passed: $PASS    failed: $FAIL"
if (( FAIL > 0 )); then
    echo "failing tests:"
    printf '  - %s\n' "${FAILED_NAMES[@]}"
    exit 1
fi
exit 0
