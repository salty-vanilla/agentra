import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Router prompt', () => {
  it('keeps the router focused on handoffs instead of direct RAG workflows', async () => {
    const promptSource = await readFile(
      join(import.meta.dirname, '../../../agents/router/prompt.ts'),
      'utf-8',
    );

    expect(promptSource).toContain('invoke_manufacturing_line_agent');
    expect(promptSource).toContain('invoke_web_research_agent');
    expect(promptSource).toContain('create_slide_presentation');
    expect(promptSource).toContain(
      'Router は通常KB RAG、構造化RAG、Tavily系ツールを直接使わず、必要な専門Agentへ委譲してください。',
    );
    expect(promptSource).not.toContain('kb_retrieve で根拠を取得');
    expect(promptSource).not.toContain('structured_rag_flow を使い');
    expect(promptSource).not.toContain(
      '公開Web調査は invoke_web_research_agent を通して行い',
    );
  });
});
