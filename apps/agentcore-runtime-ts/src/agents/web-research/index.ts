export { createWebResearchAgent } from './agent.js';
export {
  buildWebResearchAgentHandoffPrompt,
  webResearchAgentHandoffInputSchema,
  webResearchAgentHandoffOutputSchema,
} from './handoff.js';
export { WEB_RESEARCH_SYSTEM_PROMPT } from './prompt.js';
export { buildWebResearchTools } from './tools.js';
export type {
  WebResearchAgentConfig,
  WebResearchAgentHandoffInput,
  WebResearchAgentHandoffOutput,
  WebResearchAgentResult,
  WebResearchModelConfig,
} from './types.js';
