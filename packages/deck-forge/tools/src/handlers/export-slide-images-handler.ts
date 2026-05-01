import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { HtmlSlideImageRenderer, assertPathAllowed, resolveSafetyOptions } from "@deck-forge/core";

import type { ExportSlideImagesInput, ExportSlideImagesOutput } from "#src/types.js";

let slideImageRenderer: ExportSlideImagesInput["renderer"] | undefined;

export function setSlideImageRenderer(
  renderer: ExportSlideImagesInput["renderer"] | undefined,
): void {
  slideImageRenderer = renderer;
}

export function getSlideImageRenderer(): ExportSlideImagesInput["renderer"] | undefined {
  return slideImageRenderer;
}

export async function exportSlideImagesHandler(
  input: ExportSlideImagesInput,
): Promise<ExportSlideImagesOutput> {
  const renderer = input.renderer ?? slideImageRenderer ?? new HtmlSlideImageRenderer();
  const images = await renderer.render({
    presentation: input.presentation,
    slideIds: input.slideIds,
    format: input.format ?? "png",
    scale: input.scale,
  });

  if (!input.outputDir) {
    return {
      images: images.map((image) => ({
        slideId: image.slideId,
        mimeType: image.mimeType,
        dataBase64: Buffer.from(image.data).toString("base64"),
        width: image.width,
        height: image.height,
        source: image.source,
        renderer: image.renderer,
      })),
    };
  }

  const safety = resolveSafetyOptions({
    workspaceRoot: input.workspaceRoot,
    allowOutsideWorkspace: input.allowOutsideWorkspace,
  });
  const outputDir = assertPathAllowed(input.outputDir, safety, { action: "export", kind: "dir" });
  await mkdir(outputDir, { recursive: true });

  return {
    images: await Promise.all(
      images.map(async (image) => {
        const ext = image.mimeType === "image/png" ? "png" : "jpg";
        const filePath = path.join(outputDir, `${safeFileName(image.slideId)}.${ext}`);
        assertPathAllowed(filePath, safety, { action: "export", kind: "file" });
        await writeFile(filePath, image.data);
        return {
          slideId: image.slideId,
          mimeType: image.mimeType,
          path: filePath,
          width: image.width,
          height: image.height,
          source: image.source,
          renderer: image.renderer,
        };
      }),
    ),
  };
}

function safeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "slide";
}
