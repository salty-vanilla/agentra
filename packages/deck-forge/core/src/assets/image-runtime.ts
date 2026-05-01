import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  BedrockRuntimeClient,
  type BedrockRuntimeClientConfig,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

import type {
  Asset,
  ExternalImageAssetSpec,
  GeneratedImageAssetSpec,
  ImageGenerationRequest,
  ImageGenerator,
  ImageRetriever,
  ImageSearchCandidate,
  PresentationIR,
  RetrievedImageAssetSpec,
  VisualDirectionSpec,
} from "#src/index.js";
import { type RuntimeSafetyOptions, assertPathAllowed } from "#src/runtime/path-policy.js";

const ONE_PIXEL_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAgMBApWw4k4AAAAASUVORK5CYII=";

const DEFAULT_OPENAI_MODEL = "gpt-image-1";
const DEFAULT_BEDROCK_MODEL = "amazon.titan-image-generator-v2:0";

export class LocalFileImageGenerator implements ImageGenerator {
  public readonly name = "local-file";

  public async generate(input: ImageGenerationRequest): Promise<Asset> {
    const id = `asset-local-${Date.now().toString(36)}`;
    const dir = input.outputDir ? path.resolve(input.outputDir) : process.cwd();
    const filePath = path.join(dir, `${id}.png`);

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(ONE_PIXEL_PNG_BASE64, "base64"));

    return {
      id,
      type: "image",
      uri: filePath,
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

export type OpenAiImageGeneratorOptions = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  retries?: number;
};

export class OpenAiImageGenerator implements ImageGenerator {
  public readonly name = "openai";

  public constructor(private readonly options?: OpenAiImageGeneratorOptions) {}

  public async generate(input: ImageGenerationRequest): Promise<Asset> {
    const apiKey = this.options?.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("IMAGE_AUTH_ERROR: OPENAI_API_KEY is required for OpenAI image generation.");
    }

    const model = input.model ?? this.options?.model ?? DEFAULT_OPENAI_MODEL;
    const url = `${(this.options?.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "")}/images/generations`;
    const timeoutMs = input.timeoutMs ?? this.options?.timeoutMs ?? 30_000;
    const retries = input.retries ?? this.options?.retries ?? 1;

    const body = {
      model,
      prompt: input.prompt,
      size: toOpenAiSize(input.aspectRatio),
      ...(input.negativePrompt ? { user: `negative_prompt:${input.negativePrompt}` } : {}),
    };

    const payload = await requestJsonWithRetry<OpenAiImageResponse>(
      () =>
        fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        }),
      retries,
      "openai",
    );

    const dataUrl = payload.data[0]?.b64_json
      ? `data:image/png;base64,${payload.data[0].b64_json}`
      : payload.data[0]?.url;

    if (!dataUrl) {
      throw new Error("IMAGE_GENERATION_ERROR: OpenAI response missing image payload.");
    }

    return {
      id: `asset-openai-${Date.now().toString(36)}`,
      type: "image",
      uri: dataUrl,
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

export type BedrockImageGeneratorOptions = {
  region?: string;
  modelId?: string;
  timeoutMs?: number;
  retries?: number;
  clientConfig?: BedrockRuntimeClientConfig;
  client?: { send: (command: InvokeModelCommand) => Promise<{ body?: Uint8Array }> };
};

export class BedrockImageGenerator implements ImageGenerator {
  public readonly name = "bedrock";

  private readonly client: {
    send: (command: InvokeModelCommand) => Promise<{ body?: Uint8Array }>;
  };

  public constructor(private readonly options?: BedrockImageGeneratorOptions) {
    if (options?.client) {
      this.client = options.client;
      return;
    }

    const region = options?.region ?? process.env.AWS_REGION;
    if (!region) {
      throw new Error("IMAGE_AUTH_ERROR: AWS_REGION is required for Bedrock image generation.");
    }

    this.client = new BedrockRuntimeClient({
      region,
      ...options?.clientConfig,
    });
  }

  public async generate(input: ImageGenerationRequest): Promise<Asset> {
    const modelId = input.model ?? this.options?.modelId ?? DEFAULT_BEDROCK_MODEL;

    const response = await this.client.send(
      new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify({
          taskType: "TEXT_IMAGE",
          textToImageParams: {
            text: input.prompt,
            ...(input.negativePrompt ? { negativeText: input.negativePrompt } : {}),
          },
          imageGenerationConfig: {
            width: aspectRatioToResolution(input.aspectRatio).width,
            height: aspectRatioToResolution(input.aspectRatio).height,
            numberOfImages: 1,
          },
        }),
      }),
    );

    const body = response.body ? new TextDecoder().decode(response.body) : "{}";
    const payload = JSON.parse(body) as BedrockImageResponse;
    const base64 = payload.images?.[0];

    if (!base64) {
      throw new Error("IMAGE_GENERATION_ERROR: Bedrock response missing image payload.");
    }

    return {
      id: `asset-bedrock-${Date.now().toString(36)}`,
      type: "image",
      uri: `data:image/png;base64,${base64}`,
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

export type GenerateImageFromAssetSpecOptions = {
  outputDir?: string;
  generators?: ImageGenerator[];
  preferredGenerator?: string;
  fallbackPolicy?: "error" | "local-file";
  safety?: RuntimeSafetyOptions;
  provider?: "openai" | "bedrock" | "local-file";
  model?: string;
  timeoutMs?: number;
  retries?: number;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  bedrockRegion?: string;
  bedrockModelId?: string;
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
};

export async function generateImageFromAssetSpec(
  assetSpec: GeneratedImageAssetSpec,
  options?: GenerateImageFromAssetSpecOptions,
): Promise<Asset> {
  const fallbackPolicy = options?.fallbackPolicy ?? "local-file";
  const generated = await generateWithPolicy(assetSpec, options, fallbackPolicy);

  return {
    ...generated,
    id: assetSpec.id,
    specId: assetSpec.id,
    type: "image",
    metadata: {
      ...generated.metadata,
      source: "generated",
      prompt: assetSpec.prompt,
      width: assetSpec.resolution?.width ?? generated.metadata.width,
      height: assetSpec.resolution?.height ?? generated.metadata.height,
      generator: generated.metadata.generator,
    },
  };
}

export type MaterializeGeneratedAssetsOptions = {
  outputDir?: string;
  generators?: ImageGenerator[];
  preferredGenerator?: string;
  fallbackPolicy?: "error" | "local-file";
  safety?: RuntimeSafetyOptions;
  provider?: "openai" | "bedrock" | "local-file";
  model?: string;
  timeoutMs?: number;
  retries?: number;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  bedrockRegion?: string;
  bedrockModelId?: string;
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
};

export async function materializeGeneratedAssets(
  presentation: PresentationIR,
  options?: MaterializeGeneratedAssetsOptions,
): Promise<PresentationIR> {
  const nextAssets: Asset[] = [];
  let changed = false;

  for (const asset of presentation.assets.assets) {
    const isGeneratedSource = asset.metadata.source === "generated";
    const isVirtualUri =
      asset.uri.startsWith("generated://") || asset.uri.startsWith("placeholder://");

    if (!isGeneratedSource || !isVirtualUri) {
      nextAssets.push(asset);
      continue;
    }

    const generatedAsset = await generateImageFromAssetSpec(toGeneratedImageSpec(asset), {
      outputDir: options?.outputDir,
      generators: options?.generators,
      preferredGenerator: options?.preferredGenerator,
      fallbackPolicy: options?.fallbackPolicy,
      safety: options?.safety,
      provider: options?.provider,
      model: options?.model,
      timeoutMs: options?.timeoutMs,
      retries: options?.retries,
      openaiApiKey: options?.openaiApiKey,
      openaiBaseUrl: options?.openaiBaseUrl,
      bedrockRegion: options?.bedrockRegion,
      bedrockModelId: options?.bedrockModelId,
      unsplashApiKey: options?.unsplashApiKey,
      pexelsApiKey: options?.pexelsApiKey,
      pixabayApiKey: options?.pixabayApiKey,
    });

    nextAssets.push({
      ...generatedAsset,
      id: asset.id,
      specId: asset.specId ?? asset.id,
      usage: asset.usage,
      metadata: {
        ...generatedAsset.metadata,
        createdAt: asset.metadata.createdAt ?? generatedAsset.metadata.createdAt,
      },
    });
    changed = true;
  }

  if (!changed) {
    return presentation;
  }

  return {
    ...presentation,
    assets: {
      assets: nextAssets,
    },
  };
}

async function generateWithPolicy(
  assetSpec: GeneratedImageAssetSpec,
  options: GenerateImageFromAssetSpecOptions | undefined,
  fallbackPolicy: "error" | "local-file",
): Promise<Asset> {
  let baseGenerators: ImageGenerator[];
  try {
    baseGenerators = options?.generators ?? buildConfiguredGenerators(options);
  } catch (error) {
    if (fallbackPolicy === "local-file") {
      baseGenerators = [];
    } else {
      throw classifyImageError(error, options?.provider ?? "generator");
    }
  }
  const safeOutputDir =
    options?.outputDir && options.safety
      ? assertPathAllowed(options.outputDir, options.safety, {
          action: "generate-image",
          kind: "dir",
        })
      : options?.outputDir;

  const request: ImageGenerationRequest = {
    prompt: assetSpec.prompt,
    negativePrompt: assetSpec.negativePrompt,
    aspectRatio: assetSpec.aspectRatio,
    visualDirection: assetSpec.visualDirection,
    outputDir: safeOutputDir,
    provider: options?.provider,
    model: options?.model,
    timeoutMs: options?.timeoutMs,
    retries: options?.retries,
  };

  const selected = pickGenerator(baseGenerators, options?.preferredGenerator, options?.provider);
  if (selected) {
    try {
      return await selected.generate(request);
    } catch (error) {
      if (fallbackPolicy !== "local-file") {
        throw classifyImageError(error, selected.name);
      }
    }
  }

  if (fallbackPolicy === "local-file") {
    return new LocalFileImageGenerator().generate(request);
  }

  throw new Error("IMAGE_GENERATION_ERROR: No image generator available.");
}

function buildConfiguredGenerators(
  options: GenerateImageFromAssetSpecOptions | undefined,
): ImageGenerator[] {
  const generators: ImageGenerator[] = [];

  const wantsOpenAi =
    options?.provider === "openai" || Boolean(options?.openaiApiKey || process.env.OPENAI_API_KEY);
  const wantsBedrock =
    options?.provider === "bedrock" || Boolean(options?.bedrockRegion || process.env.AWS_REGION);

  if (wantsOpenAi) {
    generators.push(
      new OpenAiImageGenerator({
        apiKey: options?.openaiApiKey,
        baseUrl: options?.openaiBaseUrl,
        model: options?.model,
        timeoutMs: options?.timeoutMs,
        retries: options?.retries,
      }),
    );
  }

  if (wantsBedrock) {
    generators.push(
      new BedrockImageGenerator({
        region: options?.bedrockRegion,
        modelId: options?.bedrockModelId ?? options?.model,
        timeoutMs: options?.timeoutMs,
        retries: options?.retries,
      }),
    );
  }

  if (options?.provider === "local-file") {
    generators.push(new LocalFileImageGenerator());
  }

  return generators;
}

function pickGenerator(
  generators: ImageGenerator[],
  preferredGenerator: string | undefined,
  provider: string | undefined,
): ImageGenerator | undefined {
  if (preferredGenerator) {
    const preferred = generators.find((generator) => generator.name === preferredGenerator);
    if (preferred) {
      return preferred;
    }
  }

  if (provider) {
    const matched = generators.find((generator) => generator.name === provider);
    if (matched) {
      return matched;
    }
  }

  return generators[0];
}

function toGeneratedImageSpec(asset: Asset): GeneratedImageAssetSpec {
  const targetSlideIds = [...new Set(asset.usage.map((usage) => usage.slideId))];
  return {
    id: asset.specId ?? asset.id,
    type: "generated_image",
    purpose: "supporting_visual",
    visualDirection: defaultVisualDirection(),
    prompt: asset.metadata.prompt ?? `Generated visual for ${asset.id}`,
    aspectRatio: "16:9",
    resolution:
      asset.metadata.width && asset.metadata.height
        ? {
            width: asset.metadata.width,
            height: asset.metadata.height,
          }
        : undefined,
    targetSlideIds: targetSlideIds.length > 0 ? targetSlideIds : undefined,
  };
}

function defaultVisualDirection(): VisualDirectionSpec {
  return {
    style: "minimal",
    mood: "calm",
    colorMood: "neutral",
    composition: "centered",
  };
}

function toOpenAiSize(aspectRatio: ImageGenerationRequest["aspectRatio"]): string {
  if (aspectRatio === "1:1") {
    return "1024x1024";
  }
  if (aspectRatio === "4:3" || aspectRatio === "3:2") {
    return "1536x1024";
  }
  return "1792x1024";
}

function aspectRatioToResolution(aspectRatio: ImageGenerationRequest["aspectRatio"]): {
  width: number;
  height: number;
} {
  if (aspectRatio === "1:1") {
    return { width: 1024, height: 1024 };
  }
  if (aspectRatio === "4:3") {
    return { width: 1024, height: 768 };
  }
  if (aspectRatio === "3:2") {
    return { width: 1536, height: 1024 };
  }
  return { width: 1536, height: 864 };
}

async function requestJsonWithRetry<T>(
  call: () => Promise<Response>,
  retries: number,
  provider: "openai" | "bedrock",
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await call();
      if (!response.ok) {
        const bodyText = await response.text();
        throw classifyHttpError(provider, response.status, bodyText);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt === retries) {
        throw classifyImageError(error, provider);
      }
      await sleep(250 * (attempt + 1));
    }
  }

  throw classifyImageError(lastError, provider);
}

function classifyHttpError(provider: string, status: number, message: string): Error {
  if (status === 401 || status === 403) {
    return new Error(`IMAGE_AUTH_ERROR: ${provider} authentication failed (${status}). ${message}`);
  }
  if (status === 429) {
    return new Error(`IMAGE_RATE_LIMIT_ERROR: ${provider} rate limit hit. ${message}`);
  }
  return new Error(`IMAGE_GENERATION_ERROR: ${provider} request failed (${status}). ${message}`);
}

function classifyImageError(error: unknown, provider: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("IMAGE_")) {
    return new Error(message);
  }
  if (message.toLowerCase().includes("timeout")) {
    return new Error(`IMAGE_TIMEOUT_ERROR: ${provider} generation timed out.`);
  }
  return new Error(`IMAGE_GENERATION_ERROR: ${provider} generation failed. ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

type OpenAiImageResponse = {
  data: Array<{
    b64_json?: string;
    url?: string;
  }>;
};

type BedrockImageResponse = {
  images?: string[];
};

export type SearchImageCandidatesOptions = {
  provider?: "unsplash" | "pexels" | "pixabay";
  limit?: number;
  retrievers?: ImageRetriever[];
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
};

export type RetrieveImageAssetOptions = {
  outputDir?: string;
  retrievers?: ImageRetriever[];
  safety?: RuntimeSafetyOptions;
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
};

export async function searchImageCandidates(
  query: string,
  options?: SearchImageCandidatesOptions,
): Promise<ImageSearchCandidate[]> {
  const retrievers = options?.retrievers ?? buildConfiguredRetrievers(options);
  if (options?.provider && retrievers.length === 0) {
    throw new Error(missingApiKeyMessage(options.provider));
  }
  const retriever = pickRetriever(retrievers, options?.provider);
  if (!retriever) {
    if (options?.provider) {
      throw new Error(missingApiKeyMessage(options.provider));
    }
    throw new Error(
      "IMAGE_RETRIEVE_ERROR: No image retriever available. Configure UNSPLASH_ACCESS_KEY, PEXELS_API_KEY, or PIXABAY_API_KEY.",
    );
  }
  return retriever.search({ query, limit: options?.limit ?? 10 });
}

export async function retrieveImageFromAssetSpec(
  spec: RetrievedImageAssetSpec | ExternalImageAssetSpec,
  options?: RetrieveImageAssetOptions,
): Promise<Asset> {
  const safeOutputDir =
    options?.outputDir && options.safety
      ? assertPathAllowed(options.outputDir, options.safety, {
          action: "generate-image",
          kind: "dir",
        })
      : options?.outputDir;

  if (spec.type === "external_image") {
    return {
      id: spec.id,
      specId: spec.id,
      type: "image",
      uri: spec.uri,
      mimeType: inferMimeType(spec.uri),
      metadata: {
        source: "external",
        provider: spec.provider,
        author: spec.author,
        license: spec.license,
        sourcePageUrl: spec.sourcePageUrl,
        attributionRequired: spec.attributionRequired,
        attributionText: spec.attributionText,
        createdAt: new Date().toISOString(),
      },
      usage: [],
    };
  }

  const retrievers = options?.retrievers ?? buildConfiguredRetrievers(options);
  const retriever = pickRetriever(retrievers, spec.provider);
  if (!retriever) {
    throw new Error(missingApiKeyMessage(spec.provider));
  }

  const candidate = spec.selected ?? (await retriever.search({ query: spec.query, limit: 1 }))[0];
  if (!candidate) {
    throw new Error(`IMAGE_RETRIEVE_ERROR: No candidate found for query=${spec.query}`);
  }

  const downloaded = await retriever.download({
    candidate,
    outputDir: safeOutputDir,
  });

  return {
    ...downloaded,
    id: spec.id,
    specId: spec.id,
    metadata: {
      ...downloaded.metadata,
      source: "external",
      provider: candidate.provider,
      author: candidate.author,
      license: candidate.license,
      sourcePageUrl: candidate.sourcePageUrl,
      attributionRequired: candidate.attributionRequired,
      attributionText: candidate.attributionText,
    },
  };
}

class UnsplashImageRetriever implements ImageRetriever {
  public readonly name = "unsplash";

  public constructor(private readonly apiKey: string) {}

  public async search(input: { query: string; limit?: number }): Promise<ImageSearchCandidate[]> {
    const params = new URLSearchParams({
      query: input.query,
      per_page: String(input.limit ?? 10),
      orientation: "landscape",
    });
    const response = await fetch(`https://api.unsplash.com/search/photos?${params.toString()}`, {
      headers: { Authorization: `Client-ID ${this.apiKey}` },
    });
    if (!response.ok) {
      throw new Error(`IMAGE_RETRIEVE_ERROR: unsplash search failed (${response.status})`);
    }
    const payload = (await response.json()) as UnsplashSearchResponse;
    return payload.results.map((item) => ({
      id: item.id,
      provider: this.name,
      title: item.description ?? item.alt_description ?? undefined,
      imageUrl: item.urls.raw,
      sourcePageUrl: item.links.html,
      author: item.user?.name,
      license: "Unsplash License",
      attributionRequired: true,
      attributionText: `Photo by ${item.user?.name ?? "Unknown"} on Unsplash`,
      width: item.width,
      height: item.height,
      tags: item.tags?.map((tag) => tag.title).filter(Boolean),
    }));
  }

  public async download(input: {
    candidate: ImageSearchCandidate;
    outputDir?: string;
  }): Promise<Asset> {
    return downloadCandidateAsAsset(input.candidate, input.outputDir);
  }
}

class PexelsImageRetriever implements ImageRetriever {
  public readonly name = "pexels";

  public constructor(private readonly apiKey: string) {}

  public async search(input: { query: string; limit?: number }): Promise<ImageSearchCandidate[]> {
    const params = new URLSearchParams({
      query: input.query,
      per_page: String(input.limit ?? 10),
      orientation: "landscape",
    });
    const response = await fetch(`https://api.pexels.com/v1/search?${params.toString()}`, {
      headers: { Authorization: this.apiKey },
    });
    if (!response.ok) {
      throw new Error(`IMAGE_RETRIEVE_ERROR: pexels search failed (${response.status})`);
    }
    const payload = (await response.json()) as PexelsSearchResponse;
    return payload.photos.map((item) => ({
      id: String(item.id),
      provider: this.name,
      title: item.alt ?? undefined,
      imageUrl: item.src.large2x ?? item.src.large ?? item.src.original,
      sourcePageUrl: item.url,
      author: item.photographer,
      license: "Pexels License",
      attributionRequired: true,
      attributionText: `Photo by ${item.photographer} on Pexels`,
      width: item.width,
      height: item.height,
    }));
  }

  public async download(input: {
    candidate: ImageSearchCandidate;
    outputDir?: string;
  }): Promise<Asset> {
    return downloadCandidateAsAsset(input.candidate, input.outputDir);
  }
}

class PixabayImageRetriever implements ImageRetriever {
  public readonly name = "pixabay";

  public constructor(private readonly apiKey: string) {}

  public async search(input: { query: string; limit?: number }): Promise<ImageSearchCandidate[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      q: input.query,
      per_page: String(input.limit ?? 10),
      orientation: "horizontal",
    });
    const response = await fetch(`https://pixabay.com/api/?${params.toString()}`);
    if (!response.ok) {
      throw new Error(`IMAGE_RETRIEVE_ERROR: pixabay search failed (${response.status})`);
    }
    const payload = (await response.json()) as PixabaySearchResponse;
    return payload.hits.map((item) => ({
      id: String(item.id),
      provider: this.name,
      title: item.tags,
      imageUrl: item.largeImageURL,
      sourcePageUrl: item.pageURL,
      author: item.user,
      license: "Pixabay Content License",
      attributionRequired: false,
      attributionText: `Image by ${item.user} on Pixabay`,
      width: item.imageWidth,
      height: item.imageHeight,
      tags: item.tags.split(",").map((tag) => tag.trim()),
    }));
  }

  public async download(input: {
    candidate: ImageSearchCandidate;
    outputDir?: string;
  }): Promise<Asset> {
    return downloadCandidateAsAsset(input.candidate, input.outputDir);
  }
}

function buildConfiguredRetrievers(options?: {
  unsplashApiKey?: string;
  pexelsApiKey?: string;
  pixabayApiKey?: string;
}): ImageRetriever[] {
  const retrievers: ImageRetriever[] = [];
  const unsplashKey = options?.unsplashApiKey ?? process.env.UNSPLASH_ACCESS_KEY;
  const pexelsKey = options?.pexelsApiKey ?? process.env.PEXELS_API_KEY;
  const pixabayKey = options?.pixabayApiKey ?? process.env.PIXABAY_API_KEY;

  if (unsplashKey) {
    retrievers.push(new UnsplashImageRetriever(unsplashKey));
  }
  if (pexelsKey) {
    retrievers.push(new PexelsImageRetriever(pexelsKey));
  }
  if (pixabayKey) {
    retrievers.push(new PixabayImageRetriever(pixabayKey));
  }

  return retrievers;
}

function pickRetriever(
  retrievers: ImageRetriever[],
  provider: string | undefined,
): ImageRetriever | undefined {
  if (provider) {
    return retrievers.find((retriever) => retriever.name === provider);
  }
  return retrievers[0];
}

function missingApiKeyMessage(provider: string): string {
  if (provider === "unsplash") {
    return "IMAGE_RETRIEVE_ERROR: unsplash retriever requires unsplashApiKey or UNSPLASH_ACCESS_KEY.";
  }
  if (provider === "pexels") {
    return "IMAGE_RETRIEVE_ERROR: pexels retriever requires pexelsApiKey or PEXELS_API_KEY.";
  }
  if (provider === "pixabay") {
    return "IMAGE_RETRIEVE_ERROR: pixabay retriever requires pixabayApiKey or PIXABAY_API_KEY.";
  }
  return `IMAGE_RETRIEVE_ERROR: Retriever not found for provider=${provider}`;
}

async function downloadCandidateAsAsset(
  candidate: ImageSearchCandidate,
  outputDir: string | undefined,
): Promise<Asset> {
  const response = await fetch(candidate.imageUrl);
  if (!response.ok) {
    throw new Error(`IMAGE_RETRIEVE_ERROR: download failed (${response.status})`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? inferMimeType(candidate.imageUrl);
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";

  let uri: string;
  if (outputDir) {
    const id = `asset-retrieved-${Date.now().toString(36)}`;
    const filePath = path.join(path.resolve(outputDir), `${id}.${ext}`);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    uri = filePath;
  } else {
    uri = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  return {
    id: `asset-retrieved-${Date.now().toString(36)}`,
    type: "image",
    uri,
    mimeType,
    metadata: {
      source: "external",
      provider: candidate.provider,
      author: candidate.author,
      license: candidate.license,
      sourcePageUrl: candidate.sourcePageUrl,
      attributionRequired: candidate.attributionRequired,
      attributionText: candidate.attributionText,
      width: candidate.width,
      height: candidate.height,
      createdAt: new Date().toISOString(),
    },
    usage: [],
  };
}

function inferMimeType(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

type UnsplashSearchResponse = {
  results: Array<{
    id: string;
    width: number;
    height: number;
    description?: string | null;
    alt_description?: string | null;
    urls: { raw: string };
    links: { html: string };
    user?: { name?: string };
    tags?: Array<{ title: string }>;
  }>;
};

type PexelsSearchResponse = {
  photos: Array<{
    id: number;
    width: number;
    height: number;
    url: string;
    photographer: string;
    alt?: string;
    src: {
      original: string;
      large2x?: string;
      large?: string;
    };
  }>;
};

type PixabaySearchResponse = {
  hits: Array<{
    id: number;
    pageURL: string;
    tags: string;
    largeImageURL: string;
    user: string;
    imageWidth: number;
    imageHeight: number;
  }>;
};
