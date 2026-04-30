import type { AssetSpec, DeckPlan, PresentationBrief, SlideSpec } from '@deck-forge/core';
import type { IntentParser, StructuredIntent, ValidationResult } from '@deck-forge/tools';
import {
  ASSET_SPEC_JSON_SCHEMA,
  BRIEF_JSON_SCHEMA,
  DECK_PLAN_JSON_SCHEMA,
  getBriefGenerationPrompt,
  getDeckPlanGenerationPrompt,
  getSlideSpecGenerationPrompt,
  SLIDE_SPEC_JSON_SCHEMA,
  validateBrief,
  validateDeckPlan,
  validateSlideSpec,
} from '@deck-forge/tools';
import {
  extractJson,
  invokeBedrockText,
  invokeBedrockToolUse,
} from './bedrock-client.js';
import { getLogger } from './logging.js';
import {
  describeThemePresets,
  getThemePreset,
  THEME_PRESET_IDS,
  type ThemePresetId,
} from './theme-presets.js';

/* ------------------------------------------------------------------ */
/*  Tool definitions wrapping v0.2.1 JSON Schemas                      */
/* ------------------------------------------------------------------ */

const BRIEF_TOOL = {
  name: 'create_brief',
  description:
    'Create a PresentationBrief that captures audience, goal, tone, narrative, and constraints.',
  input_schema: BRIEF_JSON_SCHEMA,
} as const;

const DECK_PLAN_TOOL = {
  name: 'create_deck_plan',
  description:
    'Create a DeckPlan that defines the section structure and slide plan for the presentation.',
  input_schema: DECK_PLAN_JSON_SCHEMA,
} as const;

const SLIDE_SPEC_TOOL = {
  name: 'create_slide_spec',
  description: 'Create a single SlideSpec for the requested slideId.',
  input_schema: SLIDE_SPEC_JSON_SCHEMA,
} as const;

/* ------------------------------------------------------------------ */
/*  Asset specs — keep custom schema/prompt (not yet provided by v0.2.1) */
/* ------------------------------------------------------------------ */

const ASSET_SPECS_SYSTEM = `You are a visual design consultant.
Given the PresentationBrief and SlideSpecs, create AssetSpecs for images and diagrams.
Use "retrieved_image" with specific searchQuery for photo content, "generated_image" with detailed prompts for illustrations.
Target each asset to specific slides via targetSlideIds.`;

const ASSET_SPECS_TOOL = {
  name: 'create_asset_specs',
  description:
    'Create the AssetSpec array describing images, diagrams, and icons needed for the presentation.',
  input_schema: {
    type: 'object',
    required: ['assetSpecs'],
    properties: {
      assetSpecs: {
        type: 'array',
        items: ASSET_SPEC_JSON_SCHEMA,
      },
    },
  },
} as const;

const MODIFY_SYSTEM = `You are a presentation consultant AI. Given a user request and an inspect summary of the current presentation, produce a structured intent for modifying the presentation.

Return JSON:
{
  "mode": "modify",
  "confidence": <number 0-1>,
  "missingFields": [],
  "goal": "<user goal>",
  "modifyIntent": {
    "changeRequest": "<description>",
    "operations": []
  }
}

Return ONLY the JSON, wrapped in a code fence.`;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function log(step: string, msg: string, data?: unknown) {
  if (data !== undefined) {
    getLogger().info({ step, data }, `[deck-forge-runtime] [${step}] ${msg}`);
  } else {
    getLogger().info({ step }, `[deck-forge-runtime] [${step}] ${msg}`);
  }
}

function detectLanguage(text: string): 'ja' | 'en' {
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)
    ? 'ja'
    : 'en';
}

/* ------------------------------------------------------------------ */
/*  Brief / DeckPlan prompt enhancements (house style)                  */
/* ------------------------------------------------------------------ */

function briefExtraGuidance(language: 'ja' | 'en'): string {
  if (language === 'ja') {
    return `
============================================================
ブリーフ作成の追加ガイド
============================================================

narrative.structure の選び方（迷ったらこの基準で）:
- problem_solution : 課題提示→解決策提示（製品提案・改善企画など）
- before_after     : 旧状態と新状態の対比（移行・リファクタ報告）
- proposal         : 投資/承認を取りに行く（経営層向け提案・予算申請）
- analysis         : データから示唆を導く（実績レビュー・市場調査）
- story            : 物語的に体験させる（ブランドピッチ・カスタマーストーリー）
- pyramid          : 結論→根拠→根拠（経営層向け短時間報告で最強）
- research_paper   : 仮説→手法→結果→考察（研究/技術発表）
- demo             : 機能紹介→使用例→価値（プロダクトデモ）

経営層向け四半期報告のような「忙しい意思決定者」向けは、原則 pyramid または analysis を選ぶ。

audience.expertiseLevel の判定:
- "executive"   : 取締役/役員/部長級。要点と意思決定材料を最優先。
- "expert"      : 同分野の専門家。技術深堀り可。
- "intermediate": 関連部門。前提説明を1スライドで済ませる。
- "beginner"   : 顧客/新人。比喩・図解多め。

tone.formality の判定:
- "executive" : 経営層向け。文体は簡潔、敬体不要、体言止め歓迎。
- "business"  : 一般ビジネス。敬体ベースで簡潔。
- "academic"  : 論文/学会。常体・専門用語。
- "casual"    : 社内勉強会など。

constraints.slideCount: ユーザーが明示した枚数があれば必ずそれを設定する。

goal.mainMessage: 1文・40字以内・「結論」を述べる体言止めで書く（例: "Q1のOEEは78ptで通期目標78pt達成"）。

constraints.mustInclude: 数値や固有名詞など、確実に登場させたいキーワードのみ列挙する。長い説明文を入れない。`.trim();
  }
  return `
============================================================
Brief drafting extra guidance
============================================================

How to pick narrative.structure:
- problem_solution : Problem → solution. Product proposals, improvement plans.
- before_after     : Old vs new state. Migration / refactor reports.
- proposal         : Asking for investment / approval. Executive proposals, budget asks.
- analysis         : Deriving insight from data. Performance reviews, market studies.
- story            : Narrative arc. Brand pitches, customer stories.
- pyramid          : Conclusion first → supporting points. Best for time-pressed executives.
- research_paper   : Hypothesis → method → results → discussion. Research talks.
- demo             : Features → use case → value. Product demos.

For executive quarterly reports default to pyramid or analysis.

audience.expertiseLevel:
- "executive"   : Board / VP / director. Decision-grade content only.
- "expert"      : Same-domain peers. Deep dive allowed.
- "intermediate": Cross-functional. One slide of context max.
- "beginner"   : Customers / new hires. Heavy on analogies and visuals.

tone.formality:
- "executive" : Concise, statement-style.
- "business"  : Standard professional.
- "academic"  : Formal, technical jargon ok.
- "casual"    : Internal study sessions, etc.

constraints.slideCount: Always set if the user specified a count.

goal.mainMessage: One sentence, ≤120 chars, statement of the conclusion (NOT a question).

constraints.mustInclude: Only verbatim keywords/numbers that must appear. Do NOT put long descriptive sentences here.`.trim();
}

function deckPlanExtraGuidance(language: 'ja' | 'en'): string {
  if (language === 'ja') {
    return `
============================================================
DeckPlan 作成の追加ガイド
============================================================

スライドの責務:
- 1スライド1メッセージ。タイトルにそのメッセージを書く。
- intent.type は以下から選ぶ（deck-forge 0.3.1 SlideIntent）:
    title / agenda / summary / problem / comparison / timeline /
    process / architecture / data_insight / case_study /
    proposal / decision / closing
  主なマッピング:
    KPIレビュー/数値分析 → data_insight
    二者比較/代替案の検討 → comparison
    手順・プロセス → process
    スケジュール・年表 → timeline
    システム構成/構造図 → architecture
    事例紹介 → case_study
    提案・依頼 → proposal
    意思決定依頼 → decision
    表紙 → title / 目次 → agenda / まとめ → summary / クロージング → closing
- expectedLayout は内容に合わせて選ぶ（deck-forge 0.3.1 LayoutType。値は必ず snake_case）:
    "title"                 : 表紙
    "section"               : 章扉・セクション区切り
    "single_column"         : 説明・本文中心の縦積み
    "two_column"            : 比較・対比（before/after, 競合比較など）
    "three_column"          : 3項目並列（特徴3つ・3ステップなど）
    "hero"                  : 1つの強い数字・写真・引用で印象付ける
    "image_left_text_right" : 左に画像、右に説明テキスト
    "text_left_image_right" : 左に説明テキスト、右に画像
    "comparison"            : 2案比較（pros/cons, A vs B）
    "dashboard"             : 3〜6個のKPIや表をカード並列
    "timeline"              : 時系列・ロードマップ・プロセス
    "matrix"                : 2x2 マトリクス（4象限分析）
    "diagram_focus"         : 1枚の図解（フロー・アーキテクチャ）が主役
- intent.keyMessage は「結論」を体言止めで（例: "稼働率92%は通期目標を上回るペース"）。
- audienceTakeaway は「聞き手が次に取る行動・記憶すべき1点」を書く。

セクション分割:
- pyramid 構成なら: 表紙 → 結論サマリ → 根拠1 → 根拠2 → 根拠3 → 次アクション。
- analysis 構成なら: 表紙 → 全体像 → 詳細分析（複数）→ 示唆 → 次アクション。
- 表紙と「次アクション/質疑」スライドは必ず入れる。

slideCount が指定されていれば、その範囲に必ず収める。`.trim();
  }
  return `
============================================================
DeckPlan extra guidance
============================================================

Slide responsibilities:
- 1 slide = 1 message. The title states that message.
- intent.type must be ONE of (deck-forge 0.3.1 SlideIntent enum):
    title / agenda / summary / problem / comparison / timeline /
    process / architecture / data_insight / case_study /
    proposal / decision / closing
  Common mappings:
    KPI / metrics review     -> data_insight
    A vs B, options          -> comparison
    How-to, steps            -> process
    Schedule, milestones     -> timeline
    System / structure       -> architecture
    Customer story           -> case_study
    Asking for budget/sign-off-> proposal
    Decision request         -> decision
    Cover -> title, TOC -> agenda, recap -> summary, wrap -> closing
- expectedLayout selection (deck-forge 0.3.1 LayoutType, snake_case ONLY):
    "title"                 : Cover slide
    "section"               : Chapter / section divider
    "single_column"         : Body-heavy vertical stack
    "two_column"            : Side-by-side compare (before/after, A vs B)
    "three_column"          : Three parallel items (3 features, 3 steps)
    "hero"                  : One dominant number / image / quote
    "image_left_text_right" : Image left, explanation right
    "text_left_image_right" : Explanation left, image right
    "comparison"            : Pros/cons, option A vs option B
    "dashboard"             : 3–6 KPI / table cards in a grid
    "timeline"              : Time sequence, roadmap, milestones
    "matrix"                : 2x2 matrix (four-quadrant analysis)
    "diagram_focus"         : One diagram (flow / architecture) as the hero
- intent.keyMessage = the conclusion as a single statement.
- audienceTakeaway = the one thing the audience should remember or do next.

Section composition:
- pyramid: Cover → conclusion summary → support1 → support2 → support3 → next actions.
- analysis: Cover → overview → detailed analyses → implication → next actions.
- Always include a cover slide and a closing "next actions / Q&A" slide.

Honor slideCount strictly when set.`.trim();
}

/* ------------------------------------------------------------------ */
/*  Theme preset picker                                                 */
/* ------------------------------------------------------------------ */

const THEME_PICKER_TOOL = {
  name: 'pick_theme_preset',
  description:
    'Pick the single best theme preset id for the requested presentation. Output one id and a one-sentence rationale.',
  input_schema: {
    type: 'object',
    required: ['presetId'],
    properties: {
      presetId: {
        type: 'string',
        enum: THEME_PRESET_IDS,
      },
      rationale: { type: 'string' },
    },
  },
} as const;

async function applyThemePresetIfMissing(
  brief: PresentationBrief,
  userRequest: string,
): Promise<void> {
  // Respect explicit brand colors from the brief LLM (rare but possible).
  if (brief.brand?.colors && Object.keys(brief.brand.colors).length > 0) {
    log('themePreset', 'brief already has brand.colors; skipping picker');
    return;
  }

  const language = brief.output?.language === 'ja' ? 'ja' : 'en';
  const system =
    language === 'ja'
      ? `あなたはプレゼンテーションのアートディレクターです。\n以下の候補テーマから、ブリーフと依頼内容に最も合うものを1つだけ選んでください。\n\n候補:\n${describeThemePresets()}\n\npick_theme_preset ツールを必ず1回呼ぶこと。`
      : `You are an art director for presentations.\nPick exactly ONE theme preset that best matches the brief and user request.\n\nCandidates:\n${describeThemePresets()}\n\nCall pick_theme_preset exactly once.`;

  const userMessage = [
    `User request:`,
    userRequest,
    '',
    `Brief summary:`,
    JSON.stringify(
      {
        title: brief.title,
        audience: brief.audience,
        goal: brief.goal,
        tone: brief.tone,
        visualDirection: brief.visualDirection,
      },
      null,
      2,
    ),
    '',
    'Pick the best preset.',
  ].join('\n');

  try {
    const result = await invokeBedrockToolUse<{
      presetId: ThemePresetId;
      rationale?: string;
    }>({
      system,
      userMessage,
      tool: THEME_PICKER_TOOL,
      maxTokens: 512,
    });

    const preset = getThemePreset(result.presetId);
    if (!preset) {
      log('themePreset', 'picker returned unknown preset id', {
        presetId: result.presetId,
      });
      return;
    }

    brief.brand = {
      ...(brief.brand ?? {}),
      colors: { ...preset.colors },
      fonts: { ...preset.fonts },
    };

    log('themePreset', 'applied', {
      presetId: preset.id,
      rationale: result.rationale,
    });
  } catch (error) {
    log('themePreset', 'picker failed; keeping mood-derived defaults', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run an LLM step that returns a tool_use payload, validate the result,
 * and retry once with the validation issues injected into the prompt.
 */
async function generateAndValidate<T>(input: {
  step: string;
  system: string;
  userMessage: string;
  tool: { name: string; description: string; input_schema: Record<string, unknown> };
  validate: (value: unknown) => ValidationResult;
  maxTokens?: number;
}): Promise<T> {
  const first = await invokeBedrockToolUse<T>({
    system: input.system,
    userMessage: input.userMessage,
    tool: input.tool,
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
  });

  const firstResult = input.validate(first);
  if (firstResult.valid) {
    return first;
  }

  log(input.step, 'validation failed, retrying once', { issues: firstResult.issues });

  const retryMessage = `${input.userMessage}

The previous attempt failed validation with these issues:
${firstResult.issues.map((i) => `- ${i}`).join('\n')}

Fix every issue and call the tool again with a corrected payload.`;

  const second = await invokeBedrockToolUse<T>({
    system: input.system,
    userMessage: retryMessage,
    tool: input.tool,
    ...(input.maxTokens !== undefined ? { maxTokens: input.maxTokens } : {}),
  });

  const secondResult = input.validate(second);
  if (!secondResult.valid) {
    log(input.step, 'validation failed after retry', { issues: secondResult.issues });
    throw new Error(
      `[${input.step}] validation failed after retry: ${secondResult.issues.join('; ')}`,
    );
  }
  return second;
}

/* ------------------------------------------------------------------ */
/*  Pipeline                                                           */
/* ------------------------------------------------------------------ */

/**
 * The intermediate artifacts produced by the create pipeline. We expose
 * these so callers can re-build a StructuredIntent after revising
 * SlideSpecs (vision-reviewer revision loop).
 */
export type CreatePipelineResult = {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideSpecs: SlideSpec[];
  assetSpecs: AssetSpec[];
  intent: StructuredIntent;
};

/**
 * Run the full create pipeline (brief -> deckPlan -> slideSpecs -> assetSpecs)
 * once and return both the StructuredIntent (ready to feed into the runner)
 * and the intermediate artifacts (so they can be revised and rebuilt).
 */
export async function runCreatePipeline(
  userRequest: string,
): Promise<CreatePipelineResult> {
  const language = detectLanguage(userRequest);

  // Step 1: Brief
  log('brief', 'invoking tool_use...');
  const briefSystemBase = getBriefGenerationPrompt({ goal: userRequest, language });
  const briefSystem = `${briefSystemBase}

${briefExtraGuidance(language)}`;
  const brief = await generateAndValidate<PresentationBrief>({
    step: 'brief',
    system: briefSystem,
    userMessage: userRequest,
    tool: BRIEF_TOOL,
    validate: (v) => validateBrief(v, { expectedLanguage: language }),
  });
  log('brief', 'done', {
    id: brief.id,
    title: brief.title,
    language: brief.output?.language,
    narrative: brief.narrative?.structure,
  });

  // Step 1b: Theme preset picker — only when brief.brand.colors is empty.
  // Mutates `brief.brand` in place so downstream `buildPresentationIr` picks
  // up a curated palette + font pair instead of the default mood-derived one.
  await applyThemePresetIfMissing(brief, userRequest);

  // Step 2: DeckPlan
  log('deckPlan', 'invoking tool_use...');
  const expectedSlideCount = brief.constraints?.slideCount;
  const deckPlanOptions = expectedSlideCount !== undefined ? { expectedSlideCount } : {};
  const deckPlanSystemBase = getDeckPlanGenerationPrompt({ brief });
  const deckPlanSystem = `${deckPlanSystemBase}

${deckPlanExtraGuidance(language)}`;
  const deckPlan = await generateAndValidate<DeckPlan>({
    step: 'deckPlan',
    system: deckPlanSystem,
    userMessage: `PresentationBrief:\n${JSON.stringify(brief, null, 2)}`,
    tool: DECK_PLAN_TOOL,
    validate: (v) => validateDeckPlan(v, deckPlanOptions),
  });
  log('deckPlan', 'done', {
    id: deckPlan.id,
    sections: deckPlan.sections?.length,
    slides: deckPlan.sections?.reduce((n, s) => n + (s.slides?.length ?? 0), 0),
  });

  // Step 3: SlideSpecs — generate each slide in parallel
  const slideIds = deckPlan.sections.flatMap((section) =>
    section.slides.map((slide) => slide.id),
  );
  log('slideSpecs', 'invoking tool_use in parallel', { count: slideIds.length });

  // NOTE: We intentionally do NOT forward brief.constraints.mustInclude /
  // mustAvoid to validateSlideSpec. The brief LLM tends to populate mustInclude
  // with verbatim formatted strings (e.g. "天気：晴れ（Sunny）") that will
  // never match the structured SlideSpec JSON, causing permanent validation
  // failures. The constraints are already present in the system prompt via
  // getSlideSpecGenerationPrompt({ brief }), so the LLM is guided to include
  // the required content without us needing to enforce it at the schema level.
  // Hint to the LLM that 0.3.0 renderers natively support these block types
  // and decoration tokens, so it should prefer them over plain paragraph
  // walls of text. Appended to the upstream system prompt rather than
  // editing the prompt source.
  const slideSpecExtraGuidance = `

============================================================
ADDITIONAL DRAFTING RULES (deck-forge 0.3.1 renderer + house style)
============================================================

Renderer capabilities — prefer these block types over plain paragraphs:
- MetricBlock → rendered as a card-decorated callout with KPI grid auto-layout. Use it for ALL numeric KPIs.
- DiagramBlock kinds:
    cycle      → 3–6 nodes that loop back. Use for repeating processes.
    flowchart  → 3–8 sequential steps. Use for procedures / pipelines / "before → after" flows.
    timeline   → time-ordered milestones. Use for schedules, roadmaps, history.
    funnel     → top-down narrowing. Use for conversion / filtering.
    layered    → vertical stack of layers. Use for architectures.
    matrix     → 2×2 / 3×3 grid. Use for categorisations.
- ChartBlock (bar / line / area / pie / scatter) → rendered as native pptx chart. Use for trends and comparisons.
- TableBlock → use for ≥2-column comparisons.
- BulletListBlock → semantic <ul><li> with nested indent levels. Use for lists, NOT for processes (use Diagram).

House style — the difference between "auto-generated" and "consultant-quality":

1. Title rules
   - ≤25 characters when possible. Punchy, statement-style, NOT a question.
   - 体言止め (noun-ending) preferred for ja; sentence case for en.
   - The cover slide title MUST include the subject; the subtitle MUST include 対象期間 + 作成日 (when ja).

2. KPI rules
   - Every KPI is its own MetricBlock with: label, value (number), unit, optional delta vs prior period.
   - Format value as "92" + unit "%" — never embed unit in value.
   - When a delta is provided, use ↑ / ↓ glyphs and absolute pp/% (e.g. "+2.1pt", "−0.3%").
   - 1 slide should hold 3–6 KPIs max. If more, split into two slides.

3. Body text rules
   - 1 slide = 1 message. The title states the message; the body proves it.
   - Bullet lines: max 5 per block, max 30 chars each (ja) / 60 chars (en). No nested bullets unless the structure is genuinely hierarchical.
   - Never write a paragraph longer than 80 chars (ja) / 160 chars (en) — split or convert to bullets.
   - Do NOT mix 敬体 (です・ます) and 常体 (だ・である) in the same deck. Pick one and stick to it. Default: 常体 + 体言止め for executive decks.

4. Structure rules
   - Process / steps → flowchart Diagram OR a SlideSpec with layout.type="timeline". NOT a bulleted list.
   - Trend over time → Chart (line/area), NOT a table.
   - Comparison across categories → layout.type="comparison" (2 options) / "three_column" (3 options) / "dashboard" (≥4 cards), NOT bullets.
   - 2x2 categorisation → layout.type="matrix".
   - Single dominant visual / quote / KPI → layout.type="hero".
   - Architecture / single big diagram → layout.type="diagram_focus".
   - Narrative summary → CalloutBlock above body, NOT paragraph at top.

   Layout selection should match the SlidePlan.expectedLayout from the DeckPlan; only deviate if a richer layout in the deck-forge 0.3.1 catalog is clearly a better fit (title / section / single_column / two_column / three_column / hero / image_left_text_right / text_left_image_right / comparison / dashboard / timeline / matrix / diagram_focus).

5. Speaker notes
   - Add concise speakerNotes to every slide. 2–4 sentences explaining what the presenter should say to expand on the visible content. Audience-appropriate.

6. Anti-patterns to AVOID:
   ✗ Long paragraph blocks ("製造ラインの稼働率は今四半期において…")
   ✗ Bulleted lists of single-word items (use a Table or shape diagram instead)
   ✗ Repeating the slide title in the body
   ✗ Numbers without units, units without numbers
   ✗ "図1" / "Figure 1" style captions — let the layout speak

GOOD example (KPI slide body block):
  { type: "metric", label: "稼働率", value: 92, unit: "%", delta: { value: 2.1, direction: "up", unit: "pt" } }
BAD example (same intent):
  { type: "paragraph", text: "稼働率は92%で、前期比+2.1ポイントの改善となりました。" }

Apply these rules silently — do not mention them in the output content.`;

  const rawSlideSpecs = await Promise.all(
    slideIds.map((slideId) =>
      generateAndValidate<SlideSpec>({
        step: `slideSpec[${slideId}]`,
        system: `${getSlideSpecGenerationPrompt({ brief, deckPlan, slideId })}${slideSpecExtraGuidance}`,
        userMessage: `Brief:\n${JSON.stringify(brief, null, 2)}\n\nDeckPlan:\n${JSON.stringify(deckPlan, null, 2)}\n\nGenerate the SlideSpec for slideId="${slideId}".`,
        tool: SLIDE_SPEC_TOOL,
        validate: (v) => validateSlideSpec(v),
      }),
    ),
  );
  const slideSpecs = rawSlideSpecs;
  log('slideSpecs', 'done', { count: slideSpecs.length });

  // Step 4: AssetSpecs (optional — skip if no visual needs)
  let assetSpecs: AssetSpec[] = [];
  const hasVisualNeeds = deckPlan.sections?.some((s) =>
    s.slides?.some((sl) => sl.assetRequirements && sl.assetRequirements.length > 0),
  );
  if (hasVisualNeeds) {
    log('assetSpecs', 'invoking tool_use...');
    const result = await invokeBedrockToolUse<{ assetSpecs: AssetSpec[] }>({
      system: ASSET_SPECS_SYSTEM,
      userMessage: `User request: ${userRequest}\n\nPresentationBrief:\n${JSON.stringify(brief, null, 2)}\n\nSlideSpecs:\n${JSON.stringify(slideSpecs, null, 2)}`,
      tool: ASSET_SPECS_TOOL,
    });
    assetSpecs = result.assetSpecs ?? [];
    log('assetSpecs', 'done', { count: assetSpecs.length });
  } else {
    log('assetSpecs', 'skipped (no asset requirements in deckPlan)');
  }

  const intent = buildStructuredIntent({
    brief,
    deckPlan,
    slideSpecs,
    assetSpecs,
    userRequest,
    language,
  });

  return { brief, deckPlan, slideSpecs, assetSpecs, intent };
}

/**
 * Assemble a StructuredIntent from already-generated artifacts. Used both
 * by the initial pipeline and by the vision-revision loop after slideSpecs
 * have been rewritten by the reviewer.
 */
export function buildStructuredIntent(input: {
  brief: PresentationBrief;
  deckPlan: DeckPlan;
  slideSpecs: SlideSpec[];
  assetSpecs: AssetSpec[];
  userRequest: string;
  language: 'ja' | 'en';
}): StructuredIntent {
  const { brief, deckPlan, slideSpecs, assetSpecs, userRequest, language } = input;
  return {
    mode: 'create',
    confidence: 0.95,
    goal: brief.goal?.mainMessage ?? userRequest,
    audience: brief.audience?.primary,
    slideCount: deckPlan.slideCountTarget,
    grounding: {
      language: brief.output?.language ?? language,
      requestedSlideCount: brief.constraints?.slideCount ?? deckPlan.slideCountTarget,
    },
    createArtifacts: {
      brief,
      deckPlan,
      slideSpecs,
      assetSpecs,
    },
  };
}

/**
 * Build an IntentParser that returns a pre-computed StructuredIntent
 * instead of calling Bedrock. Used to plug pre-pipeline-run results into
 * the DeckForgeRunner and to re-run after vision-revision without redoing
 * brief/deckPlan/slideSpec generation.
 */
export function createStaticIntentParser(intent: StructuredIntent): IntentParser {
  return {
    async parseCreate(): Promise<StructuredIntent> {
      return intent;
    },
    async parseModify(): Promise<StructuredIntent> {
      throw new Error(
        'createStaticIntentParser does not support parseModify. Use createBedrockIntentParser instead.',
      );
    },
  };
}

export function createBedrockIntentParser(): IntentParser {
  return {
    async parseCreate({ userRequest }): Promise<StructuredIntent> {
      const result = await runCreatePipeline(userRequest);
      return result.intent;
    },

    async parseModify({ userRequest, inspectSummary }): Promise<StructuredIntent> {
      const message = inspectSummary
        ? `Request: ${userRequest}\n\nCurrent presentation:\n${JSON.stringify(inspectSummary, null, 2)}`
        : userRequest;

      const response = await invokeBedrockText({
        system: MODIFY_SYSTEM,
        userMessage: message,
      });

      const intent = extractJson<StructuredIntent>(response);

      return {
        ...intent,
        mode: 'modify',
      };
    },
  };
}
