import type { AutoFixAction, PresentationIR, ValidationReport } from "#src/index.js";

const MIN_FONT_SIZE = 12;
const PREFERRED_FONT_SIZE = 14;

/**
 * Attempts to auto-fix issues flagged as `autoFixable` in the ValidationReport.
 * Returns a new (cloned) PresentationIR with fixes applied.
 * The original presentation is not mutated.
 */
export function autoFixPresentation(
  presentation: PresentationIR,
  report: ValidationReport,
): PresentationIR {
  const fixable = report.issues.filter((issue) => issue.autoFixable && issue.suggestedFix);

  if (fixable.length === 0) {
    return presentation;
  }

  const next: PresentationIR = structuredClone(presentation);

  for (const issue of fixable) {
    if (!issue.suggestedFix) continue;

    applyFix(next, issue.suggestedFix);
  }

  return next;
}

function applyFix(presentation: PresentationIR, action: AutoFixAction): void {
  switch (action.type) {
    case "reduce_font_size":
      applyReduceFontSize(presentation, action);
      break;
    case "move_element":
      applyMoveElement(presentation, action);
      break;
    case "resize_element":
      applyResizeElement(presentation, action);
      break;
    case "shorten_text":
      applyShortenText(presentation, action);
      break;
    case "apply_theme_token":
      applyThemeToken(presentation, action);
      break;
    case "crop_image":
    case "split_slide":
      // These require user intent — skip silently
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Fix handlers
// ---------------------------------------------------------------------------

function applyReduceFontSize(presentation: PresentationIR, action: AutoFixAction): void {
  const element = findElementById(presentation, action.target);
  if (!element || element.type !== "text") return;

  const targetSize =
    typeof action.params.fontSize === "number" ? action.params.fontSize : PREFERRED_FONT_SIZE;

  element.style = { ...element.style, fontSize: targetSize };
}

function applyMoveElement(presentation: PresentationIR, action: AutoFixAction): void {
  const element = findElementById(presentation, action.target);
  if (!element) return;

  const { x, y } = action.params as { x?: number; y?: number };
  if (typeof x === "number") element.frame.x = x;
  if (typeof y === "number") element.frame.y = y;
}

function applyResizeElement(presentation: PresentationIR, action: AutoFixAction): void {
  const element = findElementById(presentation, action.target);
  if (!element) return;

  const { width, height } = action.params as { width?: number; height?: number };
  if (typeof width === "number") element.frame.width = width;
  if (typeof height === "number") element.frame.height = height;
}

function applyShortenText(presentation: PresentationIR, action: AutoFixAction): void {
  const element = findElementById(presentation, action.target);
  if (!element || element.type !== "text") return;

  const maxChars = typeof action.params.maxChars === "number" ? action.params.maxChars : 200;

  for (const para of element.text.paragraphs) {
    for (const run of para.runs) {
      if (run.text.length > maxChars) {
        run.text = `${run.text.slice(0, maxChars - 1)}…`;
      }
    }
  }
}

function applyThemeToken(presentation: PresentationIR, action: AutoFixAction): void {
  const element = findElementById(presentation, action.target);
  if (!element || element.type !== "text") return;

  const token = action.params.token as string | undefined;
  const colors = presentation.theme.colors;

  const tokenMap: Record<string, string | undefined> = {
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
  };

  const resolved = token ? tokenMap[token] : colors.textPrimary;
  if (resolved) {
    element.style = { ...element.style, color: resolved };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findElementById(
  presentation: PresentationIR,
  target: string,
): PresentationIR["slides"][number]["elements"][number] | undefined {
  // target may be "element/<id>" or just "<id>"
  const elementId = target.startsWith("element/") ? target.slice("element/".length) : target;
  for (const slide of presentation.slides) {
    const el = slide.elements.find((e) => e.id === elementId);
    if (el) return el;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Suggest fixes for known issue patterns (used by validators)
// ---------------------------------------------------------------------------

/**
 * Generates a suggestedFix for a font-size-too-small issue.
 */
export function suggestReduceFontSize(elementId: string, targetSize?: number): AutoFixAction {
  return {
    type: "reduce_font_size",
    target: `element/${elementId}`,
    params: { fontSize: targetSize ?? PREFERRED_FONT_SIZE },
  };
}

/**
 * Generates a suggestedFix for an element that is out of bounds.
 */
export function suggestMoveInBounds(elementId: string, x: number, y: number): AutoFixAction {
  return {
    type: "move_element",
    target: `element/${elementId}`,
    params: { x, y },
  };
}

/**
 * Generates a suggestedFix to apply a theme color token to a text element.
 */
export function suggestApplyThemeToken(elementId: string, token: string): AutoFixAction {
  return {
    type: "apply_theme_token",
    target: `element/${elementId}`,
    params: { token },
  };
}

export { MIN_FONT_SIZE };
