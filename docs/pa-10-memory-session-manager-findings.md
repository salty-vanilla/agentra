# PA-10: Memory / Session Manager — TypeScript SDK Investigation

Date: 2026-05-04

## Package Versions

| Package | Version |
|---------|---------|
| `@strands-agents/sdk` | 1.0.0 |
| `bedrock-agentcore` | 0.2.3 |

---

## Available TypeScript APIs

### SessionManager (available)

`Agent` config accepts `sessionManager?: SessionManager`.

```ts
import { SessionManager, FileStorage } from '@strands-agents/sdk';
import { S3Storage } from '@strands-agents/sdk/session/s3-storage';
```

`SessionManagerConfig`:

```ts
interface SessionManagerConfig {
  storage: { snapshot: SnapshotStorage };
  sessionId?: string;                  // default: 'default-session'
  saveLatestOn?: SaveLatestStrategy;   // 'message' | 'invocation' | 'trigger'
  multiAgentSaveLatestOn?: MultiAgentSaveLatestStrategy;
  snapshotTrigger?: SnapshotTriggerCallback;
}
```

### Storage Backends (available)

| Backend | Import | Constructor |
|---------|--------|-------------|
| `FileStorage` | `@strands-agents/sdk` | `new FileStorage(baseDir: string)` |
| `S3Storage` | `@strands-agents/sdk/session/s3-storage` | `new S3Storage({ bucket, prefix?, region?, s3Client? })` |

`S3StorageConfig`:

```ts
type S3StorageConfig = {
  bucket: string;
  prefix?: string;
  region?: string;
  s3Client?: S3Client;
};
```

### SnapshotStorage interface (available for custom implementations)

```ts
interface SnapshotStorage {
  saveSnapshot(params): Promise<void>;
  loadSnapshot(params): Promise<Snapshot | null>;
  listSnapshotIds(params): Promise<string[]>;
  deleteSession(params): Promise<void>;
  loadManifest(params): Promise<SnapshotManifest>;
  saveManifest(params): Promise<void>;
}
```

### Snapshot data model

```ts
interface Snapshot {
  scope: 'agent' | 'multiAgent';
  schemaVersion: string;   // "1.0"
  createdAt: string;       // ISO 8601
  data: Record<string, JSONValue>;     // framework state (messages, etc.)
  appData: Record<string, JSONValue>;  // user application state
}
```

---

## Unavailable TypeScript APIs

| API | Status |
|-----|--------|
| `AgentCoreMemorySessionManager` | Not available (Python-only) |
| `AgentCoreMemoryConfig` | Not available |
| `RetrievalConfig` | Not available |
| `MemoryClient` | Not available |
| `DynamoDbStorage` | Not available |
| `@strands-agents/memory` | Does not exist |
| `@strands-agents/agentcore-memory` | Does not exist |
| vended-plugins/memory | Does not exist |
| bedrock-agentcore memory APIs | Does not exist |

---

## Differences from Python

| Feature | Python | TypeScript |
|---------|--------|------------|
| AgentCore Memory Session Manager | Built-in | Not available |
| Long-term memory (semantic retrieval) | Built-in via AgentCore Memory | Not available |
| Short-term session (conversation history) | SessionManager + storage | SessionManager + FileStorage / S3Storage |
| User preference extraction | AgentCore Memory strategies | Must be custom |

---

## Chosen Approach: Path B

**Use Strands `SessionManager` + `S3Storage` for short-term session continuity.**

Rationale:

1. `AgentCoreMemorySessionManager` does not exist in TypeScript SDK 1.0.0
2. `SessionManager` + `S3Storage` is available and mature
3. This gives conversation persistence, cross-container continuity, and same-thread follow-up memory
4. Long-term user preference extraction can be added later as custom logic or when AgentCore Memory TS support arrives

### Session mapping

```text
request.threadId → sessionId (SessionManager)
request.userId   → S3 prefix namespace (e.g. sessions/{userId}/{threadId}/)
```

### Fallback behavior

```text
1. If AGENT_MEMORY_ENABLED=true and S3 configured → S3Storage SessionManager
2. If AGENT_MEMORY_ENABLED=true but S3 not configured → FileStorage (local dev)
3. If AGENT_MEMORY_ENABLED=false or not set → No SessionManager (noop)
4. If SessionManager creation fails → Log warning, continue without memory
```

### Future upgrade path

When `@strands-agents/sdk` adds AgentCore Memory support for TypeScript:

1. Add Path A implementation in session-manager-factory
2. Priority: AgentCore Memory → S3 Session → FileStorage → Noop
3. No runtime code changes needed outside the factory
