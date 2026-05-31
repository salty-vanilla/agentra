#!/usr/bin/env bash
# Contact sheets for the Admin Console responsive detail view
# (Compact / Medium / Expanded). Reusable across Admin detail UI PRs.
#
# Tiles the six review screenshots from capture-admin-detail-visual-evidence.mjs
# into one labeled contact sheet per theme (light / dark). Requires ImageMagick 7.
# Output PNGs are review artifacts and are NOT git-managed.
#
# The Issue/PR number belongs in the SHOTS path and the PR comment; pass a custom
# TITLE to embed it in the sheet heading if you want.
#
# Usage (after running capture-admin-detail-visual-evidence.mjs --out "$SHOTS"):
#   SHOTS=/tmp/pr-366 bash scripts/admin-detail-visual-evidence-montage.sh
#   SHOTS=/tmp/pr-366 TITLE='PR #372 — Admin detail responsive' bash ... montage.sh
set -euo pipefail

SHOTS="${SHOTS:-/tmp/agentra-admin-detail-evidence}"
OUT="${OUT:-$SHOTS}"
TITLE="${TITLE:-Admin Console — Compact / Medium / Expanded}"
mkdir -p "$OUT"

# screen id : label, in the 2x3 tile order they should appear.
SCREENS=(
  "01-compact-list|Compact — list (mobile)"
  "02-compact-detail|Compact — detail (full-screen sheet)"
  "03-medium-list|Medium — list (desktop)"
  "04-medium-drawer|Medium — drawer (modal overlay)"
  "05-expanded-unselected|Expanded — unselected (no panel)"
  "06-expanded-panel|Expanded — detail panel (non-modal)"
)

build_sheet() {
  local theme="$1" bg="$2" fill="$3"
  local src_dir="$SHOTS/$theme"
  local args=()
  for entry in "${SCREENS[@]}"; do
    IFS='|' read -r id label <<<"$entry"
    args+=(-label "$label" "$src_dir/${id}.png")
  done

  magick montage \
    "${args[@]}" \
    -tile 2x3 \
    -geometry '760x520+12+14' \
    -background "$bg" \
    -bordercolor '#9ca3af' -border 1 \
    -font Helvetica -pointsize 20 -fill "$fill" \
    -title "$TITLE  [$theme]" \
    "$OUT/contact-sheet-${theme}.png"
  echo "built $OUT/contact-sheet-${theme}.png"
  magick identify -format '%wx%h  %f\n' "$OUT/contact-sheet-${theme}.png"
}

build_sheet light white '#111111'
build_sheet dark '#0c0a09' '#e7e5e4'
