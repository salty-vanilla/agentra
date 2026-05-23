#!/usr/bin/env bash
# Generate a CDK stage slug (≤16 chars) from a branch name or issue number.
#
# Usage:
#   stage-slug.sh                        # use current git branch
#   stage-slug.sh "fix/#252-env-kind"    # explicit branch string
#   stage-slug.sh --issue 252            # explicit issue number only
#
# Slug rules:
#   Issue-based:   i<N>-<topic>          topic trimmed to fit ≤ 16 total
#   Branch-based:  <slug>-<4charhash>    hash ensures uniqueness
#
# Output is lowercase alphanumeric + hyphens, ≤ 16 chars, valid CDK stage.
#
# Examples:
#   fix/#252-env-kind-stages  -> i252-env-kind
#   fix/#219-web-research     -> i219-web-res
#   feature/thread-cache      -> thread-cac-a1b2
#   main                      -> main-a1b2

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

MAX_SLUG_LENGTH=16

# Normalize a string to CDK-safe lowercase alphanumeric + hyphens.
# Replaces non-alphanumeric chars with hyphens, collapses repeats, strips edges.
normalize_slug() {
    local s="${1:-}"
    echo "$s" \
        | tr '[:upper:]' '[:lower:]' \
        | sed 's/[^a-z0-9]/-/g' \
        | sed 's/-\+/-/g' \
        | sed 's/^-//;s/-$//'
}

# 4-char hash from the input string (deterministic).
# Supports both sha256sum (Linux/GNU) and shasum -a 256 (macOS).
short_hash() {
    local input="${1:-}"
    if command -v sha256sum >/dev/null 2>&1; then
        printf '%s' "$input" | sha256sum | cut -c1-4
    elif command -v shasum >/dev/null 2>&1; then
        printf '%s' "$input" | shasum -a 256 | cut -c1-4
    else
        echo "ERROR: sha256sum or shasum is required" >&2
        return 1
    fi
}

# Trim a slug to at most max_len chars, preferring clean hyphen boundaries.
trim_slug() {
    local s="${1:-}"
    local max="${2:-}"
    if (( ${#s} <= max )); then
        echo "$s"
        return
    fi
    local trimmed="${s:0:$max}"
    # Remove trailing incomplete word (after last hyphen)
    trimmed="$(echo "$trimmed" | sed 's/-[^-]*$//')"
    # If sed stripped too much (empty or same), just use raw truncation
    if [[ -z "$trimmed" || "$trimmed" == "$s" ]]; then
        trimmed="${s:0:$max}"
    fi
    echo "$trimmed" | sed 's/-$//'
}

# Parse a branch name and extract (issue_number, topic_slug).
# Sets globals: PARSED_ISSUE, PARSED_TOPIC
parse_branch() {
    local branch="${1:-}"
    local normalized
    normalized="$(normalize_slug "$branch")"

    # Patterns that embed an issue number:
    #   fix/#252-something  -> prefix="fix-252", topic="something"
    #   fix/i252-something  -> prefix="fix-i252", topic="something"
    #   feature/#252        -> no topic
    # We extract the issue number and the remainder after it.
    local issue topic

    # Match: optional-prefix / optional-i / N / optional-hyphen-topic
    if [[ "$normalized" =~ ^([a-z0-9-]*-)?i?([0-9]+)(-(.+))?$ ]]; then
        issue="${BASH_REMATCH[2]}"
        topic="${BASH_REMATCH[4]:-}"
    else
        issue=""
        topic="$normalized"
        # Strip common branch-type prefixes (fix-, feature-, feat-, chore-, etc.)
        topic="$(echo "$topic" | sed 's/^fix-//;s/^feature-//;s/^feat-//;s/^chore-//;s/^refactor-//;s/^hotfix-//')"
    fi

    PARSED_ISSUE="$issue"
    PARSED_TOPIC="$topic"
}

# Build a slug from issue number + optional topic.
# Max total length: MAX_SLUG_LENGTH.
build_issue_slug() {
    local issue="${1:-}"
    local topic="${2:-}"
    local hash="${3:-}"

    local prefix="i${issue}-"
    local available=$(( MAX_SLUG_LENGTH - ${#prefix} ))

    if [[ -z "$topic" ]]; then
        # No topic — use hash as the only differentiator
        local h="${hash:0:4}"
        local slug="${prefix}${h}"
        if (( ${#slug} > MAX_SLUG_LENGTH )); then
            slug="${slug:0:$MAX_SLUG_LENGTH}"
        fi
        echo "$slug"
        return
    fi

    local full_topic="${topic}"
    if (( ${#full_topic} <= available )); then
        # Fits without hash
        echo "${prefix}${full_topic}" | sed 's/-$//'
    else
        # Need to trim; reserve space for "-HASH" (5 chars)
        local max_topic=$(( available - 5 ))
        if (( max_topic < 1 )); then
            # Prefix is very long (issue > 9999); just use prefix + 4-char hash
            local h="${hash:0:4}"
            echo "${prefix:0:$(( MAX_SLUG_LENGTH - 4 ))}${h}" | sed 's/-$//'
            return
        fi
        local trimmed_topic
        trimmed_topic="$(trim_slug "$full_topic" "$max_topic")"
        local h="${hash:0:4}"
        echo "${prefix}${trimmed_topic}-${h}" | sed 's/-$//'
    fi
}

# Build a slug from a branch name without issue number.
build_branch_slug() {
    local topic="${1:-}"
    local hash="${2:-}"

    # Reserve 5 chars for "-HASH"
    local max_topic=$(( MAX_SLUG_LENGTH - 5 ))
    local trimmed_topic
    trimmed_topic="$(trim_slug "$topic" "$max_topic")"
    local h="${hash:0:4}"
    local slug="${trimmed_topic}-${h}"
    echo "$slug" | sed 's/^-//'
}

# Validate slug matches CDK stage rules.
validate_slug() {
    local slug="${1:-}"
    source "$SCRIPT_DIR/cdk-stage.sh" 2>/dev/null || true
    if declare -f validate_stage >/dev/null 2>&1; then
        validate_stage "$slug"
    fi
}

main() {
    local branch=""
    local explicit_issue=""

    case "${1:-}" in
        --issue)
            explicit_issue="${2:-}"
            if [[ -z "$explicit_issue" || ! "$explicit_issue" =~ ^[0-9]+$ ]]; then
                echo "ERROR: --issue requires a numeric argument" >&2
                exit 1
            fi
            ;;
        "")
            # Use current git branch
            if command -v git >/dev/null 2>&1 && git rev-parse --git-dir >/dev/null 2>&1; then
                branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
            fi
            if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
                echo "ERROR: could not determine current git branch. Pass a branch name as argument." >&2
                exit 1
            fi
            ;;
        *)
            branch="$1"
            ;;
    esac

    local hash
    if [[ -n "$explicit_issue" ]]; then
        hash="$(short_hash "issue-${explicit_issue}")"
        slug="$(build_issue_slug "$explicit_issue" "" "$hash")"
    else
        hash="$(short_hash "$branch")"
        parse_branch "$branch"
        if [[ -n "$PARSED_ISSUE" ]]; then
            slug="$(build_issue_slug "$PARSED_ISSUE" "$PARSED_TOPIC" "$hash")"
        else
            slug="$(build_branch_slug "$PARSED_TOPIC" "$hash")"
        fi
    fi

    # Final safety: enforce max length and valid chars
    slug="$(echo "$slug" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/-\+/-/g; s/^-//; s/-$//')"
    slug="${slug:0:$MAX_SLUG_LENGTH}"
    slug="$(echo "$slug" | sed 's/-$//')"

    validate_slug "$slug"
    echo "$slug"
}

main "$@"
