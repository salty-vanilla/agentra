#!/usr/bin/env bash
# Sync the vendored SDPM Skill (Layer 1) into the repo from upstream.
#
# Vendors only the subset needed to generate PPTX from a Deck Workspace:
#   sdpm/ (engine) + scripts/pptx_builder.py (CLI) + templates/ + pyproject.toml + LICENSE
#
# Usage: scripts/vendor/sync-sdpm-skill.sh [<git-ref>]
#   <git-ref> defaults to the upstream default branch HEAD.
#
# After running, review the diff and update vendor/sdpm-skill/VENDOR.md notes if
# the skill version changed. MIT-0: no attribution obligation, kept by practice.
set -euo pipefail

UPSTREAM="https://github.com/aws-samples/sample-spec-driven-presentation-maker.git"
REF="${1:-}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
vendor_dir="$repo_root/packages/presentation-author/vendor/sdpm-skill"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

echo "Cloning $UPSTREAM ..."
git clone --depth 1 ${REF:+--branch "$REF"} "$UPSTREAM" "$tmp_dir/sdpm"
sha="$(cd "$tmp_dir/sdpm" && git rev-parse HEAD)"
version="$(grep -E '__version__' "$tmp_dir/sdpm/skill/sdpm/__init__.py" | head -1 | sed -E 's/.*"(.*)".*/\1/')"

echo "Vendoring subset (commit $sha, version $version) ..."
rm -rf "$vendor_dir/sdpm" "$vendor_dir/scripts" "$vendor_dir/templates"
rsync -a --exclude='__pycache__' --exclude='*.pyc' "$tmp_dir/sdpm/skill/sdpm" "$vendor_dir/"
rsync -a --exclude='__pycache__' --exclude='*.pyc' "$tmp_dir/sdpm/skill/scripts" "$vendor_dir/"
rsync -a "$tmp_dir/sdpm/skill/templates" "$vendor_dir/"
cp "$tmp_dir/sdpm/LICENSE" "$vendor_dir/LICENSE"
cp "$tmp_dir/sdpm/skill/pyproject.toml" "$vendor_dir/pyproject.toml"

echo
echo "Done. Update vendor/sdpm-skill/VENDOR.md:"
echo "  Pinned commit: $sha"
echo "  Skill version: $version"
echo "Review the diff before committing."
