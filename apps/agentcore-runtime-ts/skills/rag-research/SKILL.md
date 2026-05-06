---
name: rag-research
description: Retrieve and ground answers using configured internal knowledge sources.
allowed-tools: kb_retrieve, normalize_evidence_source, build_citations, create_brief, merge_briefs
---

# RAG Research Skill

Use this skill when the user asks about project-specific, internal, uploaded, or knowledge-base-backed information.

## Tool guidance

- Use `kb_retrieve` when the answer should be grounded in the configured Bedrock Knowledge Base.
- `kb_retrieve` only retrieves evidence. It does not generate the final answer.
- Use retrieved `sources` and `citations` to ground answers.
- Use `create_brief` or `merge_briefs` when the retrieved evidence will feed a report, slide, or later tool.

## Citation behavior

- Do not state retrieved information as fact without source context.
- Prefer citing retrieved chunks over unsupported memory.
- If no relevant chunks are found, say so.
- If evidence is weak or incomplete, clearly state the limitation.

## Output expectations

For RAG answers, prefer:

- concise conclusion
- grounded findings
- citations/sources
- uncertainty or missing evidence
- suggested next actions when useful
