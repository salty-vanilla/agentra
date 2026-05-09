import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Router Agent prompt', () => {
  it('routes public web research through the web research handoff tool', async () => {
    const agentSource = await readFile(join(import.meta.dirname, '../agent.ts'), 'utf-8');

    expect(agentSource).toContain('invoke_web_research_agent');
    expect(agentSource).toContain('最新情報、公開Web情報、外部ドキュメント、価格、ニュース、リリースノート、比較調査');
    expect(agentSource).toContain('Router から tavily_search、tavily_extract、tavily_crawl、tavily_map、web_research を直接使わない');
    expect(agentSource).not.toContain('web fallback');
  });
});
