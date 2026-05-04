import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILL_ROOT = join(import.meta.dirname, '../../../../skills/presentation-author');

function skillPath(relativePath: string): string {
  return join(SKILL_ROOT, relativePath);
}

function readSkillFile(relativePath: string): string {
  return readFileSync(skillPath(relativePath), 'utf-8');
}

describe('Skill file existence', () => {
  const requiredFiles = [
    'SKILL.md',
    'README.md',
    'references/router-handoff.md',
    'references/slide-agent-guidance.md',
    'references/font-policy.md',
    'references/artifact-response.md',
    'references/tool-contract.md',
    'references/diagnostics-revision.md',
    'examples/manufacturing-line-q2-report.md',
  ];

  for (const file of requiredFiles) {
    it(`${file} exists`, () => {
      expect(existsSync(skillPath(file))).toBe(true);
    });
  }
});

describe('Font policy content', () => {
  it('includes all font presets', () => {
    const content = readSkillFile('references/font-policy.md');
    expect(content).toContain('standard');
    expect(content).toContain('readable');
    expect(content).toContain('product-lp');
    expect(content).toContain('research-elegant');
    expect(content).toContain('table-numeric');
    expect(content).toContain('BIZ UDPGothic');
    expect(content).toContain('BIZ UDGothic');
    expect(content).toContain('BIZ UDPMincho');
  });
});

describe('Diagnostics/revision policy', () => {
  it('specifies one revision attempt and no multi-pass', () => {
    const content = readSkillFile('references/diagnostics-revision.md');
    expect(content).toContain('one revision attempt');
    expect(content).toContain('no multi-pass');
    expect(content).toContain('no scoring engine');
  });
});

describe('Router handoff content', () => {
  it('includes create_slide_presentation tool name', () => {
    const content = readSkillFile('references/router-handoff.md');
    expect(content).toContain('create_slide_presentation');
  });

  it('includes Japanese trigger examples', () => {
    const content = readSkillFile('references/router-handoff.md');
    expect(content).toContain('スライドを作って');
    expect(content).toContain('報告資料を作って');
    expect(content).toContain('提案資料を作って');
  });

  it('includes English trigger examples', () => {
    const content = readSkillFile('references/router-handoff.md');
    expect(content).toContain('create slides');
    expect(content).toContain('make a PowerPoint');
  });

  it('does not include full slide-agent guidance', () => {
    const content = readSkillFile('references/router-handoff.md');
    // Router handoff should NOT contain slide quality rules or font policy
    expect(content).not.toContain('BIZ UDPGothic');
    expect(content).not.toContain('16:9 widescreen');
    expect(content).not.toContain('no multi-pass');
  });
});

describe('Skill loader — Router', () => {
  it('returns compact handoff instructions', async () => {
    const { getPresentationAuthorRouterInstructions } = await import(
      '../skills/presentation-author-skill.js'
    );
    const instructions = getPresentationAuthorRouterInstructions();
    expect(instructions).toContain('create_slide_presentation');
    expect(instructions).toContain('スライドを作って');
    expect(instructions).toContain('報告資料を作って');
    // Should NOT include full slide-agent guidance
    expect(instructions).not.toContain('BIZ UDPGothic');
    expect(instructions).not.toContain('16:9 widescreen');
  });
});

describe('Skill loader — Slide Agent', () => {
  it('returns full slide agent guidance', async () => {
    const { getPresentationAuthorSlideAgentInstructions } = await import(
      '../skills/presentation-author-skill.js'
    );
    const instructions = getPresentationAuthorSlideAgentInstructions();
    // Should include all sections
    expect(instructions).toContain('BIZ UDPGothic');
    expect(instructions).toContain('16:9 widescreen');
    expect(instructions).toContain('one revision attempt');
    expect(instructions).toContain('no multi-pass');
    expect(instructions).toContain('Artifact Response');
    // Should NOT include router-handoff specifics
    expect(instructions).not.toContain('create_slide_presentation');
  });
});

describe('Router Agent prompt integration', () => {
  it('agent.ts uses skill loader instead of inline instructions', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const agentSource = await readFile(join(import.meta.dirname, '../agent.ts'), 'utf-8');
    // Should import from skills
    expect(agentSource).toContain('getPresentationAuthorRouterInstructions');
    // Should no longer have inline slide instructions array
    expect(agentSource).not.toContain("'# スライド生成'");
    expect(agentSource).not.toContain("'ユーザーが PowerPoint");
  });
});
