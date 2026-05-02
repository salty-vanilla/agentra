import { describe, expect, it } from "vitest";
import { validatePresentation } from "#src/validation/validate-presentation.js";
import type { PresentationIR, TextElementIR, TableElementIR, RichText, SlideIntent } from "#src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePresentation(
  elements: Array<TextElementIR | TableElementIR>,
): PresentationIR {
  return {
    id: "deck-test",
    version: "1.0.0",
    meta: {
      title: "Test",
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      author: "test",
    },
    theme: {
      id: "theme-test",
      name: "Test",
      colors: {
        background: "#FFFFFF",
        surface: "#F8FAFC",
        textPrimary: "#0F172A",
        textSecondary: "#475569",
        primary: "#1D4ED8",
        secondary: "#0EA5E9",
        accent: "#14B8A6",
        chartPalette: ["#1D4ED8"],
      },
      typography: {
        fontFamily: { heading: "Arial", body: "Arial", mono: "Courier" },
        fontSize: { title: 40, heading: 28, body: 18, caption: 14, footnote: 12 },
        lineHeight: { tight: 1.2, normal: 1.4, relaxed: 1.6 },
        weight: { regular: 400, medium: 500, bold: 700 },
      },
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
      radius: { none: 0, sm: 2, md: 4, lg: 8, full: 9999 },
      slideDefaults: {},
      elementDefaults: {},
    },
    slides: [
      {
        id: "slide-1",
        index: 0,
        title: "Test Slide",
        intent: {
          keyMessage: "Test",
          audienceTakeaway: "Test",
          intent: "summarize",
          contentKinds: ["summary"],
        } satisfies SlideIntent,
        layout: {
          spec: { type: "single_column", density: "medium" },
          slideSize: { width: 1280, height: 720, unit: "px" },
          regions: [],
        },
        elements,
      },
    ],
    assets: { assets: [] },
    operationLog: [],
  };
}

function makeTextElement(
  overrides: Partial<TextElementIR> & { id: string },
): TextElementIR {
  return {
    type: "text",
    role: "body",
    text: { paragraphs: [{ runs: [{ text: "Default text" }] }] },
    frame: { x: 80, y: 80, width: 1120, height: 200 },
    style: { fontSize: 18 },
    ...overrides,
  };
}

function makeTableElement(
  overrides: Partial<TableElementIR> & { id: string },
): TableElementIR {
  return {
    type: "table",
    frame: { x: 80, y: 80, width: 1120, height: 200 },
    headers: ["Col A", "Col B"],
    rows: [["1", "2"]],
    ...overrides,
  };
}

function makeRichText(text: string): RichText {
  return { paragraphs: [{ runs: [{ text }] }] };
}

function makeBulletRichText(items: string[]): RichText {
  return {
    paragraphs: items.map((text) => ({
      runs: [{ text }],
      bullet: { indentLevel: 0 },
    })),
  };
}

function findIssuesByPrefix(
  issues: Array<{ id: string }>,
  prefix: string,
): Array<{ id: string }> {
  return issues.filter((i) => i.id.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("content-density validation", () => {
  it("does not emit false positives for short normal text", async () => {
    const pres = makePresentation([
      makeTextElement({
        id: "el-ok",
        role: "body",
        text: makeRichText("Short text"),
        frame: { x: 80, y: 80, width: 1120, height: 200 },
        style: { fontSize: 18 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const densityIssues = report.issues.filter((i) =>
      i.id.startsWith("content/text-overflow-risk/") ||
      i.id.startsWith("content/title-too-long/") ||
      i.id.startsWith("content/bullet-list-too-dense/") ||
      i.id.startsWith("content/callout-too-dense/") ||
      i.id.startsWith("content/table-clipped/"),
    );
    expect(densityIssues).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // title-too-long
  // -------------------------------------------------------------------------

  it("detects long Japanese title", async () => {
    const longJaTitle = "あ".repeat(30); // 30 > 25
    const pres = makePresentation([
      makeTextElement({
        id: "el-ja-title",
        role: "title",
        text: makeRichText(longJaTitle),
        // Use a large frame so text-overflow-risk may or may not fire
        frame: { x: 80, y: 80, width: 1120, height: 300 },
        style: { fontSize: 40 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const titleIssues = findIssuesByPrefix(report.issues, "content/title-too-long/");
    expect(titleIssues.length).toBeGreaterThanOrEqual(1);
    expect(titleIssues[0]!.id).toBe("content/title-too-long/slide-1/el-ja-title");
  });

  it("detects long English title", async () => {
    const longEnTitle = "A".repeat(65); // 65 > 60
    const pres = makePresentation([
      makeTextElement({
        id: "el-en-title",
        role: "title",
        text: makeRichText(longEnTitle),
        frame: { x: 80, y: 80, width: 1120, height: 300 },
        style: { fontSize: 40 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const titleIssues = findIssuesByPrefix(report.issues, "content/title-too-long/");
    expect(titleIssues.length).toBeGreaterThanOrEqual(1);
    expect(titleIssues[0]!.id).toBe("content/title-too-long/slide-1/el-en-title");
  });

  // -------------------------------------------------------------------------
  // text-overflow-risk
  // -------------------------------------------------------------------------

  it("detects text overflow in small frame", async () => {
    // Very long text in a small frame
    const longText = "This is a moderately long paragraph. ".repeat(20);
    const pres = makePresentation([
      makeTextElement({
        id: "el-overflow",
        role: "body",
        text: makeRichText(longText),
        frame: { x: 80, y: 80, width: 400, height: 50 }, // very small frame
        style: { fontSize: 18 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const overflowIssues = findIssuesByPrefix(report.issues, "content/text-overflow-risk/");
    expect(overflowIssues.length).toBeGreaterThanOrEqual(1);
    expect(overflowIssues[0]!.id).toBe("content/text-overflow-risk/slide-1/el-overflow");
  });

  it("sets autoFixable with suggestedFix for text overflow", async () => {
    const longText = "This is a moderately long paragraph. ".repeat(20);
    const pres = makePresentation([
      makeTextElement({
        id: "el-fix",
        role: "body",
        text: makeRichText(longText),
        frame: { x: 80, y: 80, width: 400, height: 50 },
        style: { fontSize: 18 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const overflowIssue = report.issues.find(
      (i) => i.id === "content/text-overflow-risk/slide-1/el-fix",
    );
    expect(overflowIssue).toBeDefined();
    expect(overflowIssue!.autoFixable).toBe(true);
    expect(overflowIssue!.suggestedFix).toBeDefined();
    expect(overflowIssue!.suggestedFix!.type).toBe("reduce_font_size");
    expect(overflowIssue!.suggestedFix!.target).toBe("el-fix");
    expect(typeof overflowIssue!.suggestedFix!.params.fontSize).toBe("number");
  });

  it("may emit both title-too-long and text-overflow-risk for a long title in small frame", async () => {
    const longTitle = "A".repeat(80); // > 60 → title-too-long
    const pres = makePresentation([
      makeTextElement({
        id: "el-dual",
        role: "title",
        text: makeRichText(longTitle),
        frame: { x: 80, y: 80, width: 300, height: 40 }, // small → text-overflow-risk
        style: { fontSize: 36 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const titleIssues = findIssuesByPrefix(report.issues, "content/title-too-long/");
    const overflowIssues = findIssuesByPrefix(report.issues, "content/text-overflow-risk/");
    expect(titleIssues.length).toBeGreaterThanOrEqual(1);
    expect(overflowIssues.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // bullet-list-too-dense
  // -------------------------------------------------------------------------

  it("detects dense bullet list with >5 items", async () => {
    const items = Array.from({ length: 7 }, (_, i) => `Bullet item ${i + 1}`);
    const pres = makePresentation([
      makeTextElement({
        id: "el-bullets",
        role: "body",
        text: makeBulletRichText(items),
        frame: { x: 80, y: 80, width: 1120, height: 500 },
        style: { fontSize: 18 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const bulletIssues = findIssuesByPrefix(report.issues, "content/bullet-list-too-dense/");
    expect(bulletIssues.length).toBeGreaterThanOrEqual(1);
    expect(bulletIssues[0]!.id).toBe("content/bullet-list-too-dense/slide-1/el-bullets");
  });

  it("does not flag bullet list with ≤5 items", async () => {
    const items = Array.from({ length: 5 }, (_, i) => `Item ${i + 1}`);
    const pres = makePresentation([
      makeTextElement({
        id: "el-ok-bullets",
        role: "body",
        text: makeBulletRichText(items),
        frame: { x: 80, y: 80, width: 1120, height: 500 },
        style: { fontSize: 18 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const bulletIssues = findIssuesByPrefix(report.issues, "content/bullet-list-too-dense/");
    expect(bulletIssues).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // callout-too-dense
  // -------------------------------------------------------------------------

  it("detects dense callout (English)", async () => {
    const denseCallout = "A".repeat(95); // > 90
    const pres = makePresentation([
      makeTextElement({
        id: "el-callout",
        role: "callout",
        text: makeRichText(denseCallout),
        frame: { x: 80, y: 80, width: 1120, height: 500 },
        style: { fontSize: 18 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const calloutIssues = findIssuesByPrefix(report.issues, "content/callout-too-dense/");
    expect(calloutIssues.length).toBeGreaterThanOrEqual(1);
    expect(calloutIssues[0]!.id).toBe("content/callout-too-dense/slide-1/el-callout");
  });

  it("detects dense callout (Japanese)", async () => {
    const denseCallout = "あ".repeat(50); // > 45
    const pres = makePresentation([
      makeTextElement({
        id: "el-callout-ja",
        role: "callout",
        text: makeRichText(denseCallout),
        frame: { x: 80, y: 80, width: 1120, height: 500 },
        style: { fontSize: 18 },
      }),
    ]);

    const report = await validatePresentation(pres);
    const calloutIssues = findIssuesByPrefix(report.issues, "content/callout-too-dense/");
    expect(calloutIssues.length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // table-clipped
  // -------------------------------------------------------------------------

  it("detects clipped table with many rows in small frame", async () => {
    const rows = Array.from({ length: 15 }, (_, i) => [`Row ${i}`, `Value ${i}`]);
    const pres = makePresentation([
      makeTableElement({
        id: "el-table",
        headers: ["Name", "Value"],
        rows,
        frame: { x: 80, y: 80, width: 1120, height: 100 }, // too small for 16 rows
      }),
    ]);

    const report = await validatePresentation(pres);
    const tableIssues = findIssuesByPrefix(report.issues, "content/table-clipped/");
    expect(tableIssues.length).toBeGreaterThanOrEqual(1);
    expect(tableIssues[0]!.id).toBe("content/table-clipped/slide-1/el-table");
  });

  it("does not flag table that fits in frame", async () => {
    const pres = makePresentation([
      makeTableElement({
        id: "el-table-ok",
        headers: ["Name", "Value"],
        rows: [["A", "1"], ["B", "2"]],
        frame: { x: 80, y: 80, width: 1120, height: 500 }, // plenty of space
      }),
    ]);

    const report = await validatePresentation(pres);
    const tableIssues = findIssuesByPrefix(report.issues, "content/table-clipped/");
    expect(tableIssues).toHaveLength(0);
  });
});
