// ---------------------------------------------------------------------------
// Image Retrieval
// ---------------------------------------------------------------------------

export type ImageRetrievalProviderId = 'pexels' | 'pixabay' | 'company-library';

export type ImageSearchRequest = {
  query: string;
  orientation?: 'landscape' | 'portrait' | 'square' | undefined;
  maxResults?: number | undefined;
};

export type RetrievedImage = {
  id: string;
  provider: ImageRetrievalProviderId;
  title?: string | undefined;
  authorName?: string | undefined;
  sourceUrl?: string | undefined;
  downloadUrl?: string | undefined;
  localPath?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  license?: string | undefined;
  attribution?: string | undefined;
  score?: number | undefined;
};

export interface ImageRetrievalProvider {
  id: ImageRetrievalProviderId;
  search(request: ImageSearchRequest): Promise<RetrievedImage[]>;
  download(image: RetrievedImage, workDir: string): Promise<RetrievedImage>;
}

// ---------------------------------------------------------------------------
// Image Generation
// ---------------------------------------------------------------------------

export type ImageGenerationProviderId = 'bedrock' | 'openai' | 'stability';

export type ImageGenerationRequest = {
  prompt: string;
  workDir?: string | undefined;
  aspectRatio?: '16:9' | '4:3' | '1:1' | undefined;
  style?: string | undefined;
  usage?: 'cover' | 'section' | 'illustration' | 'background' | undefined;
};

export type GeneratedImage = {
  id: string;
  provider: ImageGenerationProviderId;
  prompt: string;
  localPath: string;
  width?: number | undefined;
  height?: number | undefined;
};

export interface ImageGenerationProvider {
  id: ImageGenerationProviderId;
  generate(request: ImageGenerationRequest): Promise<GeneratedImage>;
}

// ---------------------------------------------------------------------------
// Input configuration (goes into tool input schema)
// ---------------------------------------------------------------------------

export type PresentationImagesInput = {
  retrievalEnabled?: boolean | undefined;
  generationEnabled?: boolean | undefined;

  retrieval?:
    | {
        providerId?: ImageRetrievalProviderId | undefined;
        maxResults?: number | undefined;
      }
    | undefined;

  generation?:
    | {
        providerId?: ImageGenerationProviderId | undefined;
        modelId?: string | undefined;
        style?: string | undefined;
      }
    | undefined;
};

// ---------------------------------------------------------------------------
// Result metadata (returned in tool output)
// ---------------------------------------------------------------------------

export type ImageResultMetadata = {
  retrievalEnabled: boolean;
  generationEnabled?: boolean | undefined;
  retrievalProviderId?: string | undefined;
  generationProviderId?: string | undefined;
  generationModelId?: string | undefined;
  retrievedCount?: number | undefined;
  generatedCount?: number | undefined;
  warnings?: string[] | undefined;
};

// ---------------------------------------------------------------------------
// Workspace preparation result
// ---------------------------------------------------------------------------

export type ImageAssetPrepareResult = {
  retrievedImages: RetrievedImage[];
  generatedImages: GeneratedImage[];
  warnings: string[];
};
