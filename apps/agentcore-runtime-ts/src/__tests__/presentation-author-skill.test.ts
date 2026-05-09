import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SKILLS_ROOT = join(import.meta.dirname, '../../skills');
const HANDOFF_SKILL = join(SKILLS_ROOT, 'presentation-author-handoff');
const WEB_RESEARCH_SKILL = join(SKILLS_ROOT, 'web-research');

// The presentation-author skill lives in its own runtime
const PA_RUNTIME_SKILLS = join(
  import.meta.dirname,
  '../../../presentation-author-runtime/skills',
);
const SLIDE_SKILL = join(PA_RUNTIME_SKILLS, 'presentation-author');

function readSkillFile(skillDir: string, relativePath: string): string {
  return readFileSync(join(skillDir, relativePath), 'utf-8');
}

describe('Skill file existence', () => {
  const slideSkillFiles = [
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

  for (const file of slideSkillFiles) {
    it(`presentation-author/${file} exists`, () => {
      expect(existsSync(join(SLIDE_SKILL, file))).toBe(true);
    });
  }

  it('presentation-author-handoff/SKILL.md exists', () => {
    expect(existsSync(join(HANDOFF_SKILL, 'SKILL.md'))).toBe(true);
  });

  it('web-research/SKILL.md exists', () => {
    expect(existsSync(join(WEB_RESEARCH_SKILL, 'SKILL.md'))).toBe(true);
  });
});

describe('SKILL.md frontmatter', () => {
  it('presentation-author has valid frontmatter', () => {
    const content = readSkillFile(SLIDE_SKILL, 'SKILL.md');
    expect(content).toMatch(/^---\nname: presentation-author\n/);
    expect(content).toContain('description:');
    expect(content).toContain('allowed-tools: create_presentation');
  });

  it('presentation-author-handoff has valid frontmatter', () => {
    const content = readSkillFile(HANDOFF_SKILL, 'SKILL.md');
    expect(content).toMatch(/^---\nname: presentation-author-handoff\n/);
    expect(content).toContain('description:');
    expect(content).toContain('allowed-tools: create_slide_presentation');
  });
});

describe('Slide Agent SKILL.md content', () => {
  it('includes font policy with all presets', () => {
    const content = readSkillFile(SLIDE_SKILL, 'SKILL.md');
    expect(content).toContain('standard');
    expect(content).toContain('readable');
    expect(content).toContain('product-lp');
    expect(content).toContain('research-elegant');
    expect(content).toContain('table-numeric');
    expect(content).toContain('BIZ UDPGothic');
    expect(content).toContain('BIZ UDPMincho');
  });

  it('includes deck quality rules', () => {
    const content = readSkillFile(SLIDE_SKILL, 'SKILL.md');
    expect(content).toContain('16:9 widescreen');
    expect(content).toContain('create_presentation');
  });

  it('includes diagnostics/revision policy', () => {
    const content = readSkillFile(SLIDE_SKILL, 'SKILL.md');
    expect(content).toContain('one revision attempt');
    expect(content).toContain('No multi-pass');
    expect(content).toContain('no scoring engine');
  });

  it('does not include router handoff triggers', () => {
    const content = readSkillFile(SLIDE_SKILL, 'SKILL.md');
    expect(content).not.toContain('create_slide_presentation');
    expect(content).not.toContain('スライドを作って');
  });
});

describe('Router handoff SKILL.md content', () => {
  it('includes create_slide_presentation tool', () => {
    const content = readSkillFile(HANDOFF_SKILL, 'SKILL.md');
    expect(content).toContain('create_slide_presentation');
  });

  it('includes Japanese trigger examples', () => {
    const content = readSkillFile(HANDOFF_SKILL, 'SKILL.md');
    expect(content).toContain('スライドを作って');
    expect(content).toContain('報告資料を作って');
    expect(content).toContain('提案資料を作って');
  });

  it('includes English trigger examples', () => {
    const content = readSkillFile(HANDOFF_SKILL, 'SKILL.md');
    expect(content).toContain('create slides');
    expect(content).toContain('make a PowerPoint');
  });

  it('does not include full slide-agent guidance', () => {
    const content = readSkillFile(HANDOFF_SKILL, 'SKILL.md');
    expect(content).not.toContain('BIZ UDPGothic');
    expect(content).not.toContain('16:9 widescreen');
    expect(content).not.toContain('no multi-pass');
  });
});

describe('Router Agent prompt integration', () => {
  it('agent.ts uses AgentSkills plugin', async () => {
    const { readFile } = await import('node:fs/promises');
    const agentSource = await readFile(
      join(import.meta.dirname, '../agents/router/agent.ts'),
      'utf-8',
    );
    expect(agentSource).toContain('AgentSkills');
    expect(agentSource).toContain('presentation-author-handoff');
    expect(agentSource).toContain('web-research');
    expect(agentSource).toContain('plugins:');
    // Should NOT have inline slide instructions
    expect(agentSource).not.toContain("'# スライド生成'");
    expect(agentSource).not.toContain('getPresentationAuthorRouterInstructions');
  });
});
