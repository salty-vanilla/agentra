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

const SENSITIVE_RE = /\b(?:api[_-]?key|token|secret|password|authorization)\S*/gi;

export function sanitizeToolError(error: string | undefined): string | null {
  if (!error) return null;
  const cleaned = error.replace(SENSITIVE_RE, '[redacted]').slice(0, 120);
  return cleaned.trim() || null;
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
