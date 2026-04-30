import type { ExportOptions, ExportResult, Exporter, PresentationIR } from "#src/index.js";
import { savePresentationToFile, serializePresentation } from "#src/json.js";

export class JsonExporter implements Exporter {
  public readonly format = "json";

  public async export(presentation: PresentationIR, options: ExportOptions): Promise<ExportResult> {
    if (options.format !== "json") {
      throw new Error(`JsonExporter only supports format=json, received: ${options.format}`);
    }

    if (options.outputPath) {
      return savePresentationToFile(presentation, options.outputPath);
    }

    return {
      format: "json",
      data: serializePresentation(presentation),
    };
  }
}
