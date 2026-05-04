import { describe, expect, it } from 'vitest';

describe('Slide Agent prompt integration', () => {
  it('agent.ts uses skill loader for system prompt', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const agentSource = await readFile(join(import.meta.dirname, '../agent.ts'), 'utf-8');
    expect(agentSource).toContain('getPresentationAuthorSlideAgentInstructions');
    // Should NOT have inline font policy
    expect(agentSource).not.toContain('prefer the standard font policy: BIZ UDPGothic');
  });
});

describe('Slide Agent skill loader', () => {
  it('returns full slide agent guidance with font policy', async () => {
    const { getPresentationAuthorSlideAgentInstructions } = await import(
      '../skills/presentation-author-skill.js'
    );
    const instructions = getPresentationAuthorSlideAgentInstructions();
    expect(instructions).toContain('BIZ UDPGothic');
    expect(instructions).toContain('16:9 widescreen');
    expect(instructions).toContain('Artifact Response');
    expect(instructions).toContain('one revision attempt');
  });
});
