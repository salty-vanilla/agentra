#!/usr/bin/env bash
# scripts/worktree/setup.sh
# Bootstrap a freshly-created git worktree (or Codex App Local Environment).
#
# Responsibilities (idempotent):
#   1. Copy .env.local / .env from the source tree if missing in the worktree.
#   2. Generate .env.worktree with per-worktree overrides.
#   3. Create .artifacts/ and .tmp/ directories.
#   4. direnv allow (when available).
#   5. pnpm install --frozen-lockfile.
#
# This script must never echo the contents of .env / .env.local — only
# status lines indicating which files were copied.

set -euo pipefail
umask 077

# ── Resolve worktree + source root ───────────────────────────────────────────
WORKTREE_ROOT="${CODEX_WORKTREE_PATH:-$(pwd)}"
cd "$WORKTREE_ROOT"

SOURCE_ROOT="${CODEX_SOURCE_TREE_PATH:-${AGENTRA_SOURCE_ROOT:-}}"
if [ -z "$SOURCE_ROOT" ]; then
  # In a regular `git worktree`, the common dir of a worktree points at the
  # source repo's `.git`. dirname of that gives the source working tree.
  COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -n "$COMMON_DIR" ]; then
    if [ -d "$COMMON_DIR" ]; then
      SOURCE_ROOT="$(cd "$COMMON_DIR/.." 2>/dev/null && pwd || true)"
    fi
  fi
fi

# ── Copy env files from source (never overwrite) ─────────────────────────────
copy_if_missing() {
  local src="$1"
  local dst="$2"
  if [ -f "$dst" ]; then
    echo "skip $(basename "$dst") (already exists)"
    return 0
  fi
  if [ -f "$src" ]; then
    cp "$src" "$dst"
    chmod 600 "$dst" 2>/dev/null || true
    echo "copied $(basename "$src") into worktree"
  fi
}

if [ -n "$SOURCE_ROOT" ] && [ "$SOURCE_ROOT" != "$WORKTREE_ROOT" ]; then
  if [ -f "$SOURCE_ROOT/.env.local" ]; then
    copy_if_missing "$SOURCE_ROOT/.env.local" ".env.local"
  elif [ -f "$SOURCE_ROOT/.env" ]; then
    copy_if_missing "$SOURCE_ROOT/.env" ".env"
  else
    echo "warning: no .env or .env.local found at $SOURCE_ROOT; copy one from .env.example before running pnpm"
  fi
else
  echo "skip env copy (no separate source root resolved)"
fi

# ── Derive worktree name + stage slug ────────────────────────────────────────
WORKTREE_NAME="$(basename "$WORKTREE_ROOT")"

# Lowercase, replace non [a-z0-9-] with -, collapse repeated -, trim, cap 32 chars.
SAFE_NAME="$(printf '%s' "$WORKTREE_NAME" \
  | tr '[:upper:]' '[:lower:]' \
  | tr -c 'a-z0-9-' '-' \
  | sed -e 's/-\{2,\}/-/g' -e 's/^-//' -e 's/-$//' \
  | cut -c1-32)"

# Stage must satisfy CDK validateStage: ^[a-z0-9-]+$ and <= 16 chars.
# Prefer leading digits (issue number); else use up to 12 chars of safe name.
LEADING_NUM="$(printf '%s' "$SAFE_NAME" | sed -n 's/^\([0-9]\{1,\}\).*/\1/p')"
if [ -n "$LEADING_NUM" ]; then
  STAGE_SLUG="$LEADING_NUM"
else
  STAGE_SLUG="$(printf '%s' "$SAFE_NAME" | cut -c1-12 | sed 's/-\{1,\}$//')"
fi
AGENTRA_STAGE_VALUE="dev-$STAGE_SLUG"
# Paranoid guard so we never violate the CDK 16-char rule.
if [ "${#AGENTRA_STAGE_VALUE}" -gt 16 ]; then
  AGENTRA_STAGE_VALUE="$(printf '%s' "$AGENTRA_STAGE_VALUE" | cut -c1-16 | sed 's/-\{1,\}$//')"
fi

# ── Working directories ──────────────────────────────────────────────────────
mkdir -p .artifacts .tmp

# ── Generate .env.worktree (derived values only; safe to overwrite) ──────────
{
  echo "AGENTRA_WORKTREE_NAME=$SAFE_NAME"
  echo "AGENTRA_STAGE=$AGENTRA_STAGE_VALUE"
  echo "AGENTRA_ARTIFACT_DIR=$WORKTREE_ROOT/.artifacts"
  echo "AGENTRA_TMP_DIR=$WORKTREE_ROOT/.tmp"
  echo "AGENTRA_LOG_PREFIX=$SAFE_NAME"
} > .env.worktree
chmod 600 .env.worktree 2>/dev/null || true

# ── direnv ───────────────────────────────────────────────────────────────────
if command -v direnv >/dev/null 2>&1; then
  if direnv allow . >/dev/null 2>&1; then
    echo "direnv allow ok"
  else
    echo "warning: direnv allow failed; run 'direnv allow .' manually"
  fi
else
  echo "warning: direnv is not installed; skipping direnv allow"
fi

# ── Node toolchain ───────────────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  echo "error: pnpm is not available. Run 'corepack enable' or 'npm install -g pnpm@10.9.0'." >&2
  exit 1
fi

if command -v direnv >/dev/null 2>&1; then
  direnv exec . pnpm install --frozen-lockfile
else
  pnpm install --frozen-lockfile
fi

echo "worktree setup complete: $SAFE_NAME (stage: $AGENTRA_STAGE_VALUE)"
