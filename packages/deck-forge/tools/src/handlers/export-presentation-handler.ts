import { createLocalRuntime } from "@deck-forge/core";

import type { ExportPresentationInput, ExportPresentationOutput } from "#src/types.js";

export async function exportPresentationHandler(
  input: ExportPresentationInput,
): Promise<ExportPresentationOutput> {
  if (
    input.format !== "json" &&
    input.format !== "pptx" &&
    input.format !== "html" &&
    input.format !== "pdf"
  ) {
    throw new Error(`Unsupported export format in tools handler: ${input.format}`);
  }

  const runtime = createLocalRuntime({
    safety: {
      workspaceRoot: input.workspaceRoot,
      allowOutsideWorkspace: input.allowOutsideWorkspace,
    },
  });
  const result = await runtime.export(input.presentation, {
    format: input.format,
    outputPath: input.outputPath,
  });

  if (result.data instanceof Uint8Array) {
    return {
      result: {
        ...result,
        data: Buffer.from(result.data).toString("base64"),
      },
    };
  }

  return { result };
}
