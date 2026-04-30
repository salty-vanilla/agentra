import { retrieveImageFromAssetSpec } from "@deck-forge/core";

import type { AttachRetrievedAssetInput, AttachRetrievedAssetOutput } from "#src/types.js";

export async function attachRetrievedAssetHandler(
  input: AttachRetrievedAssetInput,
): Promise<AttachRetrievedAssetOutput> {
  const safety =
    input.workspaceRoot !== undefined || input.allowOutsideWorkspace !== undefined
      ? {
          workspaceRoot: input.workspaceRoot,
          allowOutsideWorkspace: input.allowOutsideWorkspace,
        }
      : undefined;

  const asset = await retrieveImageFromAssetSpec(input.assetSpec, {
    outputDir: input.outputDir,
    safety,
    unsplashApiKey: input.unsplashApiKey,
    pexelsApiKey: input.pexelsApiKey,
    pixabayApiKey: input.pixabayApiKey,
  });

  const nextAssets = [...input.presentation.assets.assets];
  const existingIndex = nextAssets.findIndex((item) => item.id === asset.id);
  const existingUsage = existingIndex >= 0 ? nextAssets[existingIndex]?.usage : undefined;
  if (existingIndex >= 0) {
    nextAssets[existingIndex] = {
      ...asset,
      usage: existingUsage ?? asset.usage,
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
