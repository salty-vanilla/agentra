#!/usr/bin/env bash
# Contact sheets for Issue #366 — Admin Console Compact / Medium / Expanded.
#
# Tiles the six review screenshots from issue-366-capture.mjs into one labeled
# contact sheet per theme (light / dark). Requires ImageMagick 7.
# Output PNGs are review artifacts and are NOT git-managed.
#
# Usage (after running issue-366-capture.mjs --out "$SHOTS"):
#   SHOTS=/tmp/pr-366 bash scripts/issue-366-montage.sh
set -euo pipefail

SHOTS="${SHOTS:-/tmp/agentra-issue-366-evidence}"
OUT="${OUT:-$SHOTS}"
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
    -title "Issue #366 — Admin Console Compact / Medium / Expanded  [$theme]" \
    "$OUT/contact-sheet-${theme}.png"
  echo "built $OUT/contact-sheet-${theme}.png"
  magick identify -format '%wx%h  %f\n' "$OUT/contact-sheet-${theme}.png"
}

build_sheet light white '#111111'
build_sheet dark '#0c0a09' '#e7e5e4'
