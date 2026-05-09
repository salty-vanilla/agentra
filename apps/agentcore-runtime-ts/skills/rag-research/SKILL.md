---
name: rag-research
description: Retrieve and ground answers using configured internal knowledge sources.
allowed-tools: kb_retrieve, structured_query_plan, structured_plan_readiness, structured_rag_flow, structured_query_execute_mock, structured_query_execute_bedrock_stub, normalize_evidence_source, build_citations, create_brief, merge_briefs
---

# RAG Research Skill

Use this skill when the user asks about project-specific, internal, uploaded, or knowledge-base-backed information.

## Tool guidance

- Use `kb_retrieve` when the answer should be grounded in the configured Bedrock Knowledge Base.
- `kb_retrieve` only retrieves evidence. It does not generate the final answer.
- Use `structured_query_plan` when the user asks about structured data, metrics, aggregations, rankings, time-series trends, equipment history, anomaly summaries, or error-code lookup.
- `structured_query_plan` only creates a deterministic plan. It does not generate SQL, execute SQL, or call a database.
- Use `structured_plan_readiness` after `structured_query_plan` when you need to check missing information, provider preference, or the next safe action.
- Use `structured_rag_flow` for the common path of planning, validation, readiness evaluation, and safe execution.
- Prefer `structured_rag_flow` over manually calling all low-level structured tools unless detailed control is needed.
- `structured_rag_flow` must not bypass readiness gating.
- `structured_rag_flow` must not generate SQL or query databases directly.
- Prefer Bedrock structured execution when the plan is ready and the Bedrock structured provider is enabled.
- Use `structured_query_execute_mock` only to validate the structured RAG pipeline or demonstrate expected result shape.
- `structured_query_execute_mock` does not query real data, generate SQL, or call any database.
- Prefer `structured_query_plan` before asking follow-up questions when the request is partially specified. Use `missingSlots` to decide whether a follow-up is needed.
- For anomaly analysis, use the generic `anomaly_summary` intent and represent the target signal through metrics, filters, target entity, or metadata. Do not create one intent per signal such as temperature, pressure, or vibration.
- `structured_query_execute_bedrock_stub` is disabled by default and is only for validating future Bedrock KB structured provider wiring.
- It returns `not_implemented` and does not query real Bedrock structured data.
- Do not present its output as real data.
- Bedrock KB structured execution is still in stub mode until a live provider is implemented.
- Treat `not_implemented` outputs as wiring validation only.
- Do not present stub or dry-run results as real production data.
- Use retrieved `sources` and `citations` to ground answers.
- Use `create_brief` or `merge_briefs` when the retrieved evidence will feed a report, slide, or later tool.
- Use `metadataFilter` when the user specifies document type, project, source, category, date-like metadata, or any other explicit KB metadata constraint.
- Use `scoreThreshold` only when the user asks for stricter relevance or when low-quality chunks should be excluded.
- `queryRewriteHint` is metadata only in this phase; it records intended expansion but does not rewrite the query automatically.

## Citation behavior

- Do not state retrieved information as fact without source context.
- Prefer citing retrieved chunks over unsupported memory.
- If no relevant chunks are found, say so.
- If no results are returned, clearly state that no relevant chunks were found.
- If evidence is weak or incomplete, clearly state the limitation.
- Do not invent missing evidence.
- Do not present mock rows as real production data.

## Output expectations

For RAG answers, prefer:

- concise conclusion
- grounded findings
- citations/sources
- uncertainty or missing evidence
- suggested next actions when useful
