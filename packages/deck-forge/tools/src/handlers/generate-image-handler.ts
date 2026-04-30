import { generateImageFromAssetSpec } from "@deck-forge/core";

import type { GenerateImageInput, GenerateImageOutput } from "#src/types.js";

export async function generateImageHandler(
  input: GenerateImageInput,
): Promise<GenerateImageOutput> {
  const safety =
    input.workspaceRoot !== undefined || input.allowOutsideWorkspace !== undefined
      ? {
          workspaceRoot: input.workspaceRoot,
          allowOutsideWorkspace: input.allowOutsideWorkspace,
        }
      : undefined;

  const asset = await generateImageFromAssetSpec(input.assetSpec, {
    outputDir: input.outputDir,
    preferredGenerator: input.preferredGenerator,
    provider: input.provider,
    model: input.model,
    timeoutMs: input.timeoutMs,
    retries: input.retries,
    openaiApiKey: input.openaiApiKey,
    openaiBaseUrl: input.openaiBaseUrl,
    bedrockRegion: input.bedrockRegion,
    bedrockModelId: input.bedrockModelId,
    unsplashApiKey: input.unsplashApiKey,
    pexelsApiKey: input.pexelsApiKey,
    pixabayApiKey: input.pixabayApiKey,
    fallbackPolicy: "local-file",
    safety,
  });

  if (!input.presentation) {
    return { asset };
  }

  const nextAssets = [...input.presentation.assets.assets];
  const existingIndex = nextAssets.findIndex((item) => item.id === asset.id);
  if (existingIndex >= 0) {
    const existing = nextAssets[existingIndex];
    nextAssets[existingIndex] = {
      ...asset,
      usage: existing?.usage ?? asset.usage,
      specId: existing?.specId ?? asset.specId,
    };
  } else {
    nextAssets.push(asset);
  }

  return {
    asset,
    presentation: {
      ...input.presentation,
      assets: {
        assets: nextAssets,
      },
    },
  };
}
