#!/usr/bin/env bash
# scripts/worktree/cleanup.sh
# Optional GTR postRemove hook. Removes worktree-local generated artifacts
# (.artifacts, .tmp, .env.worktree) before the worktree directory is deleted.
#
# Safety: refuses to run unless the target path lives under a ".worktrees/"
# segment, so an accidental invocation cannot wipe the main checkout.

set -euo pipefail

TARGET="${1:-${GTR_WORKTREE_PATH:-$(pwd)}}"

if [ ! -d "$TARGET" ]; then
  echo "warning: cleanup target does not exist: $TARGET" >&2
  exit 0
fi

cd "$TARGET"
RESOLVED="$(pwd -P)"

case "$RESOLVED" in
  */.worktrees/*) ;;
  *)
    echo "error: refusing to clean outside .worktrees/ (resolved: $RESOLVED)" >&2
    exit 1
    ;;
esac

rm -rf .artifacts .tmp .env.worktree
echo "worktree cleanup complete: $RESOLVED"
