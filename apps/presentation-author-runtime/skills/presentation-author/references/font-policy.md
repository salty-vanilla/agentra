# Font Policy

Default preset: `standard`

| Preset | Japanese | Latin | Use case |
|---|---|---|---|
| `standard` | BIZ UDPGothic | Arial | General business slides |
| `readable` | BIZ UDGothic | Verdana | Text-heavy / readability-first slides |
| `product-lp` | BIZ UDPGothic | Trebuchet MS | Product intro / LP-like slides |
| `research-elegant` | BIZ UDPMincho | Georgia | Research / elegant title slides |
| `table-numeric` | BIZ UDGothic | Arial | Tables / numeric-heavy reports |

## Rules

- Always set explicit theme fonts in PptxGenJS.
- For Japanese business slides, prefer BIZ UDPGothic.
- For table and KPI-heavy slides, prefer BIZ UDGothic.
- If BIZ fonts are unavailable in the runtime, use Noto Sans CJK JP / Noto Serif CJK JP fallback.
- Avoid relying on PowerPoint default fonts.
