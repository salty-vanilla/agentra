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

## Runtime environment variables

The following variables are automatically wired into the AgentCore Runtime by CDK when `AgentraBedrockKbStack` is deployed alongside `AgentraAgentCoreRuntimeStack`.

| Variable | Source | Default | Description |
|---|---|---|---|
| `BEDROCK_KB_ID` | `AgentraBedrockKbStack` CloudFormation output `BedrockKbId` | `''` | Knowledge base ID passed to `kb_retrieve` / `kb_rag_flow` |
| `BEDROCK_KB_REGION` | Deploy-time AWS region | deploy region | AWS region where the KB lives |
| `ENABLE_KB_RETRIEVE_TOOL` | CDK wiring | `true` when KB ID is set | Enable / disable the `kb_retrieve` tool |
| `ENABLE_KB_RAG_DIAGNOSTICS_TOOL` | CDK wiring | `true` | Enable / disable `kb_rag_diagnostics` |
| `ENABLE_KB_QUERY_READINESS_TOOL` | CDK wiring | `true` | Enable / disable `kb_query_readiness` |
| `ENABLE_KB_RAG_FLOW_TOOL` | CDK wiring | `true` | Enable / disable `kb_rag_flow` |
| `ENABLE_KB_ANSWER_SYNTHESIS_TOOL` | CDK wiring | `true` | Enable / disable `kb_answer_synthesis` |

All `ENABLE_*` variables accept `"true"` or `"false"`. The runtime tool registry reads them at startup via `resolveToolRegistryConfigFromEnv()`.

## Deployment

```bash
# dev stage
pnpm --filter @agentra/infra-cdk synth -c stage=dev \
  -c callbackUrls=http://localhost:3000/ \
  -c logoutUrls=http://localhost:3000/ \
  -c corsOrigins=http://localhost:3000 \
  -c thirdPartyApiKeysSecretArn=arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:agentra/dev/third-party-keys-xxxxx

cdk deploy AgentraBedrockKbStack-dev -c stage=dev ...
```

The `thirdPartyApiKeysSecretArn` must reference a Secrets Manager secret containing JSON with `TAVILY_API_KEY` and `PEXELS_API_KEY`.

After deploy, retrieve the outputs:

```bash
aws cloudformation describe-stacks \
  --stack-name AgentraBedrockKbStack-dev \
  --query 'Stacks[0].Outputs'
```

## How to sync documents

1. Upload source documents (PDF, txt, docx, …) to S3 under the correct `manufacturing-line/<category>/` prefix (see [manufacturing-line-document-layout.md](./manufacturing-line-document-layout.md)):

```bash
aws s3 cp startup-procedure.pdf s3://agentra-dev-manufacturing-docs/manufacturing-line/procedures/
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
- Runtime IAM permissions for KB retrieval (`bedrock-agent-runtime:Retrieve` and `RetrieveAndGenerate`) are granted by the `AgentraAgentCoreRuntimeStack` when `normalKbArn` is provided.

## Stage-specific behavior

| Setting | dev | prod |
|---|---|---|
| AOSS standby replicas | DISABLED | ENABLED |
| S3 bucket removal policy | DESTROY (auto-delete) | RETAIN |
| Data source deletion policy | DELETE | RETAIN |

## Known gaps / follow-up issues

- The AOSS network policy uses `AllowFromPublic: true` for simplicity. Tighten to VPC endpoint in a production hardening pass.
