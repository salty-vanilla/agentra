import { tool } from '@strands-agents/sdk';
import { z } from 'zod';
import { runBedrockStructuredPocDiagnostics } from '../rag/bedrock-structured-poc-diagnostics.js';
import { errorMessage, toolFailure, toolSuccess } from './tool-response.js';

const MAX_METADATA_KEYS = 100;

const bedrockStructuredPocDiagnosticsInputSchema = z.object({
  includeEnvValues: z.boolean().optional(),
  runDryFlow: z.boolean().optional(),
  runMockFlow: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type BedrockStructuredPocDiagnosticsToolInput = z.infer<
  typeof bedrockStructuredPocDiagnosticsInputSchema
>;

function validateMetadata(metadata: Record<string, unknown> | undefined): void {
  if (metadata === undefined) {
    return;
  }

  if (Object.keys(metadata).length > MAX_METADATA_KEYS) {
    throw new Error(`metadata must not exceed ${MAX_METADATA_KEYS} keys`);
  }
}

function validateBedrockStructuredPocDiagnosticsInput(
  input: BedrockStructuredPocDiagnosticsToolInput,
): void {
  validateMetadata(input.metadata);
}

export async function executeBedrockStructuredPocDiagnosticsTool(
  input: BedrockStructuredPocDiagnosticsToolInput,
) {
  try {
    const validatedInput = bedrockStructuredPocDiagnosticsInputSchema.parse(input);
    validateBedrockStructuredPocDiagnosticsInput(validatedInput);
    return toolSuccess(await runBedrockStructuredPocDiagnostics(validatedInput));
  } catch (error) {
    return toolFailure(errorMessage(error));
  }
}

const bedrockStructuredPocDiagnosticsTool = tool({
  name: 'bedrock_structured_poc_diagnostics',
  description:
    'Run safe diagnostics for the Bedrock structured KB + Redshift Serverless PoC configuration. This does not call AWS or query databases.',
  inputSchema: bedrockStructuredPocDiagnosticsInputSchema,
  callback: executeBedrockStructuredPocDiagnosticsTool,
});

export { bedrockStructuredPocDiagnosticsTool };
