import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Slide Agent prompt integration', () => {
  it('agent.ts uses AgentSkills plugin', async () => {
    const { readFile } = await import('node:fs/promises');
    const agentSource = await readFile(join(import.meta.dirname, '../agent.ts'), 'utf-8');
    expect(agentSource).toContain('AgentSkills');
    expect(agentSource).toContain('presentation-author');
    expect(agentSource).toContain('plugins:');
    // Should NOT have inline font policy or skill loader
    expect(agentSource).not.toContain('prefer the standard font policy: BIZ UDPGothic');
    expect(agentSource).not.toContain('getPresentationAuthorSlideAgentInstructions');
  });
});
