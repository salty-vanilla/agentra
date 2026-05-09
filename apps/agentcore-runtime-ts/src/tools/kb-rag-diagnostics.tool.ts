import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { runKbRagDiagnostics } from '../rag/index.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_METADATA_KEYS = 100;

const kbRagDiagnosticsInputSchema = z.object({
  includeEnvValues: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type KbRagDiagnosticsToolInput = z.infer<typeof kbRagDiagnosticsInputSchema>;

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (metadata === undefined) {
    return;
  }

  if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
    throw new Error(`metadata must not exceed ${MAX_METADATA_KEYS} keys`);
  }
}

function validateKbRagDiagnosticsInput(input: KbRagDiagnosticsToolInput): void {
  validateMetadata(input.metadata);
}

export function executeKbRagDiagnosticsTool(input: KbRagDiagnosticsToolInput) {
  try {
    const validatedInput = kbRagDiagnosticsInputSchema.parse(input);
    validateKbRagDiagnosticsInput(validatedInput);
    return toolSuccess(runKbRagDiagnostics(validatedInput));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const kbRagDiagnosticsTool = tool({
  name: 'kb_rag_diagnostics',
  description:
    'Run safe diagnostics for Bedrock KB retrieve configuration. This does not call AWS or retrieve documents.',
  inputSchema: kbRagDiagnosticsInputSchema,
  callback: executeKbRagDiagnosticsTool,
});

export { kbRagDiagnosticsTool };
