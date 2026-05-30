#!/usr/bin/env bash
# .claude/hooks/worktree-create.sh
#
# WorktreeCreate hook for Claude Code.
# This hook REPLACES Claude Code's default worktree creation behavior.
#
# stdin:  JSON with .name field (provided by Claude Code)
# stdout: absolute path of the created worktree — ONLY this, nothing else
# stderr: all progress and error messages

set -euo pipefail

# ── Parse input ───────────────────────────────────────────────────────────────
INPUT="$(cat)"
WORKTREE_NAME="$(printf '%s' "$INPUT" | jq -r '.name // empty')"
if [ -z "$WORKTREE_NAME" ]; then
  echo "error: WorktreeCreate hook: .name is missing from stdin JSON" >&2
  echo "  received: $INPUT" >&2
  exit 1
fi

# ── Locate repo root ──────────────────────────────────────────────────────────
REPO_ROOT="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"
if [ -z "$REPO_ROOT" ]; then
  echo "error: WorktreeCreate hook: cannot determine repo root" >&2
  exit 1
fi

# ── Sanitize name for directory use ──────────────────────────────────────────
# Keep alphanumeric, hyphens, dots, underscores; collapse runs of dashes.
SAFE_DIR="$(printf '%s' "$WORKTREE_NAME" \
  | tr -cs 'a-zA-Z0-9._-' '-' \
  | sed -e 's/-\{2,\}/-/g' -e 's/^-*//' -e 's/-*$//')"
if [ -z "$SAFE_DIR" ]; then
  echo "error: WorktreeCreate hook: sanitized name is empty (input: '$WORKTREE_NAME')" >&2
  exit 1
fi

WORKTREES_BASE="$REPO_ROOT/.worktrees"
WORKTREE_PATH="$WORKTREES_BASE/$SAFE_DIR"

echo "WorktreeCreate: name='$WORKTREE_NAME' path=$WORKTREE_PATH" >&2

mkdir -p "$WORKTREES_BASE"

# ── Create git branch + worktree ──────────────────────────────────────────────
if git -C "$REPO_ROOT" worktree list --porcelain | grep -qF "worktree $WORKTREE_PATH"; then
  echo "worktree already exists at $WORKTREE_PATH; reusing" >&2
else
  BRANCH="$WORKTREE_NAME"
  if git -C "$REPO_ROOT" show-ref --quiet "refs/heads/$BRANCH" 2>/dev/null; then
    echo "checking out existing branch '$BRANCH' into new worktree" >&2
    git -C "$REPO_ROOT" worktree add "$WORKTREE_PATH" "$BRANCH" >&2
  else
    echo "creating new branch '$BRANCH' in worktree" >&2
    git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_PATH" >&2
  fi
fi

# ── Copy untracked bootstrap files (mirrors .gtrconfig [copy] include list) ──
# Tracked files (.envrc, .env.example) are already present via git worktree add.
# Only copy the gitignored / machine-local files that git does not include.
copy_if_missing() {
  local src="$1" dst="$2"
  if [ -f "$src" ] && [ ! -f "$dst" ]; then
    cp "$src" "$dst"
    chmod 600 "$dst" 2>/dev/null || true
    echo "copied $(basename "$src") to worktree" >&2
  fi
}

for f in .env .env.local .envrc.local .npmrc; do
  copy_if_missing "$REPO_ROOT/$f" "$WORKTREE_PATH/$f"
done

# ── Run setup.sh in the worktree ──────────────────────────────────────────────
SETUP="$REPO_ROOT/scripts/worktree/setup.sh"
if [ -f "$SETUP" ]; then
  echo "running scripts/worktree/setup.sh..." >&2
  AGENTRA_WORKTREE_ROOT="$WORKTREE_PATH" \
  AGENTRA_SOURCE_ROOT="$REPO_ROOT" \
    bash "$SETUP" >&2
else
  echo "warning: scripts/worktree/setup.sh not found; skipping bootstrap" >&2
fi

# ── Output worktree path to stdout (must be the only stdout line) ─────────────
printf '%s\n' "$WORKTREE_PATH"
