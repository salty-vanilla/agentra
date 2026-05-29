# Agentra CDK

AWS CDK (TypeScript) app for all Agentra infrastructure. Entry point: `bin/agentra-cdk.ts`.

## Standard environments

Stacks are named `Agentra<Name>Stack-<stage>` and classified by `environmentKind`
(`prod | shared-dev | ephemeral | local`), which drives removal policies and
lifecycle durations. See `lib/environment.ts`.

```bash
# Synthesize (CI uses local kind + a dummy secret ARN)
pnpm --filter @agentra/infra-cdk run synth:ci

# Explicit stage / kind
pnpm --filter @agentra/infra-cdk exec cdk synth \
  -c stage=dev -c environmentKind=shared-dev \
  -c callbackUrls=... -c logoutUrls=... -c corsOrigins=...
```

## Preview environments (`environmentType=preview`)

Disposable, isolated preview stacks for PR/sandbox/local validation. When
`-c environmentType=preview` is set, the app takes a separate path: the stage is
validated by the guardrail library (`scripts/preview/preview-stage.ts`), stacks are
named under the unambiguous prefix `AgentraPreview-<stage>-*`, only the stacks
required by the selected profile are synthesized, and every stack is tagged.
Preview stacks run as `ephemeral` (`RemovalPolicy.DESTROY` + `autoDeleteObjects`).

### Context inputs

| Context key | Required | Notes |
|---|---|---|
| `environmentType=preview` | yes | Selects the preview path. |
| `stage` | yes | Must match `pr-<n>`, `sandbox-<user>-<yyyymmddhhmm>`, or `local-<user>-<short-sha>`. Reserved names (`prod`, `dev`, `main`, `staging`, `shared`, …) fail synth. Capped at 32 chars at the CDK layer (feeds resource names). |
| `previewProfile` | no (default `minimal-api`) | `minimal-api` \| `backend-ai` \| `full`. |
| `owner` | no (default `unknown`) | Tag value. |
| `source` | no (default `human`) | `local-claude-code` \| `local-codex` \| `github-actions` \| `human`. |
| `ttlHours` | no (default `8`) | Integer 1–24. Feeds the `ExpiresAt` tag. |
| `thirdPartyApiKeysSecretArn` | for `backend-ai`/`full` | Required by the AgentCore runtime stack. |
| `pullRequest`, `branch`, `commitSha` | no | Added as tags when present. |
| `callbackUrls`, `logoutUrls`, `corsOrigins` | no | Default to localhost for preview. |

### Profiles

| Profile | Stacks | Notes |
|---|---|---|
| `minimal-api` | `-DataAuth`, `-Backend` | BFF/API path only. Avoids the AI/runtime **Docker image assets** (AgentCore/Slide) and the KB/vector resources. **Note:** `-Backend` still includes the backend Docker image asset, and the Streaming API route is still synthesized — but AgentCore-backed `/chat` behavior is only expected in `backend-ai` or above (AI runtime ARNs are absent in `minimal-api`). |
| `backend-ai` | `+ -AgentCore`, `-AgentCoreRuntime`, `-KnowledgeBase`, `-SlideRuntime` | Adds the AI runtime + KB for AI/tool-path smoke. |
| `full` | `+ -Frontend` | Adds Amplify frontend hosting. |

### Required tags

Every preview stack carries: `Project=Agentra`, `EnvironmentType=preview`,
`Stage=<stage>`, `Owner`, `Source`, `ExpiresAt`, `CreatedBy=preview-cli`,
`ManagedBy=cdk`, `PreviewProfile=<profile>`, plus `PullRequest`/`Branch`/`CommitSha`
when supplied. Tags support future destroy/cleanup tooling, but the
`AgentraPreview-<stage>-` stack-name prefix remains the primary safety boundary.

### Examples

```bash
# minimal-api preview for a PR (synthesizes only DataAuth + Backend)
pnpm --filter @agentra/infra-cdk exec cdk synth \
  -c environmentType=preview -c stage=pr-123 -c previewProfile=minimal-api \
  -c owner=nakatsuka -c source=github-actions -c pullRequest=123

# backend-ai preview (requires the third-party secret ARN)
pnpm --filter @agentra/infra-cdk exec cdk synth \
  -c environmentType=preview -c stage=pr-123 -c previewProfile=backend-ai \
  -c thirdPartyApiKeysSecretArn=arn:aws:secretsmanager:...
```

Out of scope for the CDK layer (see epic #313): preview destroy, the preview CLI,
GitHub Actions workflow, and smoke tests.
