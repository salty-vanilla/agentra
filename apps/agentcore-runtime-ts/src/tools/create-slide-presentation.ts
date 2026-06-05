import { deckPreviewEventSchema } from '@agentra/agent-tools';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { emitDeckRelayEvent, isDeckRelayActive } from './deck-relay.js';
import {
  invokeSlideRuntime,
  invokeSlideRuntimeStreaming,
} from './slide-runtime-client.js';

const createSlidePresentationTool = tool({
  name: 'create_slide_presentation',
  description:
    "Create an editable PowerPoint presentation from the user's request. Use this when the user asks to create slides, a PowerPoint, a presentation deck, a report deck, or a PPTX file. Returns the presentation author agent's response.",
  inputSchema: z.object({
    prompt: z
      .string()
      .describe('What to create in the presentation. Pass the full user request.'),
    language: z
      .enum(['ja', 'en'])
      .optional()
      .describe('Output language. Inferred from prompt if omitted.'),
    brandFrameId: z
      .string()
      .optional()
      .describe('Optional BrandFrame template ID for company branding.'),
  }),
  callback: async (input) => {
    const traceId = process.env.TRACE_ID ?? undefined;
    const startTime = Date.now();

    console.info(
      JSON.stringify({
        component: 'create-slide-presentation-tool',
        step: 'slide_handoff_start',
        traceId,
        language: input.language,
      }),
    );

    try {
      const invokeInput = {
        prompt: input.prompt,
        language: input.language ?? undefined,
        traceId,
        brandFrameId: input.brandFrameId ?? undefined,
      };
      // When the router set up a relay (Epic #421), stream the slide-runtime's
      // real-time deck events out to the client; otherwise invoke non-streaming.
      const result = isDeckRelayActive()
        ? await invokeSlideRuntimeStreaming(invokeInput, (raw) => {
            const parsed = deckPreviewEventSchema.safeParse(raw);
            if (parsed.success) emitDeckRelayEvent(parsed.data);
          })
        : await invokeSlideRuntime(invokeInput);

      const durationMs = Date.now() - startTime;

      console.info(
        JSON.stringify({
          component: 'create-slide-presentation-tool',
          step: result.success ? 'slide_handoff_done' : 'slide_handoff_failed',
          traceId,
          success: result.success,
          durationMs,
        }),
      );

      const payload =
        result.result ??
        ({
          success: result.success,
          summary: result.text,
          ...(result.error ? { error: result.error } : {}),
        } as const);

      return {
        status: result.success ? ('success' as const) : ('error' as const),
        content: [{ text: JSON.stringify(payload) }],
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      console.error(
        JSON.stringify({
          component: 'create-slide-presentation-tool',
          step: 'slide_handoff_error',
          traceId,
          durationMs,
          error: message,
        }),
      );

      return {
        status: 'error' as const,
        content: [
          {
            text: JSON.stringify({
              success: false,
              error: { message },
            }),
          },
        ],
      };
    }
  },
});

export { createSlidePresentationTool };
