import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, BedrockModel } from '@strands-agents/sdk';
import { AgentSkills } from '@strands-agents/sdk/vended-plugins/skills';
import { BedrockAgentCoreApp } from 'bedrock-agentcore/runtime';
import { z } from 'zod';
import { streamPresentation } from './streaming/stream-presentation.js';
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

// Opt-in (default off): stream deck-progress events as SSE while the deck is
// built, instead of returning a single JSON result. Requires the router to
// invoke with `accept: text/event-stream` and relay the events (#421); until
// then the default non-streaming path is unchanged.
const STREAMING_ENABLED = process.env.SLIDE_RUNTIME_STREAMING === 'true';

type SlideRequest = z.infer<typeof RequestSchema>;

// Non-streaming handler — the router calls with accept: application/json, so we
// must NOT return an async generator (which requires SSE / text/event-stream).
const nonStreamingProcess = async (request: SlideRequest) => {
  try {
    return await executeCreatePresentationTool({
      prompt: request.prompt,
      language: request.language,
      traceId: request.traceId,
      diagnostics: request.diagnostics,
      revision: request.revision,
    });
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
};

// Streaming handler (Epic #420) — yields deck-progress events in real time, then
// the final result, as wrapped `{ event: 'message', data }` SSE messages.
async function* streamingProcess(request: SlideRequest) {
  yield* streamPresentation(request, {
    runTool: (req, sink) =>
      executeCreatePresentationTool(
        {
          prompt: req.prompt,
          language: req.language,
          traceId: req.traceId,
          diagnostics: req.diagnostics,
          revision: req.revision,
        },
        { onDeckEvent: sink.onDeckEvent },
      ),
  });
}

const app = STREAMING_ENABLED
  ? new BedrockAgentCoreApp({
      invocationHandler: { requestSchema: RequestSchema, process: streamingProcess },
    })
  : new BedrockAgentCoreApp({
      invocationHandler: { requestSchema: RequestSchema, process: nonStreamingProcess },
    });

const isDirectExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectExecution) {
  app.run();
}
