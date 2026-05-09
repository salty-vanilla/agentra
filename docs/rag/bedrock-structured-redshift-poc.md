# Bedrock Structured Redshift PoC

## Goal

This PoC keeps the structured RAG flow on the Bedrock Knowledge Bases path and avoids app-owned SQL generation.

The execution path is intentionally narrow:

`StructuredQueryPlan` -> readiness gating -> structured provider -> Bedrock KB live adapter -> Bedrock Retrieve API -> structured rows

## SDK findings

The installed `@aws-sdk/client-bedrock-agent-runtime` package exposes both `RetrieveCommand` and `RetrieveAndGenerateCommand`.

For this phase, `RetrieveCommand` is the smallest usable fit because it already accepts:

- `knowledgeBaseId`
- a natural-language `retrievalQuery.text`
- optional `retrievalConfiguration.vectorSearchConfiguration.filter`

The response can contain structured row content through `retrievalResults[].content.row`, which maps cleanly to the runtime row model.

## Why this path does not generate SQL

The app does not build SQL for this PoC path.

Instead, it formats the structured plan into a deterministic natural-language retrieval request and lets Bedrock handle the knowledge base query behavior. This keeps the adapter mockable and avoids coupling the runtime to Redshift query generation.

## Required environment

The live adapter remains disabled unless all of the following are present:

- `BEDROCK_KB_STRUCTURED_MODE=live`
- `ENABLE_BEDROCK_KB_STRUCTURED_LIVE=true`
- `BEDROCK_KB_STRUCTURED_ID`
- `BEDROCK_KB_STRUCTURED_REGION`
- `REDSHIFT_SERVERLESS_WORKGROUP_NAME`
- `REDSHIFT_DATABASE_NAME`

`BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME` is optional.

## Safety notes

- Live execution is off by default.
- Tests use injected fake clients only.
- The live adapter returns `not_implemented` when required config is missing.
- If the Bedrock response cannot be parsed into structured rows, the adapter falls back to an empty or error raw result instead of exposing the full response.

## Known boundaries

- This PoC does not query Redshift directly from application code.
- This PoC does not implement an Athena QueryGenerator path.
- Future self-managed query generation remains a separate provider path.
