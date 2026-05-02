import type { PresentationIR } from "#src/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationRepairCategory =
  | "layout_frame"
  | "layout_position"
  | "layout_size"
  | "visual_font"
  | "visual_style"
  | "content_text"
  | "content_delete"
  | "content_add"
  | "unknown";

export type OperationDiagnosticsSummary = {
  totalOperations: number;

  frameUpdateOperations: number;
  positionUpdateOperations: number;
  sizeUpdateOperations: number;
  fontUpdateOperations: number;
  styleUpdateOperations: number;
  textUpdateOperations: number;

  operationsByType: Record<string, number>;
  operationsBySlideId: Record<string, number>;

  likelyLayoutRepairOperations: number;
  likelyVisualPolishOperations: number;

  operationsByRepairCategory: Record<OperationRepairCategory, number>;

  layoutRepairRatio: number;
  visualPolishRatio: number;
  contentRewriteRatio: number;

  topSlidesByOperations: Array<{
    slideId: string;
    operationCount: number;
  }>;

  topOperationTypes: Array<{
    type: string;
    count: number;
  }>;

  operationsWithoutSlideId: number;
};

// ---------------------------------------------------------------------------
// Regex classifiers
// ---------------------------------------------------------------------------

const LAYOUT_REPAIR_RE = /frame|position|move|resize|bounds|layout/i;
const VISUAL_POLISH_RE = /font|color|style|decoration|fill|border/i;
const TEXT_UPDATE_RE = /text|content|copy/i;

const FRAME_RE = /frame/i;
const POSITION_RE = /position|move/i;
const SIZE_RE = /size|resize/i;
const FONT_RE = /font/i;
const STYLE_RE = /style|color|decoration|fill|border/i;

// Repair category classifiers
const DELETE_RE = /delete|remove/i;
const ADD_RE = /add|create|insert/i;

// ---------------------------------------------------------------------------
// Repair category classification
// ---------------------------------------------------------------------------

function classifyRepairCategory(type: string): OperationRepairCategory {
  // Order matters: more specific patterns first, broader ones last.
  // "delete/remove" before "position/move" (remove_slide contains "move")
  // "font" before "size" (fontSize contains "size")
  // "style/color" before "add/create" (add_border should be visual_style)
  if (DELETE_RE.test(type)) return "content_delete";
  if (FONT_RE.test(type)) return "visual_font";
  if (FRAME_RE.test(type)) return "layout_frame";
  if (POSITION_RE.test(type)) return "layout_position";
  if (SIZE_RE.test(type)) return "layout_size";
  if (STYLE_RE.test(type)) return "visual_style";
  if (ADD_RE.test(type)) return "content_add";
  if (TEXT_UPDATE_RE.test(type)) return "content_text";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Analyze
// ---------------------------------------------------------------------------

export function analyzeOperationLog(
  operationLog: PresentationIR["operationLog"],
): OperationDiagnosticsSummary {
  let frameUpdateOperations = 0;
  let positionUpdateOperations = 0;
  let sizeUpdateOperations = 0;
  let fontUpdateOperations = 0;
  let styleUpdateOperations = 0;
  let textUpdateOperations = 0;

  let likelyLayoutRepairOperations = 0;
  let likelyVisualPolishOperations = 0;

  let operationsWithoutSlideId = 0;
  const operationsByType: Record<string, number> = {};
  const operationsBySlideId: Record<string, number> = {};
  const operationsByRepairCategory: Record<OperationRepairCategory, number> = {
    layout_frame: 0,
    layout_position: 0,
    layout_size: 0,
    visual_font: 0,
    visual_style: 0,
    content_text: 0,
    content_delete: 0,
    content_add: 0,
    unknown: 0,
  };

  for (const entry of operationLog) {
    const op = entry.operation as Record<string, unknown> | null | undefined;
    const type = String(op?.type ?? "unknown");

    operationsByType[type] = (operationsByType[type] ?? 0) + 1;

    const slideId = op?.slideId;
    if (typeof slideId === "string") {
      operationsBySlideId[slideId] = (operationsBySlideId[slideId] ?? 0) + 1;
    } else {
      operationsWithoutSlideId++;
    }

    // Fine-grained counters
    if (FRAME_RE.test(type)) frameUpdateOperations++;
    if (POSITION_RE.test(type)) positionUpdateOperations++;
    if (SIZE_RE.test(type)) sizeUpdateOperations++;
    if (FONT_RE.test(type)) fontUpdateOperations++;
    if (STYLE_RE.test(type)) styleUpdateOperations++;
    if (TEXT_UPDATE_RE.test(type)) textUpdateOperations++;

    // Broad classifiers
    if (LAYOUT_REPAIR_RE.test(type)) likelyLayoutRepairOperations++;
    if (VISUAL_POLISH_RE.test(type)) likelyVisualPolishOperations++;

    // Repair category
    const category = classifyRepairCategory(type);
    operationsByRepairCategory[category]++;
  }

  const total = operationLog.length;

  // Ratio calculations
  const layoutRepairCount =
    operationsByRepairCategory.layout_frame +
    operationsByRepairCategory.layout_position +
    operationsByRepairCategory.layout_size;
  const visualPolishCount =
    operationsByRepairCategory.visual_font +
    operationsByRepairCategory.visual_style;
  const contentRewriteCount =
    operationsByRepairCategory.content_text +
    operationsByRepairCategory.content_delete +
    operationsByRepairCategory.content_add;

  const layoutRepairRatio = total > 0 ? layoutRepairCount / total : 0;
  const visualPolishRatio = total > 0 ? visualPolishCount / total : 0;
  const contentRewriteRatio = total > 0 ? contentRewriteCount / total : 0;

  // Top slides by operations (descending)
  const topSlidesByOperations = Object.entries(operationsBySlideId)
    .map(([slideId, operationCount]) => ({ slideId, operationCount }))
    .sort((a, b) => b.operationCount - a.operationCount);

  // Top operation types (descending)
  const topOperationTypes = Object.entries(operationsByType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalOperations: total,
    frameUpdateOperations,
    positionUpdateOperations,
    sizeUpdateOperations,
    fontUpdateOperations,
    styleUpdateOperations,
    textUpdateOperations,
    operationsByType,
    operationsBySlideId,
    likelyLayoutRepairOperations,
    likelyVisualPolishOperations,
    operationsByRepairCategory,
    layoutRepairRatio,
    visualPolishRatio,
    contentRewriteRatio,
    topSlidesByOperations,
    topOperationTypes,
    operationsWithoutSlideId,
  };
}
