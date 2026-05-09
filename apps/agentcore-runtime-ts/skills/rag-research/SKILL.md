---
name: rag-research
description: Retrieve and ground answers using configured internal knowledge sources.
allowed-tools: kb_retrieve, kb_rag_flow, kb_answer_synthesis, kb_query_readiness, kb_rag_diagnostics, structured_query_plan, structured_plan_readiness, structured_rag_flow, structured_answer_synthesis, bedrock_structured_poc_diagnostics, structured_query_execute_mock, structured_query_execute_bedrock_stub, normalize_evidence_source, build_citations, create_brief, merge_briefs
---

# RAG Research Skill

Use this skill when the user asks about project-specific, internal, uploaded, or knowledge-base-backed information.

## Manufacturing Line Agent ownership

- Manufacturing-line questions are owned by the Manufacturing Line Agent inside the same AgentCore Runtime.
- The Manufacturing Line Agent owns normal manufacturing KB RAG, structured manufacturing RAG, anomaly summaries, error-code lookup, KPI aggregation, equipment history lookup, production trend lookup, manufacturing PoC diagnostics, and manufacturing vocabulary or aliases.
- Do not create a separate runtime, invoke another runtime, add Redshift or Bedrock KB infrastructure, generate SQL, or query Redshift directly for manufacturing-line requests.
- Until the Router handoff tool exists, keep Router behavior intact and use the manufacturing guidance here as domain ownership context rather than a cross-runtime handoff.

## Tool guidance

- Use `kb_rag_flow` for normal document KB RAG when planning, readiness, and retrieval should be handled together.
- Use `kb_retrieve` when you only need retrieval evidence.
- `kb_retrieve` only retrieves evidence. It does not generate the final answer.
- Use `kb_answer_synthesis` after `kb_rag_flow` or `kb_retrieve` when the retrieved evidence should become a user-facing answer payload, report section, or slide brief input.
- `kb_answer_synthesis` is deterministic and does not invent citations or facts beyond the retrieved evidence.
- Use `kb_query_readiness` before `kb_rag_flow` or `kb_retrieve` when the query is ambiguous, under-specified, or might need web fallback.
- `kb_query_readiness` creates or accepts a deterministic plan and evaluates readiness. It does not retrieve documents or call AWS.
- `kb_rag_flow` is deterministic and does not call an LLM. It creates or accepts a plan, evaluates readiness, and retrieves only when KB retrieval is configured and ready.
- Do not use `kb_rag_flow` as a replacement for structured RAG.
- Do not treat no-result retrieval as factual absence.
- Use fallback only when readiness or retrieval output recommends it.
- Use `kb_rag_diagnostics` to check whether normal Bedrock KB retrieve configuration is safe enough to run.
- `kb_rag_diagnostics` does not call AWS, retrieve documents, or provide answer evidence.
- Do not treat diagnostics output as user-facing factual answer content.
- Use `structured_query_plan` when the user asks about structured data, metrics, aggregations, rankings, time-series trends, equipment history, anomaly summaries, or error-code lookup.
- `structured_query_plan` only creates a deterministic plan. It does not generate SQL, execute SQL, or call a database.
- Use `structured_plan_readiness` after `structured_query_plan` when you need to check missing information, provider preference, or the next safe action.
- Use `structured_rag_flow` for the common path of planning, validation, readiness evaluation, and safe execution.
- Prefer `structured_rag_flow` over manually calling all low-level structured tools unless detailed control is needed.
- `structured_rag_flow` must not bypass readiness gating.
- `structured_rag_flow` must not generate SQL or query databases directly.
- Use `structured_answer_synthesis` after `structured_rag_flow` when the result should be turned into a user-facing answer, report section, or slide brief.
- Do not invent findings beyond execution rows, brief key facts, sources, and citations.
- Clearly mark mock, dry-run, stub, no-data, and not-implemented states.
- Do not present mock or stub data as production data.
- Use `bedrock_structured_poc_diagnostics` when checking whether the Bedrock structured KB + Redshift Serverless PoC is configured safely.
- The diagnostics tool must not call AWS or query databases.
- Do not treat diagnostics output as retrieval results.
- Prefer Bedrock structured execution when the plan is ready and the Bedrock structured provider is enabled.
- Use `structured_query_execute_mock` only to validate the structured RAG pipeline or demonstrate expected result shape.
- `structured_query_execute_mock` does not query real data, generate SQL, or call any database.
- Prefer `structured_query_plan` before asking follow-up questions when the request is partially specified. Use `missingSlots` to decide whether a follow-up is needed.
- For anomaly analysis, use the generic `anomaly_summary` intent and represent the target signal through metrics, filters, target entity, or `metadata.targetSignals`. Deterministic planning may populate `metadata.targetSignals` for common signals such as temperature, pressure, or vibration. Do not create one intent per signal.
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
