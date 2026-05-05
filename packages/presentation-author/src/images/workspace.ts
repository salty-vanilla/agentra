import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  GeneratedImage,
  ImageAssetPrepareResult,
  ImageGenerationProvider,
  ImageRetrievalProvider,
  PresentationImagesInput,
  RetrievedImage,
} from './types.js';

/**
 * Extract short English search keywords from a prompt for stock image search.
 * Pexels API works best with short English queries.
 */
const RETRIEVAL_KEYWORD_MAP: Array<{ pattern: RegExp; query: string }> = [
  { pattern: /工場|製造|生産|ライン/, query: 'factory manufacturing' },
  { pattern: /会議|ミーティング|打ち合わせ/, query: 'business meeting' },
  { pattern: /チーム|組織|人材/, query: 'team collaboration' },
  { pattern: /品質|検査|改善/, query: 'quality inspection' },
  { pattern: /物流|倉庫|配送/, query: 'logistics warehouse' },
  { pattern: /オフィス|デスク|ワーク/, query: 'modern office' },
  { pattern: /データ|分析|グラフ/, query: 'data analytics' },
  { pattern: /プレゼン|発表|提案/, query: 'business presentation' },
  { pattern: /技術|テクノロジー|tech/i, query: 'technology innovation' },
  { pattern: /環境|サステナ|ESG|グリーン/, query: 'sustainability green' },
  { pattern: /顧客|カスタマー|CX/, query: 'customer experience' },
  { pattern: /セキュリティ|安全/, query: 'security' },
  { pattern: /成長|売上|収益|利益/, query: 'business growth chart' },
  { pattern: /戦略|ビジョン|計画/, query: 'business strategy' },
];

function buildSearchQuery(prompt: string): string {
  for (const { pattern, query } of RETRIEVAL_KEYWORD_MAP) {
    if (pattern.test(prompt)) {
      return query;
    }
  }
  // Fallback: extract first few non-trivial words if the prompt is in English
  const englishWords = prompt.match(/[a-zA-Z]{4,}/g);
  if (englishWords && englishWords.length > 0) {
    return englishWords.slice(0, 3).join(' ');
  }
  // Generic business fallback
  return 'business professional';
}

/**
 * Build an English image generation prompt from the user's presentation prompt.
 * Image generation models work best with descriptive English prompts.
 */
function buildGenerationPrompt(prompt: string): string {
  // Try to map Japanese business topics to English generation prompts
  const GENERATION_PROMPT_MAP: Array<{ pattern: RegExp; genPrompt: string }> = [
    {
      pattern: /工場|製造|生産/,
      genPrompt:
        'Modern factory production line with robotic arms, clean industrial setting, blue lighting',
    },
    {
      pattern: /DX|デジタル|変革/,
      genPrompt:
        'Digital transformation concept, abstract blue network connections, modern technology',
    },
    {
      pattern: /AI|人工知能|機械学習/,
      genPrompt:
        'Artificial intelligence neural network, abstract glowing nodes, futuristic blue purple gradient',
    },
    {
      pattern: /自動化|オートメーション|RPA/,
      genPrompt:
        'Automation workflow, connected gears and digital circuits, clean modern design',
    },
    {
      pattern: /品質|改善|カイゼン/,
      genPrompt:
        'Quality improvement concept, ascending graph with checkmarks, professional blue theme',
    },
    {
      pattern: /戦略|ビジョン|計画/,
      genPrompt:
        'Business strategy vision, abstract upward arrows, corporate blue gradient background',
    },
    {
      pattern: /成長|収益|売上/,
      genPrompt:
        'Business growth success, ascending chart, golden light, professional corporate',
    },
    {
      pattern: /環境|サステナ|ESG/,
      genPrompt:
        'Sustainability green energy, abstract leaves and circuits, eco-friendly corporate design',
    },
    {
      pattern: /セキュリティ|安全|リスク/,
      genPrompt:
        'Cybersecurity shield, abstract digital protection concept, blue and purple theme',
    },
    {
      pattern: /データ|分析|BI/,
      genPrompt:
        'Data analytics dashboard, abstract flowing data streams, modern blue gradient',
    },
    {
      pattern: /チーム|組織|人材/,
      genPrompt:
        'Team collaboration concept, abstract connected people silhouettes, professional corporate',
    },
    {
      pattern: /イノベーション|革新/,
      genPrompt:
        'Innovation concept, lightbulb with abstract circuit patterns, modern blue gradient',
    },
  ];

  for (const { pattern, genPrompt } of GENERATION_PROMPT_MAP) {
    if (pattern.test(prompt)) {
      return genPrompt;
    }
  }

  // If English text is present, use it directly (truncated)
  const englishContent = prompt.match(/[a-zA-Z\s]{10,}/g);
  if (englishContent) {
    const combined = englishContent.join(' ').slice(0, 100);
    return `Professional corporate presentation cover image about ${combined}, clean modern design`;
  }

  // Default fallback
  return 'Professional corporate presentation hero image, abstract blue gradient, modern clean design';
}

export async function prepareImageAssetsForWorkspace(input: {
  workDir: string;
  prompt: string;
  images?: PresentationImagesInput | undefined;
  imageRetrievalProvider?: ImageRetrievalProvider | undefined;
  imageGenerationProvider?: ImageGenerationProvider | undefined;
}): Promise<ImageAssetPrepareResult> {
  const warnings: string[] = [];
  const retrievedImages: RetrievedImage[] = [];
  const generatedImages: GeneratedImage[] = [];

  const config = input.images;
  if (!config || config.retrievalEnabled === false) {
    return { retrievedImages, generatedImages, warnings };
  }

  // Ensure asset directories
  const retrievedDir = join(input.workDir, 'assets', 'images', 'retrieved');
  const generatedDir = join(input.workDir, 'assets', 'images', 'generated');
  await mkdir(retrievedDir, { recursive: true });
  await mkdir(generatedDir, { recursive: true });

  const shouldRetrieve = true;
  const generationEnabled = config.generationEnabled === true;

  // --- Retrieval ---
  if (shouldRetrieve && input.imageRetrievalProvider) {
    try {
      const searchQuery = buildSearchQuery(input.prompt);
      const results = await input.imageRetrievalProvider.search({
        query: searchQuery,
        orientation: 'landscape',
        maxResults: config.retrieval?.maxResults ?? 3,
      });

      for (const img of results) {
        try {
          const downloaded = await input.imageRetrievalProvider.download(
            img,
            input.workDir,
          );
          retrievedImages.push(downloaded);
        } catch (err) {
          warnings.push(
            `Failed to download image ${img.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    } catch (err) {
      warnings.push(
        `Image retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (shouldRetrieve && !input.imageRetrievalProvider) {
    warnings.push('Image retrieval requested but no provider available');
  }

  // --- Generation (only if enabled and retrieval yielded nothing) ---
  const needsGeneration = generationEnabled && retrievedImages.length === 0;

  if (needsGeneration && input.imageGenerationProvider) {
    try {
      // Build an English generation prompt suitable for image models
      const genPrompt = buildGenerationPrompt(input.prompt);
      const generated = await input.imageGenerationProvider.generate({
        prompt: genPrompt,
        workDir: input.workDir,
        aspectRatio: '16:9',
        style: config.generation?.style ?? 'professional, clean, corporate',
        usage: 'cover',
      });
      generatedImages.push(generated);
    } catch (err) {
      warnings.push(
        `Image generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else if (needsGeneration && !input.imageGenerationProvider) {
    warnings.push('Image generation requested but no provider available');
  }

  return { retrievedImages, generatedImages, warnings };
}
