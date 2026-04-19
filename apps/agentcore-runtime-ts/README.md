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
