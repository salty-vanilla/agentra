import {
  gapForDensity,
  pickGridDimensions,
  splitGrid,
  splitHorizontal,
} from "#src/builders/layouts/grid-utils.js";
import type { LayoutContext } from "#src/builders/layouts/types.js";
import type { ContentBlock, LayoutSpec, ResolvedFrame } from "#src/index.js";

// ---------------------------------------------------------------------------
// Content signal detectors
// ---------------------------------------------------------------------------

/** Count blocks of a given type. */
export function countByType(
  blocks: readonly ContentBlock[],
  type: ContentBlock["type"],
): number {
  return blocks.filter((b) => b.type === type).length;
}

export function hasCallout(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === "callout");
}

export function hasTable(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === "table");
}

export function hasChart(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === "chart");
}

export function hasDiagram(blocks: readonly ContentBlock[]): boolean {
  return blocks.some((b) => b.type === "diagram");
}

/** Returns true when the slide contains table, chart, or diagram blocks. */
export function hasComplexVisuals(blocks: readonly ContentBlock[]): boolean {
  return blocks.some(
    (b) => b.type === "table" || b.type === "chart" || b.type === "diagram",
  );
}

// ---------------------------------------------------------------------------
// Intent detectors
// ---------------------------------------------------------------------------

export function isSummaryIntent(ctx: LayoutContext): boolean {
  const t = ctx.slideSpec.intent?.type;
  return t === "summary" || t === "closing" || t === "proposal";
}

export function isDecisionIntent(ctx: LayoutContext): boolean {
  return ctx.slideSpec.intent?.type === "decision";
}

export function isArchitectureIntent(ctx: LayoutContext): boolean {
  return ctx.slideSpec.intent?.type === "architecture";
}

export function isProcessIntent(ctx: LayoutContext): boolean {
  return ctx.slideSpec.intent?.type === "process";
}

const PROCESS_KEYWORDS =
  /(?:\b(?:workflow|process|procedure|pipeline|step[\s-]*by[\s-]*step)\b|標準フロー|フロー|工程|手順|ステップ|プロセス|(?:→.*){2,})/i;

/** Detect process-like content via keywords even if intent.type is not "process". */
export function hasProcessSignals(ctx: LayoutContext): boolean {
  return PROCESS_KEYWORDS.test(collectSearchText(ctx));
}

export function isTimelineIntent(ctx: LayoutContext): boolean {
  return ctx.slideSpec.intent?.type === "timeline";
}

export function isDataInsightIntent(ctx: LayoutContext): boolean {
  return ctx.slideSpec.intent?.type === "data_insight";
}

// ---------------------------------------------------------------------------
// Keyword signal detectors
// ---------------------------------------------------------------------------

/** Collect searchable text from slide title, intent keyMessage, and block text. */
function collectSearchText(ctx: LayoutContext): string {
  const parts: string[] = [];
  if (ctx.slideSpec.title) parts.push(ctx.slideSpec.title);
  if (ctx.slideSpec.intent?.keyMessage) parts.push(ctx.slideSpec.intent.keyMessage);
  if (ctx.slideSpec.intent?.audienceTakeaway)
    parts.push(ctx.slideSpec.intent.audienceTakeaway);
  for (const block of ctx.blocks) {
    if (block.type === "paragraph") parts.push(block.text);
    if (block.type === "callout") parts.push(block.text);
  }
  return parts.join(" ").toLowerCase();
}

const DECISION_KEYWORDS =
  /(?:\b(?:approval|decision|decide|approve|judgment|ask|request|go[\s/]no[\s-]go)\b|承認|判断|依頼|決定|決裁|審議|意思決定|本会議|お願いします|承認事項|施策承認)/i;

export function hasDecisionSignals(ctx: LayoutContext): boolean {
  return DECISION_KEYWORDS.test(collectSearchText(ctx));
}

const ACTION_PLAN_KEYWORDS =
  /(?:\b(?:action\s*(?:plan|item)|owner|assignee|due\s*date|deadline|status|follow[\s-]*up)\b|担当|期限|実施|アクション|対応状況)/i;

export function hasActionPlanSignals(ctx: LayoutContext): boolean {
  return ACTION_PLAN_KEYWORDS.test(collectSearchText(ctx));
}

const ROADMAP_KEYWORDS =
  /(?:\b(?:phase|milestone|quarter|roadmap|rollout|implementation\s*plan)\b|ロードマップ|フェーズ|マイルストーン|四半期)/i;

export function hasRoadmapSignals(ctx: LayoutContext): boolean {
  return ROADMAP_KEYWORDS.test(collectSearchText(ctx));
}

const ARCHITECTURE_KEYWORDS =
  /(?:\b(?:architecture|layer|infra(?:structure)?|pipeline|microservice|backend|frontend|system\s*design)\b|アーキテクチャ|レイヤ|基盤)/i;

export function hasArchitectureSignals(ctx: LayoutContext): boolean {
  return ARCHITECTURE_KEYWORDS.test(collectSearchText(ctx));
}

const RECOMMENDATION_KEYWORDS =
  /(?:\b(?:recommend(?:ation|ed)?|suggested|preferred|our\s*pick)\b|推奨|採用案|おすすめ)/i;

export function hasRecommendationSignals(ctx: LayoutContext): boolean {
  return RECOMMENDATION_KEYWORDS.test(collectSearchText(ctx));
}

const TREND_KEYWORDS =
  /(?:\b(?:trend|monthly|quarterly|year[\s-]*over[\s-]*year|yoy|mom|growth|decline)\b|推移|月次|四半期|前年比|トレンド)/i;

export function hasTrendSignals(ctx: LayoutContext): boolean {
  return TREND_KEYWORDS.test(collectSearchText(ctx));
}

// ---------------------------------------------------------------------------
// Bullet helpers
// ---------------------------------------------------------------------------

/** Total number of bullet items across all bullet_list blocks. */
export function countBulletItems(blocks: readonly ContentBlock[]): number {
  let count = 0;
  for (const b of blocks) {
    if (b.type === "bullet_list") {
      count += b.items.length;
    }
  }
  return count;
}

/** True when there is a single bullet_list block with exactly `n` items. */
export function hasShortBulletGroup(
  blocks: readonly ContentBlock[],
  n: number,
): boolean {
  const bulletLists = blocks.filter((b) => b.type === "bullet_list");
  return bulletLists.length === 1 && bulletLists[0]!.items.length === n;
}

// ---------------------------------------------------------------------------
// Reusable layout helpers
// ---------------------------------------------------------------------------

/** Merge body + visual region frames into one unified frame. */
export function mergeBodyVisualRegion(ctx: LayoutContext): ResolvedFrame {
  const body = ctx.regionFrames.body;
  const visual = ctx.regionFrames.visual;
  const left = Math.min(body.x, visual.x);
  const right = Math.max(body.x + body.width, visual.x + visual.width);
  const top = Math.min(body.y, visual.y);
  const bottom = Math.max(body.y + body.height, visual.y + visual.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Merge body + visual + callout region frames into one unified frame. */
export function mergeAllRegions(ctx: LayoutContext): ResolvedFrame {
  const body = ctx.regionFrames.body;
  const visual = ctx.regionFrames.visual;
  const callout = ctx.regionFrames.callout;
  const left = Math.min(body.x, visual.x);
  const right = Math.max(body.x + body.width, visual.x + visual.width);
  const top = Math.min(body.y, visual.y);
  const bottom = Math.max(body.y + body.height, callout.y + callout.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Split a region into top and bottom sub-regions. */
export function splitTopBottom(
  region: ResolvedFrame,
  topRatio: number,
  gap = 16,
): { top: ResolvedFrame; bottom: ResolvedFrame } {
  const topHeight = Math.round(region.height * topRatio);
  return {
    top: { x: region.x, y: region.y, width: region.width, height: topHeight },
    bottom: {
      x: region.x,
      y: region.y + topHeight + gap,
      width: region.width,
      height: region.height - topHeight - gap,
    },
  };
}

/** Split a region into main (left) and sidebar (right) sub-regions. */
export function splitMainSidebar(
  region: ResolvedFrame,
  mainRatio: number,
  gap = 16,
): { main: ResolvedFrame; sidebar: ResolvedFrame } {
  const mainWidth = Math.round(region.width * mainRatio);
  return {
    main: { x: region.x, y: region.y, width: mainWidth, height: region.height },
    sidebar: {
      x: region.x + mainWidth + gap,
      y: region.y,
      width: region.width - mainWidth - gap,
      height: region.height,
    },
  };
}

/**
 * Split a region into a main area and a bottom insight band.
 * Returns the main area and the band.
 */
export function createInsightBand(
  region: ResolvedFrame,
  bandHeight = 80,
  gap = 16,
): { main: ResolvedFrame; band: ResolvedFrame } {
  const mainHeight = region.height - bandHeight - gap;
  return {
    main: {
      x: region.x,
      y: region.y,
      width: region.width,
      height: Math.max(60, mainHeight),
    },
    band: {
      x: region.x,
      y: region.y + Math.max(60, mainHeight) + gap,
      width: region.width,
      height: bandHeight,
    },
  };
}

/** Create a card grid using pickGridDimensions + splitGrid. */
export function createCardGrid(
  region: ResolvedFrame,
  count: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  const { cols, rows } = pickGridDimensions(count);
  return splitGrid(region, cols, rows, density);
}

/** Create horizontal cards using splitHorizontal. */
export function createHorizontalCards(
  region: ResolvedFrame,
  count: number,
  density?: LayoutSpec["density"],
): ResolvedFrame[] {
  return splitHorizontal(region, count, density);
}
