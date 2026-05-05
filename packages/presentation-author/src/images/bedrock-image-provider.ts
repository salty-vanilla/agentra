import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  GeneratedImage,
  ImageGenerationProvider,
  ImageGenerationRequest,
} from './types.js';

// ---------------------------------------------------------------------------
// Supported Bedrock image generation models
// ---------------------------------------------------------------------------

export type BedrockImageModelId =
  | 'amazon.titan-image-generator-v2:0'
  | 'stability.stable-image-core-v1:1'
  | 'stability.sd3-5-large-v1:0'
  | 'stability.stable-image-ultra-v1:0';

/**
 * Human-friendly catalog. Keys are the Bedrock modelId values.
 * Each entry describes how to build the request body and parse the response.
 */
interface ModelProfile {
  /** Short label for logging / UI */
  label: string;
  /** Build the InvokeModel JSON body */
  buildBody: (
    prompt: string,
    dims: { width: number; height: number },
    style?: string,
  ) => Record<string, unknown>;
  /** Extract the base-64 image string from the JSON response */
  extractImage: (body: Record<string, unknown>) => string | undefined;
}

const MODEL_CATALOG: Record<BedrockImageModelId, ModelProfile> = {
  // --- Amazon Titan Image Generator v2 ---
  'amazon.titan-image-generator-v2:0': {
    label: 'Amazon Titan Image Generator v2',
    buildBody: (prompt, dims, style) => ({
      taskType: 'TEXT_IMAGE',
      textToImageParams: {
        text: style ? `${prompt}, ${style}` : prompt,
      },
      imageGenerationConfig: {
        numberOfImages: 1,
        width: dims.width,
        height: dims.height,
        quality: 'standard',
      },
    }),
    extractImage: (body) => (body.images as string[] | undefined)?.[0],
  },

  // --- Stability AI: Stable Image Core v1 ---
  'stability.stable-image-core-v1:1': {
    label: 'Stable Image Core v1',
    buildBody: (prompt, _dims, style) => ({
      prompt: style ? `${prompt}, ${style}` : prompt,
      output_format: 'png',
    }),
    extractImage: (body) =>
      (body as { images?: { image?: string }[] }).images?.[0]?.image,
  },

  // --- Stability AI: Stable Diffusion 3.5 Large ---
  'stability.sd3-5-large-v1:0': {
    label: 'Stable Diffusion 3.5 Large',
    buildBody: (prompt, _dims, style) => ({
      prompt: style ? `${prompt}, ${style}` : prompt,
      output_format: 'png',
    }),
    extractImage: (body) =>
      (body as { images?: { image?: string }[] }).images?.[0]?.image,
  },

  // --- Stability AI: Stable Image Ultra v1 ---
  'stability.stable-image-ultra-v1:0': {
    label: 'Stable Image Ultra v1',
    buildBody: (prompt, _dims, style) => ({
      prompt: style ? `${prompt}, ${style}` : prompt,
      output_format: 'png',
    }),
    extractImage: (body) =>
      (body as { images?: { image?: string }[] }).images?.[0]?.image,
  },
};

/** All supported model IDs (useful for validation / UI) */
export const SUPPORTED_BEDROCK_IMAGE_MODELS = Object.keys(
  MODEL_CATALOG,
) as BedrockImageModelId[];

const DEFAULT_MODEL_ID: BedrockImageModelId =
  (process.env.PRESENTATION_IMAGE_GENERATION_MODEL_ID as BedrockImageModelId) ??
  'amazon.titan-image-generator-v2:0';

const DEFAULT_REGION = process.env.AWS_REGION ?? 'us-east-1';

export interface BedrockImageProviderOptions {
  modelId?: string;
  region?: string;
}

export function createDefaultBedrockImageProvider(
  options?: BedrockImageProviderOptions,
): BedrockImageGenerationProvider {
  return new BedrockImageGenerationProvider(
    options?.modelId ?? DEFAULT_MODEL_ID,
    options?.region ?? DEFAULT_REGION,
  );
}

export class BedrockImageGenerationProvider implements ImageGenerationProvider {
  readonly id = 'bedrock' as const;
  readonly modelId: string;
  private readonly region: string;

  constructor(modelId: string, region: string) {
    this.modelId = modelId;
    this.region = region;
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
      '@aws-sdk/client-bedrock-runtime'
    );

    const client = new BedrockRuntimeClient({ region: this.region });
    const dimensions = resolveDimensions(request.aspectRatio);

    const profile = MODEL_CATALOG[this.modelId as BedrockImageModelId];
    if (!profile) {
      throw new Error(
        `Unsupported Bedrock image model: ${this.modelId}. Supported: ${SUPPORTED_BEDROCK_IMAGE_MODELS.join(', ')}`,
      );
    }

    const body = profile.buildBody(request.prompt, dimensions, request.style);

    const command = new InvokeModelCommand({
      modelId: this.modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });

    const response = await client.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body)) as Record<
      string,
      unknown
    >;

    const imageBase64 = profile.extractImage(responseBody);
    if (!imageBase64) {
      throw new Error(`Bedrock image generation (${profile.label}) returned no images`);
    }

    const imageId = randomUUID();
    const baseDir = request.workDir ?? process.cwd();
    const dir = join(baseDir, 'assets', 'images', 'generated');
    await mkdir(dir, { recursive: true });

    const filename = `${imageId}.png`;
    const localPath = `assets/images/generated/${filename}`;
    const fullPath = join(dir, filename);

    await writeFile(fullPath, Buffer.from(imageBase64, 'base64'));

    return {
      id: imageId,
      provider: 'bedrock',
      prompt: request.prompt,
      localPath,
      width: dimensions.width,
      height: dimensions.height,
    };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDimensions(aspectRatio?: string): { width: number; height: number } {
  switch (aspectRatio) {
    case '16:9':
      return { width: 1408, height: 768 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '1:1':
      return { width: 1024, height: 1024 };
    default:
      return { width: 1408, height: 768 }; // default to 16:9 for slides
  }
}
