import type { GeneratedAsset, ImageGenerationRequest, ImageGenerator } from "#src/index.js";

/**
 * A no-op ImageGenerator that returns a stub asset without any real generation.
 * Useful for testing and as a default fallback.
 */
export class NoopImageGenerator implements ImageGenerator {
  name = "noop";

  async generate(input: ImageGenerationRequest): Promise<GeneratedAsset> {
    const id = `asset-noop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    return {
      id,
      type: "image",
      uri: `placeholder://${id}.png`,
      mimeType: "image/png",
      metadata: {
        source: "generated",
        generator: this.name,
        prompt: input.prompt,
        createdAt: new Date().toISOString(),
      },
      usage: [],
    };
  }
}
