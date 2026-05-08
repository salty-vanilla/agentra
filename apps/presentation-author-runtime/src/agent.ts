import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, BedrockModel } from '@strands-agents/sdk';
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { z } from 'zod';
import {
  createPresentationTool,
  executeCreatePresentationTool,
} from './tools/create-presentation.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '../skills');

const presentationAuthorPlugin = new AgentSkills({
  skills: [join(SKILLS_DIR, 'presentation-author')],
});

const SLIDE_AGENT_SYSTEM_PROMPT = `You are a presentation generation agent.

Use create_presentation when the user asks to create, generate, edit, or revise a PowerPoint deck or slide presentation.
Prefer Japanese output when the user asks in Japanese.
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
    plugins: [presentationAuthorPlugin],
    tools: [createPresentationTool],
  });
}

export { SLIDE_AGENT_SYSTEM_PROMPT };

// --- BedrockAgentCoreApp runtime wrapper ---

const RequestSchema = z.object({
  prompt: z.string(),
  language: z.enum(['ja', 'en']).optional(),
  traceId: z.string().optional(),
  diagnostics: z.boolean().optional(),
  revision: z.boolean().optional(),
});

const app = new BedrockAgentCoreApp({
  invocationHandler: {
    requestSchema: RequestSchema,

    // Non-streaming handler — the router calls with accept: application/json,
    // so we must NOT return an async generator (which requires SSE / text/event-stream).
    process: async (request) => {
      try {
        const result = await executeCreatePresentationTool({
          prompt: request.prompt,
          language: request.language,
          traceId: request.traceId,
          diagnostics: request.diagnostics,
          revision: request.revision,
        });

        return result;
      } catch (error: unknown) {
        console.error('[slide-runtime] process() error:', error);
        return {
          success: false,
          summary:
            'Presentation creation failed during an unknown error. No PPTX artifact was produced.',
          workDir: '',
          artifacts: [],
          warnings: [],
          error: {
            message: error instanceof Error ? error.message : String(error),
            phase: 'unknown' as const,
          },
        };
      }
    },
  },
});

const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  app.run();
}
