import { Agent, BedrockModel } from '@strands-agents/sdk';
import { createPresentationTool } from './tools/create-presentation.js';

const SLIDE_AGENT_SYSTEM_PROMPT = `You are a presentation generation agent.
Use create_presentation when the user asks to create, generate, edit, or revise a PowerPoint deck or slide presentation.
Prefer Japanese output when the user asks in Japanese.
For Japanese decks, prefer the standard font policy: BIZ UDPGothic for Japanese and Arial for Latin text. Use BIZ UDGothic + Arial for table/numeric-heavy business reports when helpful.
After creating a deck, summarize the generated artifacts and mention the PPTX path and contact sheet path if available.
Do not attempt to manually write PowerPoint XML.
Do not call shell commands for presentation generation.`;

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-sonnet-4-6';
const REGION = process.env.AWS_REGION ?? 'us-east-1';

export function createSlideAgent(): Agent {
  const model = new BedrockModel({
    modelId: MODEL_ID,
    region: REGION,
    maxTokens: 4096,
    temperature: 0.3,
  });

  return new Agent({
    model,
    systemPrompt: SLIDE_AGENT_SYSTEM_PROMPT,
    tools: [createPresentationTool],
  });
}

export { SLIDE_AGENT_SYSTEM_PROMPT };
