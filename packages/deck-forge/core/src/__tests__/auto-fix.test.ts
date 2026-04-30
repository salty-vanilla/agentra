import { describe, expect, it } from "vitest";
import type { AutoFixAction, ValidationIssue, ValidationReport } from "#src/index.js";
import {
  autoFixPresentation,
  suggestApplyThemeToken,
  suggestMoveInBounds,
  suggestReduceFontSize,
} from "#src/validation/autofix/auto-fix-presentation.js";
import { presentationFixture } from "./fixtures/presentation.fixture.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(issues: ValidationIssue[]): ValidationReport {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const infoCount = issues.filter((i) => i.severity === "info").length;
  return {
    status: errorCount > 0 ? "failed" : warningCount > 0 ? "warning" : "passed",
    issues,
    summary: { errorCount, warningCount, infoCount },
  };
}

function makeIssue(
  id: string,
  autoFixable: boolean,
  suggestedFix?: AutoFixAction,
): ValidationIssue {
  return {
    id,
    severity: "warning",
    category: "style",
    message: "test issue",
    autoFixable,
    suggestedFix,
  };
}

// ---------------------------------------------------------------------------
// suggestReduceFontSize
// ---------------------------------------------------------------------------

describe("suggestReduceFontSize", () => {
  it("returns a reduce_font_size action targeting element/<id>", () => {
    const action = suggestReduceFontSize("el-title");
    expect(action.type).toBe("reduce_font_size");
    expect(action.target).toBe("element/el-title");
    expect(typeof action.params.fontSize).toBe("number");
  });

  it("uses the provided targetSize", () => {
    const action = suggestReduceFontSize("el-title", 10);
    expect(action.params.fontSize).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// suggestMoveInBounds
// ---------------------------------------------------------------------------

describe("suggestMoveInBounds", () => {
  it("returns a move_element action with x/y params", () => {
    const action = suggestMoveInBounds("el-body", 100, 200);
    expect(action.type).toBe("move_element");
    expect(action.target).toBe("element/el-body");
    expect(action.params).toMatchObject({ x: 100, y: 200 });
  });
});

// ---------------------------------------------------------------------------
// suggestApplyThemeToken
// ---------------------------------------------------------------------------

describe("suggestApplyThemeToken", () => {
  it("returns an apply_theme_token action with the token param", () => {
    const action = suggestApplyThemeToken("el-body", "textPrimary");
    expect(action.type).toBe("apply_theme_token");
    expect(action.target).toBe("element/el-body");
    expect(action.params.token).toBe("textPrimary");
  });
});

// ---------------------------------------------------------------------------
// autoFixPresentation — no fixable issues
// ---------------------------------------------------------------------------

describe("autoFixPresentation", () => {
  it("returns the same object when no fixable issues exist", () => {
    const report = makeReport([makeIssue("vi-1", false)]);
    const result = autoFixPresentation(presentationFixture, report);
    expect(result).toBe(presentationFixture);
  });

  it("returns the same object when there are no issues at all", () => {
    const report = makeReport([]);
    const result = autoFixPresentation(presentationFixture, report);
    expect(result).toBe(presentationFixture);
  });

  // ---------------------------------------------------------------------------
  // reduce_font_size fix
  // ---------------------------------------------------------------------------

  it("reduces font size on a text element when reduce_font_size fix is present", () => {
    const fix = suggestReduceFontSize("el-body", 14);
    const report = makeReport([makeIssue("vi-1", true, fix)]);

    const result = autoFixPresentation(presentationFixture, report);
    const el = result.slides[1].elements.find((e) => e.id === "el-body");
    expect(el?.type).toBe("text");
    expect((el as Extract<typeof el, { type: "text" }>)?.style?.fontSize).toBe(14);
  });

  it("does not mutate the original presentation", () => {
    const originalFontSize = (
      presentationFixture.slides[1].elements.find((e) => e.id === "el-body") as {
        style?: { fontSize?: number };
      }
    )?.style?.fontSize;

    const fix = suggestReduceFontSize("el-body", 10);
    const report = makeReport([makeIssue("vi-1", true, fix)]);

    autoFixPresentation(presentationFixture, report);

    const el = presentationFixture.slides[1].elements.find((e) => e.id === "el-body") as {
      style?: { fontSize?: number };
    };
    expect(el?.style?.fontSize).toBe(originalFontSize);
  });

  // ---------------------------------------------------------------------------
  // move_element fix
  // ---------------------------------------------------------------------------

  it("moves an element when move_element fix is present", () => {
    const origX =
      presentationFixture.slides[1].elements.find((e) => e.id === "el-body")?.frame.x ?? 0;
    const newX = origX + 500;
    const newY = 300;
    const fix = suggestMoveInBounds("el-body", newX, newY);
    const report = makeReport([makeIssue("vi-1", true, fix)]);

    const result = autoFixPresentation(presentationFixture, report);
    const el = result.slides[1].elements.find((e) => e.id === "el-body");
    expect(el?.frame.x).toBe(newX);
    expect(el?.frame.y).toBe(newY);
  });

  // ---------------------------------------------------------------------------
  // apply_theme_token fix
  // ---------------------------------------------------------------------------

  it("applies a theme token color when apply_theme_token fix is present", () => {
    const fix = suggestApplyThemeToken("el-body", "textPrimary");
    const report = makeReport([makeIssue("vi-1", true, fix)]);

    const result = autoFixPresentation(presentationFixture, report);
    const el = result.slides[1].elements.find((e) => e.id === "el-body");
    expect(el?.type).toBe("text");
    // Should use theme.colors.textPrimary
    expect((el as Extract<typeof el, { type: "text" }>)?.style?.color).toBe(
      presentationFixture.theme.colors.textPrimary,
    );
  });

  // ---------------------------------------------------------------------------
  // unknown element id — gracefully skips
  // ---------------------------------------------------------------------------

  it("skips fix gracefully when target element does not exist", () => {
    const fix: AutoFixAction = {
      type: "reduce_font_size",
      target: "element/nonexistent-id",
      params: { fontSize: 14 },
    };
    const report = makeReport([makeIssue("vi-1", true, fix)]);

    // Should not throw
    expect(() => autoFixPresentation(presentationFixture, report)).not.toThrow();
  });
});
