import { searchImageCandidates } from "@deck-forge/core";

import type { SearchAssetsInput, SearchAssetsOutput } from "#src/types.js";

export async function searchAssetsHandler(input: SearchAssetsInput): Promise<SearchAssetsOutput> {
  const candidates = await searchImageCandidates(input.query, {
    provider: input.provider,
    limit: input.limit,
    unsplashApiKey: input.unsplashApiKey,
    pexelsApiKey: input.pexelsApiKey,
    pixabayApiKey: input.pixabayApiKey,
  });

  return { candidates };
}
