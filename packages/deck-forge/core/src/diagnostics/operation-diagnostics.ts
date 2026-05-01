import type { PresentationIR } from "#src/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

  const operationsByType: Record<string, number> = {};
  const operationsBySlideId: Record<string, number> = {};

  for (const entry of operationLog) {
    const op = entry.operation as Record<string, unknown> | null | undefined;
    const type = String(op?.type ?? "unknown");

    operationsByType[type] = (operationsByType[type] ?? 0) + 1;

    const slideId = op?.slideId;
    if (typeof slideId === "string") {
      operationsBySlideId[slideId] = (operationsBySlideId[slideId] ?? 0) + 1;
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
  }

  return {
    totalOperations: operationLog.length,
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
  };
}
