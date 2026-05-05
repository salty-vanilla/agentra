# Lucide Icons — Curated Subset

## Source

[Lucide Icons](https://lucide.dev/) — a community-maintained fork of Feather Icons.

## License

ISC License — see [LICENSE](https://github.com/lucide-icons/lucide/blob/main/LICENSE)

## How assets were obtained

SVG files were manually copied from the Lucide icon set (v0.460+).
Only a small curated subset relevant to business/manufacturing presentations is included.

## Attribution

Icons by Lucide contributors, licensed under ISC.
No attribution required by ISC license, but credit is appreciated.

## Included icons

| ID | Label | Use case |
|----|-------|----------|
| alert-triangle | Alert Triangle | Risk, warning |
| bar-chart-3 | Bar Chart | KPI, metrics |
| calendar | Calendar | Schedule, timeline |
| check-circle | Check Circle | Quality, success |
| clipboard-list | Clipboard List | Action plan, tasks |
| factory | Factory | Manufacturing, production |
| gauge | Gauge | Performance, measurement |
| image | Image | Visual, photo |
| lightbulb | Lightbulb | Idea, insight |
| line-chart | Line Chart | Trend, analytics |
| presentation | Presentation | Slide, deck |
| settings | Settings | Configuration |
| shield-check | Shield Check | Security, quality |
| target | Target | Goal, objective |
| trending-up | Trending Up | Improvement, growth |
| users | Users | Team, stakeholders |
| wrench | Wrench | Tool, maintenance |

## Update procedure

1. Download desired SVG from https://lucide.dev/icons/
2. Place in `svg/` directory
3. Add entry to `manifest.json` with keywords (EN + JP)
4. Run tests: `pnpm --filter @agentra/presentation-author test`
