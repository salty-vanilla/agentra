# Live AgentCore Smoke Scripts

Developer CLI scripts that call the deployed AgentCore Runtime directly, bypassing the frontend, API Gateway, Lambda Web Adapter, and BFF. Use these to isolate whether a problem is in the **runtime layer** or the **transport layer**.

## Why these scripts exist

When `/chat` SSE times out in production, it is often unclear whether:
- The AgentCore Runtime is failing (agent, KB, tools, model)
- The transport layer is failing (API Gateway, Lambda Web Adapter, HTTP streaming)

These scripts let you call the runtime directly via `InvokeAgentRuntimeCommand`. If the script succeeds but the UI fails, the problem is in the transport path — not the runtime.

```
UI fails
  -> run smoke:agentcore:chat
    -> if smoke succeeds: problem is API/Lambda/SSE transport
    -> if smoke fails:    problem is runtime/KB/tool/IAM/model
```

## Prerequisites

- AWS credentials configured (via `AWS_PROFILE` or environment credentials)
- `AGENTCORE_RUNTIME_ARN` set to the deployed runtime ARN
- Node.js >= 22 and pnpm installed (`pnpm install` must have been run)

## Required environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_REGION` | No | `ap-northeast-1` | AWS region |
| `AGENTCORE_RUNTIME_ARN` | Yes | — | Deployed AgentCore Runtime ARN |
| `AGENTCORE_RUNTIME_QUALIFIER` | No | — | Runtime qualifier (e.g. `prod`) |
| `SMOKE_MODEL` | No | `sonnet` | Model key: `opus`, `sonnet`, or `haiku` |
| `SMOKE_USER_ID` | No | `smoke-user-local` | User ID sent in payload |
| `SMOKE_THREAD_ID` | No | generated | Runtime session ID (reuse to continue a session) |
| `SMOKE_TRACE_ID` | No | generated | Trace ID for CloudWatch correlation |
| `SMOKE_TIMEOUT_MS` | No | `300000` | Invocation timeout in ms |
| `SMOKE_STRICT` | No | `false` | Fail on missing tool observations |

Slide-specific:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SLIDE_AGENTCORE_RUNTIME_ARN` | No | falls back to `AGENTCORE_RUNTIME_ARN` | Slide-specific runtime ARN |
| `SLIDE_AGENTCORE_RUNTIME_QUALIFIER` | No | — | Qualifier for slide runtime |

## Commands

```bash
# Quick setup with AWS profile
eval "$(aws configure export-credentials --profile quick-admin --format env)"
export AWS_REGION=ap-northeast-1
export AGENTCORE_RUNTIME_ARN=arn:aws:bedrock-agentcore:ap-northeast-1:123456789012:agentruntime/...

# Direct chat smoke
pnpm smoke:agentcore:chat

# Manufacturing-line RAG/tools smoke
pnpm smoke:agentcore:mfg

# Slide generation smoke
pnpm smoke:agentcore:slide
```

Or from the workspace root:

```bash
pnpm --filter @agentra/agentcore-runtime-ts smoke:chat
pnpm --filter @agentra/agentcore-runtime-ts smoke:mfg
pnpm --filter @agentra/agentcore-runtime-ts smoke:slide
```

## CLI arguments

All scripts accept these flags after `--`:

```bash
pnpm smoke:agentcore:chat -- --prompt "カスタムプロンプト"
pnpm smoke:agentcore:chat -- --session-id "my-session-id"
pnpm smoke:agentcore:chat -- --model opus
pnpm smoke:agentcore:chat -- --timeout-ms 600000
pnpm smoke:agentcore:mfg -- --strict
```

## Example output

```
[smoke] region=ap-northeast-1 arn=...abc123def456 qualifier=(none) model=sonnet
[smoke] traceId=01960000-0000-7000-0000-000000000001 sessionId=01960000-0000-7000-0000-000000000002
[smoke] target=main-runtime
[smoke] prompt=こんにちは。あなたが利用できる主な機能を簡単に説明してください。

--- response ---
こんにちは！私は以下の機能を提供できます...

[observation] status=success durationMs=1234 tools=kb_retrieve,kb_answer_synthesis

--- summary ---
traceId        : 01960000-0000-7000-0000-000000000001
runtimeSessionId: 01960000-0000-7000-0000-000000000002
elapsedMs      : 8432
textChars      : 512
events         : text=24 observation=1 done=1 error=0
tools observed : kb_retrieve, kb_answer_synthesis
status         : success
```

## Correlating with CloudWatch Logs

The `traceId` printed at startup is sent in the invocation payload and should appear in the runtime's CloudWatch log group. Use it to find the full trace:

```bash
# Find logs by traceId (replace with your log group and traceId)
aws logs filter-log-events \
  --log-group-name /aws/bedrock/agentcore/... \
  --filter-pattern '"traceId":"<your-trace-id>"' \
  --region ap-northeast-1
```

## Interpreting failures

| Exit code | Meaning |
|-----------|---------|
| `0` | Done event received, no errors |
| `1` | Runtime error, timeout, no done event, or strict-mode check failed |

Common failure categories:

| Error | Likely cause |
|-------|-------------|
| `Missing required env var: AGENTCORE_RUNTIME_ARN` | Env not set |
| `AgentCore invocation timed out` | Runtime took longer than `SMOKE_TIMEOUT_MS` |
| `AgentCore invocation failed: ...AccessDenied...` | IAM policy missing `bedrock-agentcore:InvokeAgentRuntime` |
| `AgentCore invocation failed: ...ResourceNotFoundException...` | Wrong ARN or qualifier |
| Error event in stream | Runtime returned an error (check traceId in CloudWatch) |
| No done event, no error | Stream ended unexpectedly (network or Lambda Web Adapter issue) |

## Strict mode

Manufacturing-line and slide scripts support `SMOKE_STRICT=true` or `--strict`. In strict mode:

- `smoke:mfg` — fails if no `kb_*` or `structured_*` tools appear in observations
- `smoke:slide` — fails if no slide artifact signal (pptx/html/URL patterns) found in the response

Use strict mode in manual regression checks. Avoid it in CI by default (KB and tool availability depends on live AWS resources).

## Difference from UI/API smoke tests

| What is tested | UI smoke | API smoke | These scripts |
|----------------|----------|-----------|---------------|
| Frontend rendering | Yes | No | No |
| BFF `/chat` SSE endpoint | Yes | Yes | No |
| API Gateway + Lambda Web Adapter | Yes | Yes | No |
| AgentCore Runtime invocation | Indirectly | Indirectly | **Directly** |
| KB retrieval | Indirectly | Indirectly | **Directly** |
| Tool calls | Indirectly | Indirectly | **Directly** |
| Slide generation | Indirectly | Indirectly | **Directly** |
| Requires deployed frontend | Yes | No | No |
| Requires Cognito auth | Yes | Yes | No |
