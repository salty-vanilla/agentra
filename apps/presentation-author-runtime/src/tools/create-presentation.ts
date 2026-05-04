import type { CreatePresentationToolInput } from '@agentra/presentation-author';
import { createPresentation } from '@agentra/presentation-author';
import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { FONT_POLICY_STYLE_GUIDE } from '../font-policy.js';
import { createPresentationAuthorLlmClient } from '../llm-adapter.js';

const envDiagnostics = process.env.PRESENTATION_AUTHOR_ENABLE_DIAGNOSTICS !== 'false';
const envRevision = process.env.PRESENTATION_AUTHOR_ENABLE_REVISION !== 'false';
const envOutputDir = process.env.PRESENTATION_AUTHOR_OUTPUT_DIR;

const llmClient = createPresentationAuthorLlmClient();

const createPresentationTool = tool({
  name: 'create_presentation',
  description:
    'Create an editable PowerPoint presentation from a user request using a PptxGenJS authoring workflow. Returns artifact paths for the PPTX, source JS, rendered slides, and contact sheet when available.',
  inputSchema: z.object({
    prompt: z.string().describe('What to create in the presentation.'),
    language: z
      .enum(['ja', 'en'])
      .optional()
      .describe('Output language. Inferred from prompt if omitted.'),
    styleGuide: z
      .string()
      .optional()
      .describe('Optional style guide text (plain text or markdown).'),
    outputDir: z
      .string()
      .optional()
      .describe('Optional output directory for generated artifacts.'),
    diagnostics: z.boolean().optional().describe('Enable diagnostics. Default: true.'),
    revision: z
      .boolean()
      .optional()
      .describe('Enable one revision attempt. Default: true.'),
    timeoutMs: z
      .number()
      .optional()
      .describe('Script execution timeout in milliseconds.'),
  }),
  callback: async (input) => {
    const styleGuide = input.styleGuide
      ? `${input.styleGuide}\n\n${FONT_POLICY_STYLE_GUIDE}`
      : FONT_POLICY_STYLE_GUIDE;

    const toolInput: CreatePresentationToolInput = {
      prompt: input.prompt,
      language: input.language,
      styleGuide,
      outputDir: input.outputDir ?? envOutputDir,
      diagnostics: input.diagnostics ?? envDiagnostics,
      revision: input.revision ?? envRevision,
      timeoutMs: input.timeoutMs,
    };

    const result = await createPresentation(toolInput, { llm: llmClient });

    return {
      status: result.success ? ('success' as const) : ('error' as const),
      content: [{ text: JSON.stringify(result) }],
    };
  },
});

export { createPresentationTool };
