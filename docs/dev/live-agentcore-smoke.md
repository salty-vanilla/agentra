# Live AgentCore Smoke Scripts

Developer CLI scripts that call the deployed AgentCore Runtime directly, bypassing the frontend, API Gateway, Lambda Web Adapter, and BFF. Use these to isolate whether a problem is in the **runtime layer** or the **transport layer**.

## Why these scripts exist

When `/chat` SSE times out or returns an error in production, it is often unclear whether:
- The AgentCore Runtime is failing (agent, KB, tools, model)
- The transport layer is failing (API Gateway, Lambda Web Adapter, HTTP streaming)

These scripts let you call the runtime directly via `InvokeAgentRuntimeCommand`. If the script succeeds but the UI fails, the problem is in the transport path — not the runtime.

```
UI fails
  -> run smoke:agentcore:chat
    -> if smoke succeeds: problem is API/Lambda/SSE transport
    -> if smoke fails:    problem is runtime/KB/tool/IAM/model

Web research path specifically degraded (fallback answer, no citations)
  -> run smoke:agentcore:research --strict
    -> if strict fails: invoke_web_research_agent / tavily / citations broken
    -> if strict passes: problem is routing or downstream agent
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
| `SMOKE_STRICT` | No | `false` | Fail on missing tool observations or degraded responses |

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

# Web Research Agent smoke
pnpm smoke:agentcore:research

# Slide generation smoke (main-runtime → create_slide_presentation tool)
pnpm smoke:agentcore:slide
```

Or from the workspace root:

```bash
pnpm --filter @agentra/agentcore-runtime-ts smoke:chat
pnpm --filter @agentra/agentcore-runtime-ts smoke:mfg
pnpm --filter @agentra/agentcore-runtime-ts smoke:research
pnpm --filter @agentra/agentcore-runtime-ts smoke:slide
```

## CLI arguments

All scripts accept these flags after `--`:

```bash
pnpm smoke:agentcore:chat -- --prompt "カスタムプロンプト"
pnpm smoke:agentcore:chat -- --session-id "my-session-id"
pnpm smoke:agentcore:chat -- --model opus
pnpm smoke:agentcore:chat -- --timeout-ms 600000
pnpm smoke:agentcore:research -- --strict
```

## Example output

```
[smoke] region=ap-northeast-1 arn=...abc123def456 qualifier=(none) model=sonnet
[smoke] traceId=01960000-0000-7000-0000-000000000001 sessionId=01960000-0000-7000-0000-000000000002
[smoke] target=main-runtime (web-research path)
[smoke] strict=true
[smoke] prompt=最新のAI技術トレンドについて...

--- response ---
最新のAI技術トレンドとしては...（出典：...）

[observation] status=success durationMs=3210 tools=invoke_web_research_agent,tavily_search,build_citations

--- tool analysis ---
research tools observed    : invoke_web_research_agent, tavily_search, build_citations
strands_structured_output  : no
fallback/error pattern     : (none)

--- summary ---
traceId        : 01960000-0000-7000-0000-000000000001
runtimeSessionId: 01960000-0000-7000-0000-000000000002
elapsedMs      : 12345
textChars      : 1024
events         : text=40 observation=1 done=1 error=0
tools observed : invoke_web_research_agent, tavily_search, build_citations
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

Research Agent specific:

| Pattern | Likely cause |
|---------|-------------|
| `strict mode - no research tools observed` | Router didn't delegate to web research; check routing logic |
| `fallback/error pattern detected: "Web Research Agent did not return..."` | `invoke_web_research_agent` failed internally; check Tavily API key / SSM config |
| `fallback/error pattern detected: "Web検索エージェントにて..."` | Japanese user-facing fallback emitted; runtime degraded but didn't error |
| `strands_structured_output: no` (when expected) | Strands structured output step was skipped; possible JSON parse failure in final step |

## Strict mode

All scripts except `smoke:chat` support `SMOKE_STRICT=true` or `--strict`:

| Script | Strict mode checks |
|--------|-------------------|
| `smoke:mfg` | Fails if no `kb_*` or `structured_*` tools observed |
| `smoke:research` | Fails if no research tools (`invoke_web_research_agent`, `tavily_search`, `build_citations`) observed **OR** if fallback error pattern found in response text |
| `smoke:slide` | Fails if no slide artifact signal (`.pptx`, download URL, etc.) found in response |

Use strict mode in manual regression checks. Avoid in CI by default (depends on live AWS resources and Tavily API key availability).

## Difference from UI/API smoke tests

| What is tested | UI smoke | API smoke | These scripts |
|----------------|----------|-----------|---------------|
| Frontend rendering | Yes | No | No |
| BFF `/chat` SSE endpoint | Yes | Yes | No |
| API Gateway + Lambda Web Adapter | Yes | Yes | No |
| AgentCore Runtime invocation | Indirectly | Indirectly | **Directly** |
| KB retrieval | Indirectly | Indirectly | **Directly** |
| Web Research / Tavily tools | Indirectly | Indirectly | **Directly** |
| Slide generation | Indirectly | Indirectly | **Directly** |
| Requires deployed frontend | Yes | No | No |
| Requires Cognito auth | Yes | Yes | No |
