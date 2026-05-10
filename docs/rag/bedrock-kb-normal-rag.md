# Bedrock Knowledge Base — Normal Document RAG (Manufacturing Line)

## Architecture

```
S3 document bucket  (agentra-{stage}-manufacturing-docs)
        ↓  (Bedrock sync)
Bedrock Knowledge Base  (agentra-{stage}-manufacturing-doc-kb)
        ↓  (embedding: amazon.titan-embed-text-v2:0 · 1024 dims)
OpenSearch Serverless collection  (agentra-{stage}-mfg-kb)
        ↓  (HNSW / faiss · l2 distance)
AgentCore Runtime  →  kb_retrieve / kb_rag_flow / kb_answer_synthesis
```

## Created resources

| Resource | CDK construct | Name pattern |
|---|---|---|
| S3 document bucket | `aws-s3.Bucket` | `agentra-{stage}-manufacturing-docs` |
| Bedrock KB IAM role | `aws-iam.Role` | auto-named |
| AOSS encryption policy | `aws-opensearchserverless.CfnSecurityPolicy` | `agentra-{stage}-mfg-kb-enc` |
| AOSS network policy | `aws-opensearchserverless.CfnSecurityPolicy` | `agentra-{stage}-mfg-kb-net` |
| AOSS collection | `aws-opensearchserverless.CfnCollection` | `agentra-{stage}-mfg-kb` |
| AOSS data access policy | `aws-opensearchserverless.CfnAccessPolicy` | `agentra-{stage}-mfg-kb-access` |
| AOSS vector index | `aws-opensearchserverless.CfnIndex` | `bedrock-kb-index` |
| Bedrock Knowledge Base | `aws-bedrock.CfnKnowledgeBase` | `agentra-{stage}-manufacturing-doc-kb` |
| Bedrock S3 data source | `aws-bedrock.CfnDataSource` | `agentra-{stage}-manufacturing-docs` |

## Required environment variables

After deployment read the CloudFormation outputs from the `AgentraBedrockKbStack-{stage}` stack:

| Variable | CloudFormation output key | Description |
|---|---|---|
| `BEDROCK_KB_ID` | `BedrockKbId` | Knowledge base ID for `kb_retrieve` / `kb_rag_flow` calls |
| `BEDROCK_KB_REGION` | `BedrockKbRegion` | AWS region where the KB lives |

Set both variables in the AgentCore Runtime environment (currently manual — see KB-INFRA-3).

## Deployment

```bash
# dev stage
pnpm --filter @agentra/infra-cdk synth -c stage=dev \
  -c callbackUrls=http://localhost:3000/ \
  -c logoutUrls=http://localhost:3000/ \
  -c corsOrigins=http://localhost:3000 \
  -c tavilyApiKeySecretArn=<arn>

cdk deploy AgentraBedrockKbStack-dev -c stage=dev ...
```

After deploy, retrieve the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name AgentraBedrockKbStack-dev \
  --query 'Stacks[0].Outputs'
```

## How to sync documents

1. Upload source documents (PDF, txt, docx, …) to S3 under the `docs/` prefix:

```bash
aws s3 cp my-manual.pdf s3://agentra-dev-manufacturing-docs/docs/
```

2. Start a KB ingestion job:

```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <BEDROCK_KB_ID> \
  --data-source-id <data-source-id-from-cfn-output>
```

Or trigger sync from the Bedrock console → Knowledge Bases → select KB → Data sources → Sync.

## How to verify the KB exists

```bash
aws bedrock-agent get-knowledge-base --knowledge-base-id <BEDROCK_KB_ID>
```

Expected status: `ACTIVE`.

Test a retrieval:

```bash
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id <BEDROCK_KB_ID> \
  --retrieval-query '{"text": "manufacturing line startup procedure"}' \
  --region <BEDROCK_KB_REGION>
```

## Index field mapping

The AOSS index `bedrock-kb-index` uses the following fields required by Bedrock KB:

| Field name | Type | Purpose |
|---|---|---|
| `bedrock-knowledge-base-default-vector` | `knn_vector` (1024-dim) | Embedding vector |
| `AMAZON_BEDROCK_TEXT_CHUNK` | `text` | Raw text chunk |
| `AMAZON_BEDROCK_METADATA` | `text` (not indexed) | Chunk metadata |

## Security notes

- The AOSS network policy allows public access (suitable for PoC / dev). Restrict to VPC endpoints in production.
- The KB IAM role uses source-account and source-ARN conditions to prevent confused-deputy attacks.
- The AgentCore Runtime does **not** need S3 read access — Bedrock KB handles document retrieval.
- Runtime IAM permissions for KB retrieval will be added in KB-INFRA-3.

## Stage-specific behavior

| Setting | dev | prod |
|---|---|---|
| AOSS standby replicas | DISABLED | ENABLED |
| S3 bucket removal policy | DESTROY (auto-delete) | RETAIN |
| Data source deletion policy | DELETE | RETAIN |

## Known gaps / follow-up issues

- **KB-INFRA-3**: Add `bedrock:Retrieve` permission to the AgentCore Runtime IAM role so it can call `kb_retrieve`.
- The AOSS network policy uses `AllowFromPublic: true` for simplicity. Tighten to VPC endpoint in a production hardening pass.
