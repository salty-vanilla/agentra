export const TOOL_LABELS: Record<string, string> = {
  web_research: 'Webリサーチ',
  search_knowledge_base: 'ナレッジベース検索',
  read_thread_file: 'スレッドファイル読取',
  create_slide_presentation: 'スライド生成',
  router: 'ルーター',
  manufacturing_line: '製造ラインエージェント',
  kb_retrieve: 'ナレッジ取得',
};

export function formatToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] ?? toolName;
}

export function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return '0ms';
  }
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
}

// Detect any credential-like pattern in error text.
// When found, replace the entire message with a safe fixed string rather than
// attempting partial redaction, which risks leaving values exposed.
const SENSITIVE_DETECT_RE =
  /\b(?:bearer|api[_-]?key|token|secret|password|authorization)\b|\bsk-|(?:key|secret|token|password|credential)[_a-z0-9]*=|\bAKIA[A-Z0-9]+|\bASIA[A-Z0-9]+/i;

const TOOL_ERROR_FALLBACK = 'ツール実行に失敗しました';

export function sanitizeToolError(error: string | undefined): string | null {
  if (!error) return null;
  if (SENSITIVE_DETECT_RE.test(error)) {
    return TOOL_ERROR_FALLBACK;
  }
  return error.slice(0, 120).trim() || null;
}

export type AgentInfo = {
  agentName: string;
  agentKind?: string;
};

export function extractAgentInfo(
  metadata: Record<string, unknown> | undefined,
): AgentInfo | null {
  if (!metadata) return null;
  const agentName = typeof metadata.agentName === 'string' ? metadata.agentName : null;
  if (!agentName) return null;
  return {
    agentName,
    ...(typeof metadata.agentKind === 'string' ? { agentKind: metadata.agentKind } : {}),
  };
}
