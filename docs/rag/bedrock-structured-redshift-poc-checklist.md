# Bedrock Structured Redshift PoC Checklist

This checklist covers the Bedrock structured Knowledge Base + Redshift Serverless proof of concept.
It is intentionally focused on safe validation, diagnostics, and local smoke testing.

## Architecture

- `StructuredQueryPlan`
- capability validation
- readiness evaluation
- `StructuredQueryExecutor`
- `BedrockKbStructuredProvider`
- Bedrock Knowledge Bases structured data
- Redshift Serverless

The app must continue to keep future provider paths visible, including Athena or a self-managed QueryGenerator path, but this checklist is for the Bedrock structured path.

## Required AWS resources

- Bedrock Knowledge Base configured for structured data
- Redshift Serverless workgroup
- Redshift database
- IAM permissions for the Bedrock Knowledge Base and Redshift Serverless boundary

## Required environment variables

- `BEDROCK_KB_STRUCTURED_ID`
- `BEDROCK_KB_STRUCTURED_DATA_SOURCE_NAME`
- `BEDROCK_KB_STRUCTURED_MODE`
- `ENABLE_BEDROCK_KB_STRUCTURED_LIVE`
- `REDSHIFT_SERVERLESS_WORKGROUP_NAME`
- `REDSHIFT_DATABASE_NAME`

## Optional environment variables

- `BEDROCK_KB_STRUCTURED_REGION`
- `AWS_REGION`
- `AWS_DEFAULT_REGION`

## Safe local modes

- `stub`
- `dry_run`
- `mock`

These modes are for local verification only.
They must not be treated as production retrieval results.

## Live mode gating

- Live mode must stay opt-in.
- Do not enable live mode until the Knowledge Base and Redshift settings are ready.
- Do not bypass readiness evaluation.
- Do not add database credentials to the application.

## Diagnostics

Run the diagnostics tool when you want a safe checklist-style view of the PoC state.

Tool name:

- `bedrock_structured_poc_diagnostics`

What it checks:

- resolved runtime mode
- resolved region
- Bedrock Knowledge Base ID
- Bedrock structured data source name
- live-mode flag
- Redshift workgroup
- Redshift database
- optional dry-run readiness flow
- optional mock flow smoke test

What the output means:

- `pass` means the check is configured as expected
- `warn` means local-safe modes still work, but live readiness needs more work
- `fail` means a blocking issue was found
- `unknown` means the check could not be fully evaluated

## Smoke tests

- `runDryFlow=true` exercises the readiness path without calling AWS
- `runMockFlow=true` exercises the deterministic mock execution path
- Neither flow should call AWS or query databases

## Intentional non-goals

- app-owned SQL generation
- direct Redshift execution
- Athena QueryGenerator implementation
- live mode by default
- bypassing readiness gating
- AWS calls in tests

## Future path

The Bedrock structured path remains the primary PoC path for now.
The future Athena or self-managed QueryGenerator path should stay represented in the codebase, but it is not implemented here.
