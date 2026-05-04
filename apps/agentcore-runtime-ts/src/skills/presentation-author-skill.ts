import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = join(__dirname, '../../../../skills/presentation-author');

function loadSkillFile(relativePath: string): string {
  return readFileSync(join(SKILL_ROOT, relativePath), 'utf-8');
}

/**
 * Compact handoff instructions for the Router Agent.
 * Only includes delegation triggers and result presentation rules.
 */
export function getPresentationAuthorRouterInstructions(): string {
  return loadSkillFile('references/router-handoff.md');
}

/**
 * Full guidance for the Slide Agent / Presentation Agent.
 * Includes slide-agent guidance, font policy, artifact response, and diagnostics/revision.
 */
export function getPresentationAuthorSlideAgentInstructions(): string {
  const sections = [
    loadSkillFile('references/slide-agent-guidance.md'),
    loadSkillFile('references/font-policy.md'),
    loadSkillFile('references/artifact-response.md'),
    loadSkillFile('references/diagnostics-revision.md'),
  ];
  return sections.join('\n\n---\n\n');
}
