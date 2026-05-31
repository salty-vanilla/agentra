#!/usr/bin/env bash
# Final adoption montage for Issue #362.
#
# Tiles the five review screenshots from font-adoption-capture.mjs into a single
# labeled contact sheet showing the adopted typeface
# (IBM Plex Sans + IBM Plex Sans JP) across the app. Requires ImageMagick 7.
# Output PNG is NOT git-managed.
#
# Usage:
#   bash scripts/font-adoption-montage.sh
set -euo pipefail

SHOTS="${SHOTS:-/tmp/agentra-font-preview/final}"
OUT="${OUT:-/tmp/agentra-font-preview/montage}"
mkdir -p "$OUT"

# screen id : label : crop box (native 2880x1800, DSR2) tuned to content.
SCREENS=(
  "chat|Chat (JP prompt / English-mixed reply / mono artifact)|2880x900+0+90"
  "admin-table|Admin Table (JP labels / IDs / dates / badges)|2880x620+0+0"
  "dialog|Dialog / Form (labels / placeholder / input / warning)|1640x1180+620+300"
  "sidebar-navigation|Sidebar / Navigation (admin shell)|1700x1300+0+0"
  "traces-observability|Traces / Observability (table density)|2880x760+0+150"
)

tmp="$OUT/.crop-final"
mkdir -p "$tmp"
args=()
for entry in "${SCREENS[@]}"; do
  IFS='|' read -r id label crop <<<"$entry"
  src="$SHOTS/${id}.png"
  cropped="$tmp/${id}.png"
  magick "$src" -crop "$crop" +repage -resize '900x' "$cropped"
  args+=(-label "$label" "$cropped")
done

magick montage \
  "${args[@]}" \
  -tile 2x3 \
  -geometry '+16+18' \
  -background white \
  -bordercolor '#d4d4d4' -border 1 \
  -font Helvetica -pointsize 22 -fill '#111111' \
  -title 'Issue #362 — Adopted font: IBM Plex Sans + IBM Plex Sans JP  [light]' \
  "$OUT/font-adoption-montage.png"
rm -rf "$tmp"

echo "built $OUT/font-adoption-montage.png"
magick identify -format '%wx%h  %f\n' "$OUT/font-adoption-montage.png"
