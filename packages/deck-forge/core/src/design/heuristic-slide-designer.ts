import type { RichText, SlideIR, TextElementIR } from "#src/index.js";
import type { PresentationOperation, UpdateTextOperation } from "#src/operations/types.js";

import type {
  DesignFocus,
  SlideDesigner,
  SlideDesignerInput,
  SlideDesignerOutput,
} from "#src/design/types.js";

/**
 * Reference deterministic implementation of `SlideDesigner`.
 *
 * Applies a small set of heuristics to refine slide typography and emphasis
 * without an LLM. Safe to use as a baseline pass and as the inner loop of an
 * LLM-driven designer (the LLM can post-process or override).
 */
export class HeuristicSlideDesigner implements SlideDesigner {
  public readonly name = "heuristic";

  public async designSlide(input: SlideDesignerInput): Promise<SlideDesignerOutput> {
    const { slide, theme, options } = input;
    const focus = new Set<DesignFocus>(options?.focus ?? ["typography", "hierarchy"]);
    const operations: PresentationOperation[] = [];
    const rationaleParts: string[] = [];

    // -----------------------------------------------------------------------
    // 1. Title typography: short titles (<= 48 chars on one logical line) get
    //    a 1.15x font-size bump (relative to the *theme baseline*, not the
    //    current size, so re-running the designer is idempotent). Long titles
    //    (> 80 chars) get shrunk to 0.85x of the baseline.
    // -----------------------------------------------------------------------
    if (focus.has("typography")) {
      const title = findElement(slide, "title");
      if (title) {
        const plain = richTextToPlain(title.text);
        const baseline = theme.typography.fontSize.title;
        const currentSize = title.style.fontSize ?? baseline;
        if (plain.length > 0 && plain.length <= 48) {
          const target = Math.round(baseline * 1.15);
          if (currentSize !== target) {
            operations.push(makeStyleOnlyUpdate(slide.id, title, { fontSize: target }));
            rationaleParts.push(
              `Set short title (${plain.length} chars) to ${target} (1.15× baseline ${baseline}).`,
            );
          }
        } else if (plain.length > 80) {
          const target = Math.max(20, Math.round(baseline * 0.85));
          if (currentSize !== target) {
            operations.push(makeStyleOnlyUpdate(slide.id, title, { fontSize: target }));
            rationaleParts.push(
              `Set long title (${plain.length} chars) to ${target} (0.85× baseline ${baseline}).`,
            );
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 2. Callout density: if a callout has > 180 plain chars, shrink its
    //    fontSize to 0.85x of the *theme baseline* (idempotent), with a
    //    floor of 14.
    // -----------------------------------------------------------------------
    if (focus.has("typography")) {
      const callouts = slide.elements.filter(
        (el): el is TextElementIR => el.type === "text" && el.role === "callout",
      );
      const baseline = theme.typography.fontSize.body;
      for (const callout of callouts) {
        const plain = richTextToPlain(callout.text);
        if (plain.length > 180) {
          const target = Math.max(14, Math.round(baseline * 0.85));
          const currentSize = callout.style.fontSize ?? baseline;
          if (currentSize !== target) {
            operations.push(makeStyleOnlyUpdate(slide.id, callout, { fontSize: target }));
            rationaleParts.push(
              `Set dense callout (${plain.length} chars) to ${target} (0.85× baseline ${baseline}).`,
            );
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // 3. Bullet emphasis: paragraphs whose first run carries metadata like
    //    `bold: true` get an accent color from the theme so that high-
    //    importance bullets actually look distinct.
    // -----------------------------------------------------------------------
    if (focus.has("hierarchy")) {
      const bodies = slide.elements.filter(
        (el): el is TextElementIR =>
          el.type === "text" && (el.role === "body" || el.role === "callout"),
      );
      const accent = theme.colors.accent ?? theme.colors.primary;
      for (const body of bodies) {
        const next = applyBulletEmphasis(body.text, accent);
        if (next.changed) {
          operations.push({
            type: "update_text",
            slideId: slide.id,
            elementId: body.id,
            text: next.text,
          });
          rationaleParts.push(
            `Emphasized ${next.changed} high-importance bullet${next.changed > 1 ? "s" : ""} in element ${body.id}.`,
          );
        }
      }
    }

    return {
      operations,
      rationale: rationaleParts.length > 0 ? rationaleParts.join(" ") : undefined,
    };
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function findElement(slide: SlideIR, role: TextElementIR["role"]): TextElementIR | undefined {
  return slide.elements.find((el): el is TextElementIR => el.type === "text" && el.role === role);
}

function richTextToPlain(rich: RichText): string {
  return rich.paragraphs.map((p) => p.runs.map((r) => r.text).join("")).join("\n");
}

function makeStyleOnlyUpdate(
  slideId: string,
  element: TextElementIR,
  styleDelta: Partial<TextElementIR["style"]>,
): UpdateTextOperation {
  return {
    type: "update_text",
    slideId,
    elementId: element.id,
    text: element.text,
    style: styleDelta,
  };
}

/**
 * Walk a RichText tree and apply an accent color + bold to runs whose style
 * already carries `bold: true` (i.e. the upstream block declared the bullet
 * as emphasized). Returns the rebuilt text and the number of runs touched.
 */
function applyBulletEmphasis(
  rich: RichText,
  accentColor: string,
): { text: RichText; changed: number } {
  let changed = 0;
  const paragraphs = rich.paragraphs.map((paragraph) => ({
    ...paragraph,
    runs: paragraph.runs.map((run) => {
      const isEmphasized = run.style?.bold === true;
      if (!isEmphasized) {
        return run;
      }
      const alreadyAccented = run.style?.color === accentColor;
      if (alreadyAccented) {
        return run;
      }
      changed += 1;
      return {
        ...run,
        style: {
          ...(run.style ?? {}),
          color: accentColor,
        },
      };
    }),
  }));
  return { text: { paragraphs }, changed };
}
