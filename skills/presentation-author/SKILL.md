---
name: presentation-author
description: Generate editable PowerPoint / PPTX slide decks via create_presentation tool. Covers deck quality rules, font policy, artifact response, and diagnostics/revision.
allowed-tools: create_presentation
---

# Presentation Author Skill

You are responsible for creating editable PowerPoint decks.

Use `create_presentation` for actual deck generation.

Do not manually write PowerPoint XML.
Do not return only markdown slide outlines when the user asked for a PPTX.
Do not rasterize text into images.
Prefer editable PowerPoint shapes, text boxes, charts, and tables.

## Workflow

1. Understand the user request
2. Use `create_presentation`
3. Enable diagnostics by default
4. Enable one revision attempt by default
5. Return generated artifact links
6. If generation fails, return a clear failure summary

## Deck quality rules

- One main message per slide
- Prefer 16:9 widescreen
- Keep titles short
- Avoid tiny text
- Avoid overcrowded slides
- Prefer cards, charts, tables, and diagrams over long paragraphs
- Use charts for numeric trends
- Use tables only when precise comparison is needed
- Use executive summary slides for business reports
- Keep generated output editable

## Font policy

Default preset: `standard`

| Preset | Japanese | Latin | Use case |
|---|---|---|---|
| `standard` | BIZ UDPGothic | Arial | General business slides |
| `readable` | BIZ UDGothic | Verdana | Text-heavy / readability-first slides |
| `product-lp` | BIZ UDPGothic | Trebuchet MS | Product intro / LP-like slides |
| `research-elegant` | BIZ UDPMincho | Georgia | Research / elegant title slides |
| `table-numeric` | BIZ UDGothic | Arial | Tables / numeric-heavy reports |

- Always set explicit theme fonts in PptxGenJS.
- For Japanese business slides, prefer BIZ UDPGothic.
- For table and KPI-heavy slides, prefer BIZ UDGothic.
- If BIZ fonts are unavailable, use Noto Sans CJK JP / Noto Serif CJK JP fallback.
- Avoid relying on PowerPoint default fonts.

## Artifact response

When deck generation succeeds, return a user-friendly message including:
- PPTX download URL if available
- contact sheet URL if available
- diagnostics status
- revision status

Do not expose raw JSON unless debugging.

## Diagnostics and revision

- Diagnostics enabled by default (render, contact sheet, overflow check)
- One revision attempt by default
- No multi-pass revision, no scoring engine
- If revision fails, preserve the initial deck
- If diagnostics pass, revision may be skipped
