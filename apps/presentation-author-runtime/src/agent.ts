import { Agent, BedrockModel } from '@strands-agents/sdk';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { z } from 'zod';
import { createPresentationTool } from './tools/create-presentation.js';

const SLIDE_AGENT_SYSTEM_PROMPT = `You are a presentation generation agent.
Use create_presentation when the user asks to create, generate, edit, or revise a PowerPoint deck or slide presentation.
Prefer Japanese output when the user asks in Japanese.
For Japanese decks, prefer the standard font policy: BIZ UDPGothic for Japanese and Arial for Latin text. Use BIZ UDGothic + Arial for table/numeric-heavy business reports when helpful.
After creating a deck, summarize the generated artifacts and mention the PPTX path and contact sheet path if available.
Do not attempt to manually write PowerPoint XML.
Do not call shell commands for presentation generation.`;

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'global.anthropic.claude-sonnet-4-6';
const REGION = process.env.BEDROCK_REGION ?? process.env.AWS_REGION ?? 'us-east-1';

export function createSlideAgent(): Agent {
  const model = new BedrockModel({
    modelId: MODEL_ID,
    region: REGION,
    maxTokens: 32768,
    temperature: 0.3,
  });

  return new Agent({
    model,
    systemPrompt: SLIDE_AGENT_SYSTEM_PROMPT,
    tools: [createPresentationTool],
  });
}

export { SLIDE_AGENT_SYSTEM_PROMPT };

// --- BedrockAgentCoreApp runtime wrapper ---

const RequestSchema = z.object({
  prompt: z.string(),
  language: z.enum(['ja', 'en']).optional(),
  diagnostics: z.boolean().optional(),
  revision: z.boolean().optional(),
});

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: RequestSchema,

    // Non-streaming handler — the router calls with accept: application/json,
    // so we must NOT return an async generator (which requires SSE / text/event-stream).
    process: async (request) => {
      console.log(
        '[slide-runtime] process() called with prompt length:',
        request.prompt?.length,
      );
      try {
        const agent = createSlideAgent();

        // Consume the stream fully, collecting text output
        const textParts: string[] = [];
        const stream = agent.stream(request.prompt);
        while (true) {
          const { value, done } = await stream.next();
          if (done) break;

          const event = value;
          if (
            event.type === 'modelStreamUpdateEvent' &&
            event.event.type === 'modelContentBlockDeltaEvent' &&
            event.event.delta.type === 'textDelta'
          ) {
            textParts.push(event.event.delta.text);
          }
        }

        console.log(
          '[slide-runtime] process() completed, text length:',
          textParts.join('').length,
        );
        return { type: 'text', text: textParts.join('') };
      } catch (error: unknown) {
        console.error('[slide-runtime] process() error:', error);
        throw error;
      }
    },
  },
});

app.run();
