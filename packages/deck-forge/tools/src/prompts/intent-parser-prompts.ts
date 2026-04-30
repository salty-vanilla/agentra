import type { DeckPlan, PresentationBrief } from "@deck-forge/core";

const COMMON_RULES_EN = `
General rules:
- Output MUST validate against the provided JSON schema. No extra keys.
- Use the user's actual subject matter; do not invent generic placeholder content.
- Avoid filler phrases such as "Proposal Point", "Key Insight", or fabricated metrics.
`.trim();

const COMMON_RULES_JA = `
共通ルール:
- 出力は与えられた JSON スキーマに完全に準拠してください。余分なキーは禁止。
- ユーザーが指定した題材そのものを扱い、汎用的な穴埋め文を作らないこと。
- 「提案ポイント」「重要なインサイト」などのテンプレ文や捏造した数値は避ける。
`.trim();

function rules(language: "ja" | "en"): string {
  return language === "ja" ? COMMON_RULES_JA : COMMON_RULES_EN;
}

function localized<T extends string>(language: "ja" | "en" | undefined, ja: T, en: T): T {
  return language === "ja" ? ja : en;
}

export type BriefPromptInput = {
  goal: string;
  audience?: string;
  language?: "ja" | "en";
};

/**
 * System prompt for the brief-generation step. The model receives the
 * user's free-text goal plus this prompt, and must call the
 * `create_brief` tool with input matching `BRIEF_JSON_SCHEMA`.
 */
export function getBriefGenerationPrompt(input: BriefPromptInput): string {
  const { goal, audience, language } = input;
  const role = localized(
    language,
    "あなたはプレゼン構成のリードプランナーです。",
    "You are a senior presentation planner.",
  );
  const task = localized(
    language,
    "ユーザーの依頼から PresentationBrief を1つ作成してください。",
    "Produce a single PresentationBrief that captures the user's intent.",
  );
  const audienceLine = audience
    ? localized(language, `想定オーディエンス: ${audience}`, `Intended audience: ${audience}`)
    : "";
  const goalLine = localized(language, `ユーザー目的: ${goal}`, `User goal: ${goal}`);
  return [role, task, goalLine, audienceLine, rules(language ?? "en")].filter(Boolean).join("\n\n");
}

export type DeckPlanPromptInput = {
  brief: PresentationBrief;
};

/**
 * System prompt for the deck-plan step. Receives the validated brief and
 * must call the `create_deck_plan` tool with input matching
 * `DECK_PLAN_JSON_SCHEMA`.
 */
export function getDeckPlanGenerationPrompt(input: DeckPlanPromptInput): string {
  const { brief } = input;
  const language: "ja" | "en" = brief.output.language === "ja" ? "ja" : "en";
  const role = localized(
    language,
    "あなたはストーリーラインを設計する構成作家です。",
    "You are a presentation storyline architect.",
  );
  const task = localized(
    language,
    "以下のブリーフから、セクションとスライド単位の DeckPlan を作成してください。",
    "From the brief below, produce a DeckPlan organized into sections and slides.",
  );
  const constraints = localized(
    language,
    `スライド枚数の目安: ${brief.constraints.slideCount ?? "未指定"}`,
    `Target slide count: ${brief.constraints.slideCount ?? "unspecified"}`,
  );
  return [
    role,
    task,
    `Brief title: ${brief.title}`,
    `Goal: ${brief.goal.mainMessage}`,
    `Audience: ${brief.audience.primary} (${brief.audience.expertiseLevel})`,
    `Narrative structure: ${brief.narrative.structure}`,
    constraints,
    rules(language),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type SlideSpecPromptInput = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideId: string;
};

/**
 * System prompt for a single SlideSpec generation. Receives the brief, the
 * full deck plan, and the id of the slide to generate. Must call the
 * `create_slide_spec` tool with input matching `SLIDE_SPEC_JSON_SCHEMA`.
 */
export function getSlideSpecGenerationPrompt(input: SlideSpecPromptInput): string {
  const { brief, deckPlan, slideId } = input;
  const language: "ja" | "en" = brief.output.language === "ja" ? "ja" : "en";

  const planSlide = deckPlan.sections
    .flatMap((section) => section.slides.map((slide) => ({ slide, sectionTitle: section.title })))
    .find((entry) => entry.slide.id === slideId);

  const role = localized(
    language,
    "あなたはスライドの本文と構成を仕上げるエディターです。",
    "You are a slide editor finalizing one slide at a time.",
  );
  const task = localized(
    language,
    `id=${slideId} のスライド SlideSpec を1つだけ生成してください。`,
    `Generate exactly one SlideSpec for the slide with id=${slideId}.`,
  );
  const planContext = planSlide
    ? [
        `Section: ${planSlide.sectionTitle}`,
        `Title (planned): ${planSlide.slide.title}`,
        `Slide intent: ${planSlide.slide.intent.type} — ${planSlide.slide.intent.keyMessage}`,
        `Audience takeaway: ${planSlide.slide.intent.audienceTakeaway}`,
        `Expected layout: ${planSlide.slide.expectedLayout}`,
      ].join("\n")
    : `(slideId=${slideId} not found in deckPlan; treat as new slide and reuse the brief context)`;

  return [
    role,
    task,
    `Brief goal: ${brief.goal.mainMessage}`,
    `Audience: ${brief.audience.primary}`,
    `Tone: ${brief.tone.formality}/${brief.tone.energy}`,
    planContext,
    rules(language),
  ]
    .filter(Boolean)
    .join("\n\n");
}
