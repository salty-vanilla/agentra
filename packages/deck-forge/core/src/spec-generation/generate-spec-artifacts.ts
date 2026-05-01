import type {
  AssetSpec,
  ContentBlock,
  DeckPlan,
  DeckSection,
  GoalSpec,
  LayoutSpec,
  PresentationBrief,
  SlideIntent,
  SlidePlan,
  SlideSpec,
  ToneSpec,
  VisualDirectionSpec,
} from "#src/index.js";
import type {
  CreatePresentationSpecInput,
  CreatePresentationSpecOutput,
  GenerateAssetPlanInput,
  GenerateAssetPlanOutput,
  GenerateDeckPlanInput,
  GenerateDeckPlanOutput,
  GenerateSlideSpecsInput,
  GenerateSlideSpecsOutput,
} from "#src/spec-generation/types.js";

export async function createPresentationSpec(
  input: CreatePresentationSpecInput,
): Promise<CreatePresentationSpecOutput> {
  const timestamp = new Date().toISOString();
  const requestInsights = extractRequestInsights(input.userRequest);
  const briefTitle = requestInsights.title;
  const briefId = `brief-${slugifyTitle(briefTitle)}`;
  const title = briefTitle;
  const slideCount = clampSlideCount(input.slideCount ?? requestInsights.slideCount);
  const outputFormat = input.outputFormat ?? "pptx";
  const language = requestInsights.language;

  const brief: PresentationBrief = {
    id: briefId,
    title,
    audience: {
      primary: input.audience ?? "general stakeholders",
      expertiseLevel: "intermediate",
      expectedConcern: ["impact", "risks", "next actions"],
    },
    goal: parseGoal(input.goal ?? input.userRequest),
    context: `Source request:\n${input.userRequest}\n\nGenerated from request at ${timestamp}`,
    tone: parseTone(input.tone),
    narrative: {
      structure: "proposal",
      arc: [
        { role: "hook", message: `Why ${title} matters now` },
        { role: "insight", message: "Current state and key observations" },
        { role: "solution", message: "Recommended approach" },
        { role: "impact", message: "Expected outcomes and KPIs" },
        { role: "call_to_action", message: "Decisions and next steps" },
      ],
    },
    output: {
      formats: [outputFormat],
      aspectRatio: "16:9",
      language,
    },
    constraints: {
      slideCount,
      minSlideCount: Math.max(3, slideCount - 2),
      maxSlideCount: Math.max(4, slideCount + 2),
    },
    visualDirection: {
      style: "corporate",
      mood: "trustworthy",
      colorMood: "clean and high contrast",
      composition: "clear hierarchy with whitespace",
      avoid: ["overly decorative backgrounds"],
    },
  };

  return { brief };
}

export async function generateDeckPlan(
  input: GenerateDeckPlanInput,
): Promise<GenerateDeckPlanOutput> {
  const { brief } = input;
  const slideCountTarget = clampSlideCount(brief.constraints.slideCount);
  const deckId = `deck-plan-${slugifyTitle(brief.title)}`;
  const slides = buildSlidePlans(slideCountTarget, brief);
  const sections = toSections(slides);

  const deckPlan: DeckPlan = {
    id: deckId,
    briefId: brief.id,
    title: brief.title,
    slideCountTarget,
    sections,
    globalStoryline: `${brief.goal.mainMessage} -> ${brief.goal.desiredOutcome}`,
  };

  return { deckPlan };
}

export async function generateSlideSpecs(
  input: GenerateSlideSpecsInput,
): Promise<GenerateSlideSpecsOutput> {
  const { brief, deckPlan } = input;
  const slideSpecs: SlideSpec[] = flattenSlides(deckPlan).map((slidePlan, index) => {
    const layout = toLayout(slidePlan.intent);
    const content = toContent(slidePlan, layout, brief);
    const assets = slidePlan.assetRequirements?.map((requirement) => ({
      assetId: `asset-${slidePlan.id}-${requirement.purpose}`,
      role: requirement.purpose === "icon" ? ("icon" as const) : ("hero" as const),
    }));

    return {
      id: slidePlan.id,
      slideNumber: index + 1,
      title: slidePlan.title,
      intent: slidePlan.intent,
      layout,
      content,
      assets,
      speakerNotes: {
        text: `${brief.goal.mainMessage}. ${slidePlan.intent.audienceTakeaway}.`,
      },
    };
  });

  return { slideSpecs };
}

export async function generateAssetPlan(
  input: GenerateAssetPlanInput,
): Promise<GenerateAssetPlanOutput> {
  const { brief, slideSpecs } = input;
  const assetSpecs: AssetSpec[] = [];
  const provider = input.imageProvider ?? "pexels";

  for (const slide of slideSpecs) {
    const needsVisual =
      slide.layout.type === "hero" ||
      slide.layout.type === "image_left_text_right" ||
      slide.layout.type === "text_left_image_right" ||
      slide.layout.type === "comparison" ||
      slide.content.some((block) => block.type === "image");

    if (!needsVisual) {
      continue;
    }

    const resolvedMode = resolveAssetAcquisitionMode({
      mode: input.acquisitionMode ?? "auto",
      visualDirection: brief.visualDirection,
    });

    if (resolvedMode === "retrieve") {
      assetSpecs.push({
        id: `asset-${slide.id}-hero`,
        type: "retrieved_image",
        provider,
        query: `${brief.title} ${slide.title} ${slide.intent.keyMessage}`,
        targetSlideIds: [slide.id],
      });
      continue;
    }

    assetSpecs.push({
      id: `asset-${slide.id}-hero`,
      type: "generated_image",
      purpose: "hero",
      visualDirection: brief.visualDirection,
      prompt: `${brief.title}. ${slide.title}. ${slide.intent.keyMessage}.`,
      aspectRatio: brief.output.aspectRatio,
      targetSlideIds: [slide.id],
    });
  }

  return { assetSpecs };
}

function resolveAssetAcquisitionMode(input: {
  mode: "generate" | "retrieve" | "auto";
  visualDirection: VisualDirectionSpec;
}): "generate" | "retrieve" {
  if (input.mode === "generate" || input.mode === "retrieve") {
    return input.mode;
  }

  if (input.visualDirection.style === "photorealistic") {
    return "retrieve";
  }

  return "generate";
}

function buildSlidePlans(slideCount: number, brief: PresentationBrief): SlidePlan[] {
  const slides: SlidePlan[] = [];
  const total = Math.max(3, slideCount);

  for (let index = 0; index < total; index += 1) {
    const isFirst = index === 0;
    const isLast = index === total - 1;
    const ordinal = index + 1;
    const slideId = `slide-${String(ordinal).padStart(3, "0")}`;

    let intent: SlideIntent;
    if (isFirst) {
      intent = {
        type: "title",
        keyMessage: brief.goal.mainMessage,
        audienceTakeaway:
          brief.output.language === "ja"
            ? "資料の目的と前提が明確になります。"
            : "The deck objective and context are clear.",
      };
    } else if (isLast) {
      intent = {
        type: "closing",
        keyMessage:
          brief.output.language === "ja" ? "要点と次の確認事項" : "Decision and next steps",
        audienceTakeaway: brief.goal.desiredOutcome,
      };
    } else if (index % 3 === 0) {
      intent = {
        type: "summary",
        keyMessage:
          brief.output.language === "ja"
            ? "提示内容を整理して判断しやすくします。"
            : "Organize the supplied content for easier judgment.",
        audienceTakeaway:
          brief.output.language === "ja"
            ? "主要な論点を比較できます。"
            : "The main points are easy to compare.",
      };
    } else if (index % 2 === 0) {
      intent = {
        type: "process",
        keyMessage:
          brief.output.language === "ja"
            ? "確認すべき流れを具体化します。"
            : "Clarify the practical sequence to review.",
        audienceTakeaway:
          brief.output.language === "ja"
            ? "次に確認する内容が明確になります。"
            : "The next review steps are clear.",
      };
    } else {
      intent = {
        type: "proposal",
        keyMessage: brief.goal.mainMessage,
        audienceTakeaway: brief.goal.desiredOutcome,
      };
    }

    const expectedLayout = toLayout(intent).type;
    const assetPurpose =
      expectedLayout === "hero" ||
      expectedLayout === "comparison" ||
      expectedLayout === "image_left_text_right" ||
      expectedLayout === "text_left_image_right";

    slides.push({
      id: slideId,
      title: buildSlideTitle(intent, brief.title, ordinal, total),
      intent,
      expectedLayout,
      contentRequirements: [
        {
          id: `${slideId}-headline`,
          description: "State one clear message in the title.",
          priority: "high",
          expectedBlockType: "title",
        },
        {
          id: `${slideId}-body`,
          description: "Provide concise supporting detail.",
          priority: "high",
          expectedBlockType: intent.type === "data_insight" ? "table" : "bullet_list",
        },
      ],
      assetRequirements: assetPurpose
        ? [
            {
              id: `${slideId}-visual`,
              purpose: "hero",
              description: "Visual support for the core message.",
              targetSlideIds: [slideId],
            },
          ]
        : undefined,
    });
  }

  return slides;
}

function toSections(slides: SlidePlan[]): DeckSection[] {
  if (slides.length <= 2) {
    return [
      {
        id: "section-main",
        title: "Main Story",
        role: "proposal",
        slides,
      },
    ];
  }

  return [
    {
      id: "section-intro",
      title: "Introduction",
      role: "intro",
      slides: [slides[0]],
    },
    {
      id: "section-body",
      title: "Core Narrative",
      role: "analysis",
      slides: slides.slice(1, -1),
    },
    {
      id: "section-closing",
      title: "Conclusion",
      role: "result",
      slides: [slides[slides.length - 1]],
    },
  ];
}

function flattenSlides(plan: DeckPlan): SlidePlan[] {
  const items: SlidePlan[] = [];
  for (const section of plan.sections) {
    for (const slide of section.slides) {
      items.push(slide);
    }
  }
  return items;
}

function toLayout(intent: SlideIntent): LayoutSpec {
  switch (intent.type) {
    case "title":
      return { type: "title", density: "low", emphasis: "center" };
    case "data_insight":
      return { type: "dashboard", density: "medium", emphasis: "data" };
    case "comparison":
      return { type: "comparison", density: "medium", emphasis: "visual" };
    case "process":
      return { type: "timeline", density: "medium", emphasis: "left" };
    case "closing":
      return { type: "single_column", density: "low", emphasis: "center" };
    default:
      return { type: "single_column", density: "medium", emphasis: "top" };
  }
}

function toContent(
  slide: SlidePlan,
  layout: LayoutSpec,
  brief?: PresentationBrief,
): ContentBlock[] {
  const titleBlock: ContentBlock = {
    id: `cb-${slide.id}-title`,
    type: "title",
    text: slide.title,
    emphasis: "strong",
  };

  if (layout.type === "dashboard") {
    return [
      titleBlock,
      {
        id: `cb-${slide.id}-table`,
        type: "table",
        caption: brief?.output.language === "ja" ? "要点整理" : "Key points",
        headers: brief?.output.language === "ja" ? ["項目", "内容"] : ["Point", "Detail"],
        rows: [
          [brief?.output.language === "ja" ? "主旨" : "Main message", slide.intent.keyMessage],
          [
            brief?.output.language === "ja" ? "期待される理解" : "Audience takeaway",
            slide.intent.audienceTakeaway,
          ],
        ],
      },
    ];
  }

  if (layout.type === "title") {
    return [
      titleBlock,
      {
        id: `cb-${slide.id}-subtitle`,
        type: "subtitle",
        text: slide.intent.keyMessage,
      },
    ];
  }

  if (slide.intent.type === "closing") {
    return [
      titleBlock,
      {
        id: `cb-${slide.id}-callout`,
        type: "callout",
        text: slide.intent.audienceTakeaway,
        tone: "success",
      },
    ];
  }

  return [
    titleBlock,
    {
      id: `cb-${slide.id}-bullets`,
      type: "bullet_list",
      density: "medium",
      items: [
        { text: slide.intent.keyMessage, importance: "high" },
        {
          text:
            brief?.output.language === "ja"
              ? "入力内容に基づく補足情報を整理します。"
              : "Supporting detail is organized from the supplied request.",
          importance: "medium",
        },
        { text: slide.intent.audienceTakeaway, importance: "high" },
      ],
    },
  ];
}

function toTitle(userRequest: string): string {
  const compact = userRequest.replaceAll(/\s+/g, " ").trim();
  if (!compact) {
    return "Untitled Presentation";
  }

  if (compact.length <= 64) {
    return compact;
  }

  return `${compact.slice(0, 61)}...`;
}

type RequestInsights = {
  language: string;
  title: string;
  slideCount?: number;
};

function extractRequestInsights(userRequest: string): RequestInsights {
  return {
    language: detectLanguage(userRequest),
    title: toTitle(userRequest),
    slideCount: extractSlideCount(userRequest),
  };
}

function detectLanguage(text: string): string {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text) ? "ja" : "en";
}

function extractSlideCount(text: string): number | undefined {
  const match = text.match(
    /(?:スライド|slide|slides|資料)?\s*(\d{1,2})\s*(?:枚|ページ|p|slides?|スライド)/i,
  );
  if (!match?.[1]) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

function parseGoal(seed: string): GoalSpec {
  const text = seed.trim();
  const ja = detectLanguage(text) === "ja";
  if (!text) {
    return {
      type: "inform",
      mainMessage: ja ? "現状をわかりやすく整理する。" : "Present the current status clearly.",
      desiredOutcome: ja
        ? "聞き手が事実と方向性を理解できる。"
        : "Audience aligns on facts and direction.",
    };
  }

  return {
    type: "proposal",
    mainMessage: text,
    desiredOutcome: ja
      ? "聞き手が提示内容を理解し、次の確認事項を判断できる。"
      : "Audience agrees on the proposed plan.",
  };
}

function parseTone(seed?: string): ToneSpec {
  if (seed?.toLowerCase().includes("executive")) {
    return {
      formality: "executive",
      energy: "confident",
      technicalDepth: "medium",
      styleKeywords: ["concise", "decision-oriented"],
    };
  }

  if (seed?.toLowerCase().includes("casual")) {
    return {
      formality: "casual",
      energy: "calm",
      technicalDepth: "low",
      styleKeywords: ["clear", "approachable"],
    };
  }

  return {
    formality: "business",
    energy: "confident",
    technicalDepth: "medium",
    styleKeywords: ["structured", "concise"],
  };
}

function buildSlideTitle(
  intent: SlideIntent,
  deckTitle: string,
  index: number,
  total: number,
): string {
  const ja = detectLanguage(deckTitle) === "ja" || detectLanguage(intent.keyMessage) === "ja";
  if (intent.type === "title") {
    return deckTitle;
  }
  if (intent.type === "closing") {
    return ja ? "まとめと確認事項" : "Decision and Next Steps";
  }
  if (intent.type === "data_insight") {
    return ja ? `要点整理 ${index}/${total}` : `Fallback Insight ${index}/${total}`;
  }
  if (intent.type === "process") {
    return ja ? `確認の流れ ${index}/${total}` : `Fallback Sequence ${index}/${total}`;
  }
  return ja ? `論点 ${index}/${total}` : `Fallback Point ${index}/${total}`;
}

function clampSlideCount(value: number | undefined): number {
  if (!value || Number.isNaN(value)) {
    return 6;
  }
  return Math.max(3, Math.min(15, Math.round(value)));
}

function shortId(): string {
  return "generated";
}

function slugifyTitle(value: string): string {
  const slug = value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  if (!slug) {
    return shortId();
  }

  return slug.slice(0, 40);
}

export function defaultVisualDirection(): VisualDirectionSpec {
  return {
    style: "corporate",
    mood: "trustworthy",
    colorMood: "clean and high contrast",
    composition: "clear hierarchy with whitespace",
    avoid: ["overly decorative backgrounds"],
  };
}
