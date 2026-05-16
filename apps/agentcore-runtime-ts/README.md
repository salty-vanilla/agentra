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
