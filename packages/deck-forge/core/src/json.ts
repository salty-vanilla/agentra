import { readFile, writeFile } from "node:fs/promises";

import type { ExportResult, PresentationIR } from "#src/index.js";

export function serializePresentation(presentation: PresentationIR): string {
  return JSON.stringify(presentation, null, 2);
}

export function deserializePresentation(json: string): PresentationIR {
  return JSON.parse(json) as PresentationIR;
}

export async function savePresentationToFile(
  presentation: PresentationIR,
  outputPath: string,
): Promise<ExportResult> {
  const data = serializePresentation(presentation);
  await writeFile(outputPath, data, "utf8");

  return {
    format: "json",
    path: outputPath,
    data,
  };
}

export async function loadPresentationFromFile(inputPath: string): Promise<PresentationIR> {
  const data = await readFile(inputPath, "utf8");
  return deserializePresentation(data);
}
