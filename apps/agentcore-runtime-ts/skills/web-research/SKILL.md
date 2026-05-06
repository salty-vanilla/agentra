---
name: web-research
description: Guide web research workflows that turn public web results into evidence, citations, and briefs.
allowed-tools: tavily_search, tavily_extract, tavily_crawl, tavily_map, normalize_evidence_source, build_citations, create_brief, merge_briefs
---

# Web Research Skill

Use this skill when the user asks for up-to-date public information, external facts, product/library comparisons, pricing, documentation, release notes, news, or source-grounded investigation.

## Available tools

- `tavily_search`: broad web search for relevant pages.
- `tavily_extract`: extract clean content from selected URLs.
- `tavily_crawl`: crawl a website when multiple pages are needed.
- `tavily_map`: discover website structure or relevant URLs.
- `normalize_evidence_source`: convert raw web/document/tool results into EvidenceSource objects.
- `build_citations`: create stable citation labels from EvidenceSource objects.
- `create_brief`: create a normalized research brief from explicit facts, constraints, source IDs, and output requirements.
- `merge_briefs`: merge partial briefs as additional evidence is collected.

## Research workflow

1. Clarify whether the user needs current or public information.
2. Use `tavily_search` for broad discovery.
3. Use `tavily_extract` for the most relevant URLs before relying on details.
4. Use `tavily_crawl` only when a site-level investigation is needed.
5. Use `tavily_map` when the relevant page is unknown but likely within a specific domain.
6. Normalize important sources with `normalize_evidence_source`.
7. Build citations with `build_citations`.
8. Create or update a brief with `create_brief` or `merge_briefs` when the result will feed a report, slide, or later tool.

## Citation behavior

- Prefer extracted page content over search snippets when making detailed claims.
- Keep source IDs tied to key facts.
- Do not present unsupported claims as grounded facts.
- When sources conflict, mention the disagreement and cite both.
- For time-sensitive information, include retrieved dates or publication dates when available.

## Tool use guidance

- Use search for discovery.
- Use extract for verification.
- Use crawl sparingly because it can be expensive.
- Use map when navigating docs or websites.
- Do not call citation tools for trivial answers that do not require sources.
- Do not overuse tools when the answer can be given from stable general knowledge.

## Output expectations

For research answers, prefer:

- concise conclusion
- key findings
- citations or sources
- caveats or freshness notes
- next actions when useful

For downstream slide or report generation, produce a brief containing:

- topic
- goal
- keyFacts
- constraints
- sourceIds
- openQuestions
