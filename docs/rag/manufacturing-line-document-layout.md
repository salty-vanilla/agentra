# Manufacturing Line Document Layout (Normal RAG)

This document defines the S3 bucket layout and metadata conventions for manufacturing-line
documents indexed by the normal Bedrock Knowledge Base.

## Bucket

```
agentra-{stage}-manufacturing-docs
```

The Knowledge Base data source is scoped to the `manufacturing-line/` prefix. Objects outside
that prefix are not indexed.

## Prefix layout

```
s3://agentra-{stage}-manufacturing-docs/
└── manufacturing-line/
    ├── runbooks/          # step-by-step machine start/stop and recovery guides
    ├── error-codes/       # error code dictionaries and resolution steps
    ├── procedures/        # standard operating procedures (SOPs)
    ├── maintenance/       # scheduled and corrective maintenance documents
    ├── kpi-definitions/   # KPI names, formulas, thresholds
    └── safety/            # safety regulations, MSDS sheets, emergency procedures
```

### Accepted file types

Bedrock KB supports the following formats for chunking and embedding:

| Extension | Notes |
|---|---|
| `.pdf` | Preferred for scanned manuals; OCR is handled by Bedrock |
| `.txt` | Plain text; ideal for structured lists and code excerpts |
| `.md` | Markdown; headings improve chunk quality |
| `.docx` | Word documents |
| `.html` | Web-exported documentation |
| `.csv` | Tabular data (KPI tables, error-code lists) |

## Metadata convention

Bedrock KB supports per-document metadata via a sidecar file. Place a file with the same name
plus `.metadata.json` alongside each document:

```
manufacturing-line/runbooks/line-a-startup.pdf
manufacturing-line/runbooks/line-a-startup.pdf.metadata.json
```

### Metadata keys

| Key | Required | Values / format | Description |
|---|---|---|---|
| `domain` | yes | `manufacturing_line` | Constant for all documents in this bucket |
| `sourceType` | yes | `runbook` \| `error_code` \| `procedure` \| `maintenance` \| `kpi_definition` \| `safety` | Matches the prefix category |
| `lineId` | no | e.g. `line-a`, `line-b` | Specific production line if applicable |
| `equipmentId` | no | e.g. `conveyor-01` | Specific equipment ID if applicable |
| `docVersion` | no | e.g. `v2.3` | Document revision |
| `updatedAt` | no | ISO 8601 date, e.g. `2025-03-15` | Last content update |
| `language` | yes | `ja` \| `en` | Document language |

Example sidecar file:

```json
{
  "metadataAttributes": {
    "domain": "manufacturing_line",
    "sourceType": "runbook",
    "lineId": "line-a",
    "docVersion": "v1.0",
    "updatedAt": "2025-01-20",
    "language": "ja"
  }
}
```

## Example document paths

```
manufacturing-line/runbooks/line-a-startup.pdf
manufacturing-line/runbooks/line-a-startup.pdf.metadata.json
manufacturing-line/error-codes/plc-error-dictionary.csv
manufacturing-line/error-codes/plc-error-dictionary.csv.metadata.json
manufacturing-line/procedures/monthly-calibration-sop.pdf
manufacturing-line/maintenance/conveyor-01-maintenance-schedule.pdf
manufacturing-line/kpi-definitions/oee-formula.md
manufacturing-line/safety/emergency-stop-procedure.pdf
```

## How this maps to normal KB retrieval

When a query hits `kb_retrieve` or `kb_rag_flow`, Bedrock searches the vector index built from
chunks of all documents under `manufacturing-line/`. The metadata attributes can be used in
retrieval filters to narrow results — for example, to only retrieve runbooks for a specific line:

```json
{
  "filter": {
    "andAll": [
      { "equals": { "key": "sourceType", "value": "runbook" } },
      { "equals": { "key": "lineId",     "value": "line-a"  } }
    ]
  }
}
```

Metadata filtering is optional and controlled at query time by the AgentCore Runtime tools.

## Auto-ingestion

New or updated objects under `manufacturing-line/` automatically trigger a KB ingestion job via
the EventBridge → SQS → Lambda pipeline defined in `AgentraBedrockKbStack`. There is a 60-second
batching window to coalesce burst uploads. No manual sync is needed after uploading documents.

## Bucket security settings

| Setting | Value |
|---|---|
| Block public access | All public access blocked |
| Encryption | S3-managed (SSE-S3) |
| SSL enforcement | Enforced (`aws:SecureTransport` deny) |
| Versioning | Enabled |
| Lifecycle (PoC) | Non-current versions → S3-IA after 30 days, expire after 90 days |

## Stage-specific behaviour

| Setting | dev | prod |
|---|---|---|
| Removal policy | DESTROY (auto-delete on stack destroy) | RETAIN |
| Data source deletion policy | DELETE | RETAIN |
