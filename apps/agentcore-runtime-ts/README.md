# AgentCore Runtime (TypeScript)

TypeScript implementation for Amazon Bedrock AgentCore Runtime using Strands.

## Features
- Runtime entrypoint via `bedrock-agentcore/runtime`
- Strands-based conversation loop
- Streaming response support (delta text events)
- Model selection by payload key: `opus | sonnet | haiku`

## Payload
```json
{
  "prompt": "こんにちは",
  "model": "sonnet"
}
```

## Environment variables
- `BEDROCK_REGION` (default: `us-east-1`)
- `BEDROCK_MODEL_ID_OPUS`
- `BEDROCK_MODEL_ID_SONNET`
- `BEDROCK_MODEL_ID_HAIKU`
- `AGENT_SYSTEM_PROMPT`

## Local dev
```bash
pnpm --filter @agentra/agentcore-runtime-ts install
pnpm --filter @agentra/agentcore-runtime-ts dev
```

## Smoke Scripts

### Local Web Research smoke (no deployment required)

Runs `createWebResearchAgent()` directly from a local TypeScript process.
No AgentCore Runtime deployment or `AGENTCORE_RUNTIME_ARN` needed.

```bash
# Via justfile (exports AWS credentials automatically)
just smoke-local-research

# Via pnpm (credentials must already be in env)
eval "$(aws configure export-credentials --profile quick-admin --format env)"
AWS_REGION=ap-northeast-1 pnpm --filter @agentra/agentcore-runtime-ts smoke:local:research

# With options
pnpm --filter @agentra/agentcore-runtime-ts smoke:local:research -- \
  --prompt "最新のAIエージェント開発トレンドを調べてください" \
  --strict
```

**Required env vars** (one of the Tavily options is required):

| Variable | Required | Description |
|---|---|---|
| `AWS_REGION` | No | Bedrock / SSM region (default: `ap-northeast-1`) |
| `BEDROCK_REGION` | No | Override Bedrock region only |
| `BEDROCK_MODEL_ID_WEB_RESEARCH` | No | Model id for the Web Research Agent |
| `BEDROCK_MODEL_ID_SONNET` | No | Fallback model id |
| `TAVILY_API_KEY` | Conditional | Tavily key (direct, highest priority) |
| `TAVILY_API_KEY_SECRET_ID` | Conditional | Tavily key from Secrets Manager |
| `TAVILY_API_KEY_SSM_NAME` | Conditional | Tavily key from SSM Parameter Store |

**CLI flags:**

| Flag | Description |
|---|---|
| `--prompt <text>` | Research prompt |
| `--model <id>` | Override model id |
| `--region <region>` | Override AWS/Bedrock region |
| `--strict` | Fail if no research tools ran or fallback detected |
| `--timeout-ms <ms>` | Agent timeout (default: 300000) |
| `--json` | Print machine-readable summary as last line |

**vs live AgentCore smoke:**

| Aspect | local smoke | live AgentCore smoke |
|---|---|---|
| AgentCore Runtime deploy | Not required | Required |
| `AGENTCORE_RUNTIME_ARN` | Not required | Required |
| Bedrock model | Used directly | Used via Runtime |
| Tavily | Used directly | Used via Runtime |
| Runtime IAM role | Not checked | Checked |
| CloudWatch logs | Not produced | Produced |
| Agent design iteration speed | Fast | Slow |
| Production fidelity | Low | High |

### Live AgentCore smoke

Calls the deployed AgentCore Runtime. See `just smoke-agentcore` and `just smoke-slide`.

---

## Log Discovery

CloudWatch Logs Insights queries for the AgentCore Runtime, exposed as `just` recipes.

Log groups are discovered dynamically via `DescribeLogGroups` using the prefix
`/aws/bedrock-agentcore/runtimes/`, filtered by stage name.

### Required IAM permissions

```
logs:StartQuery
logs:GetQueryResults
logs:DescribeLogGroups
```

Resource: `arn:aws:logs:*:*:log-group:/aws/bedrock-agentcore/runtimes/*`

### Commands

| Command | Description |
|---------|-------------|
| `just agentcore-log-groups [stage]` | List all discovered log groups |
| `just agentcore-logs [stage] [since=30m]` | Recent lifecycle and error logs |
| `just agentcore-logs-trace [stage] <traceId>` | All logs for a specific traceId |
| `just agentcore-logs-session [stage] <threadId>` | All logs for a threadId (session identifier) |
| `just agentcore-logs-keyword [stage] <keyword>` | Free-text keyword search across logs |
| `just agentcore-errors [stage] [since=1h]` | Error logs only |
| `just agentcore-logs-follow [stage]` | Tail general logs in real time |
| `just agentcore-logs-follow-trace [stage] <traceId>` | Tail by traceId in real time |
| `just agentcore-logs-follow-session [stage] <threadId>` | Tail by threadId in real time |
| `just agentcore-logs-follow-keyword [stage] <keyword>` | Tail by keyword in real time |
| `just agentcore-errors-follow [stage]` | Tail error logs in real time |

### Typical workflow

```bash
# 1. Run a smoke test — it prints traceId and threadId at the end
just smoke-agentcore dev

# 2. Inspect all logs for that trace (copy traceId from smoke output)
just agentcore-logs-trace dev 01960000-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# 3. Or filter by threadId (conversation/session identifier)
just agentcore-logs-session dev <threadId>

# 4. Or follow in real time while a new request is in flight
just agentcore-logs-follow-trace dev 01960000-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```
