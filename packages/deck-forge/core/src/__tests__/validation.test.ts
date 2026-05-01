import { describe, expect, it } from "vitest";

import { presentationFixture } from "#src/__tests__/fixtures/presentation.fixture.js";
import { NoopImageGenerator } from "#src/assets/generators/noop-image-generator.js";
import { validateAssets } from "#src/validation/rules/asset.js";
import { validatePresentation } from "#src/validation/validate-presentation.js";

describe("validatePresentation", () => {
  it("passes fixture with no critical issues", async () => {
    const report = await validatePresentation(presentationFixture);

    expect(report.status === "passed" || report.status === "warning").toBe(true);
    expect(report.summary.errorCount).toBe(0);
  });

  it("detects missing asset, table mismatch, and out-of-bounds frame", async () => {
    const broken = structuredClone(presentationFixture);

    const imageSlide = broken.slides.find((slide) => slide.id === "slide-image");
    const tableSlide = broken.slides.find((slide) => slide.id === "slide-table");

    if (!imageSlide || !tableSlide) {
      throw new Error("fixture slides missing");
    }

    const image = imageSlide.elements.find((element) => element.type === "image");
    if (!image || image.type !== "image") {
      throw new Error("fixture image missing");
    }

    image.assetId = "missing-asset";
    image.frame.x = -10;

    const table = tableSlide.elements.find((element) => element.type === "table");
    if (!table || table.type !== "table") {
      throw new Error("fixture table missing");
    }

    table.rows.push(["bad-row"]);

    const report = await validatePresentation(broken);

    expect(report.status).toBe("failed");
    expect(report.summary.errorCount).toBeGreaterThanOrEqual(3);

    const messages = report.issues.map((issue) => issue.message);
    expect(messages.some((message) => message.includes("missing asset"))).toBe(true);
    expect(messages.some((message) => message.includes("column count mismatch"))).toBe(true);
    expect(messages.some((message) => message.includes("out of slide bounds"))).toBe(true);
  });

  it("detects tiny font size and strict mode narrative warning", async () => {
    const strictDeck = {
      ...structuredClone(presentationFixture),
      slides: [structuredClone(presentationFixture.slides[0])],
    };

    const text = strictDeck.slides[0]?.elements.find((element) => element.type === "text");
    if (!text || text.type !== "text") {
      throw new Error("fixture text missing");
    }

    text.style.fontSize = 8;

    const report = await validatePresentation(strictDeck, { level: "strict" });

    expect(report.status).toBe("warning");
    expect(report.summary.warningCount).toBeGreaterThanOrEqual(1);
    expect(report.issues.some((issue) => issue.message.includes("Font size is too small"))).toBe(
      true,
    );
    expect(
      report.issues.some((issue) =>
        issue.message.includes("Strict mode expects at least two slides"),
      ),
    ).toBe(true);
  });

  it("detects overlapping elements, duplicate titles, large tables, and placeholder assets", async () => {
    const broken = structuredClone(presentationFixture);
    const firstSlide = broken.slides[0];
    const secondSlide = broken.slides[1];
    if (!firstSlide || !secondSlide) {
      throw new Error("fixture slides missing");
    }

    secondSlide.title = firstSlide.title;
    firstSlide.elements.push({
      id: "el-overlap",
      type: "text",
      role: "body",
      frame: { ...firstSlide.elements[0].frame },
      text: { paragraphs: [{ runs: [{ text: "Overlapping text" }] }] },
      style: { fontSize: 18 },
    });

    const tableSlide = broken.slides.find((slide) => slide.id === "slide-table");
    const table = tableSlide?.elements.find((element) => element.type === "table");
    if (!table || table.type !== "table") {
      throw new Error("fixture table missing");
    }
    table.headers = ["A", "B", "C", "D", "E"];
    table.rows = Array.from({ length: 9 }, (_, index) => [
      `A${index}`,
      `B${index}`,
      `C${index}`,
      `D${index}`,
      `E${index}`,
    ]);

    const asset = broken.assets.assets[0];
    if (!asset) {
      throw new Error("fixture asset missing");
    }
    asset.uri = "placeholder://asset-hero-001.png";

    const report = await validatePresentation(broken);
    const messages = report.issues.map((issue) => issue.message);

    expect(messages.some((message) => message.includes("Elements overlap"))).toBe(true);
    expect(messages.some((message) => message.includes("Duplicate slide title"))).toBe(true);
    expect(messages.some((message) => message.includes("too many cells"))).toBe(true);
    expect(messages.some((message) => message.includes("Placeholder asset"))).toBe(true);
  });

  it("fails export validation for major non-background overlap", async () => {
    const broken = structuredClone(presentationFixture);
    const firstSlide = broken.slides[0];
    if (!firstSlide) {
      throw new Error("fixture slide missing");
    }

    firstSlide.elements.push({
      id: "export-overlap",
      type: "text",
      role: "body",
      frame: { ...firstSlide.elements[0].frame },
      text: { paragraphs: [{ runs: [{ text: "Overlapping export text" }] }] },
      style: { fontSize: 18 },
    });

    const report = await validatePresentation(broken, { level: "export" });

    expect(report.status).toBe("failed");
    expect(
      report.issues.some(
        (issue) =>
          issue.severity === "error" &&
          issue.message.includes("Elements overlap") &&
          issue.message.includes("export-overlap"),
      ),
    ).toBe(true);
  });

  it("fails export validation for unreadably dense PPTX tables", async () => {
    const broken = structuredClone(presentationFixture);
    const tableSlide = broken.slides.find((slide) => slide.id === "slide-table");
    const table = tableSlide?.elements.find((element) => element.type === "table");
    if (!table || table.type !== "table") {
      throw new Error("fixture table missing");
    }

    table.frame.height = 90;
    table.headers = ["施策名", "目標値", "担当部門", "開始時期", "完了予定"];
    table.rows = Array.from({ length: 5 }, (_, index) => [
      `長い施策名がセル内で折り返される想定${index}`,
      "ダウンタイム10時間以下",
      "製造・設備管理",
      "Q3 第1週",
      "Q3 第12週",
    ]);

    const report = await validatePresentation(broken, { level: "export" });

    expect(report.status).toBe("failed");
    expect(
      report.issues.some((issue) => issue.message.includes("Table row height is too small")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Asset validation rule
// ---------------------------------------------------------------------------

describe("validateAssets rule", () => {
  it("passes when all asset usages reference valid slides and elements", async () => {
    const report = await validatePresentation(presentationFixture);
    const assetIssues = report.issues.filter(
      (i) => i.category === "asset" && i.severity === "error",
    );
    // The fixture has one valid asset usage — no asset integrity errors
    expect(assetIssues.filter((i) => i.message.includes("non-existent"))).toHaveLength(0);
  });

  it("detects asset usage referencing a non-existent slide", async () => {
    const broken = structuredClone(presentationFixture);
    const asset = broken.assets.assets[0];
    if (!asset) throw new Error("fixture has no assets");

    asset.usage.push({ slideId: "slide-ghost", elementId: "el-ghost", role: "hero" });

    const report = await validatePresentation(broken);
    const messages = report.issues.map((i) => i.message);
    expect(
      messages.some((m) => m.includes("non-existent slide") && m.includes("slide-ghost")),
    ).toBe(true);
  });

  it("detects asset usage referencing a non-existent element", async () => {
    const broken = structuredClone(presentationFixture);
    const asset = broken.assets.assets[0];
    if (!asset) throw new Error("fixture has no assets");

    asset.usage.push({ slideId: "slide-image", elementId: "el-ghost", role: "hero" });

    const report = await validatePresentation(broken);
    const messages = report.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("non-existent element") && m.includes("el-ghost"))).toBe(
      true,
    );
  });

  it("detects empty asset URI", async () => {
    const broken = structuredClone(presentationFixture);
    const asset = broken.assets.assets[0];
    if (!asset) throw new Error("fixture has no assets");

    asset.uri = "";

    const report = await validatePresentation(broken);
    const messages = report.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes("Asset URI is empty"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// NoopImageGenerator
// ---------------------------------------------------------------------------

describe("NoopImageGenerator", () => {
  it("generates a stub asset without errors", async () => {
    const gen = new NoopImageGenerator();
    expect(gen.name).toBe("noop");

    const asset = await gen.generate({
      prompt: "A futuristic factory floor",
      aspectRatio: "16:9",
    });

    expect(asset.id).toMatch(/^asset-noop-/);
    expect(asset.type).toBe("image");
    expect(asset.uri).toMatch(/^placeholder:\/\//);
    expect(asset.mimeType).toBe("image/png");
    expect(asset.metadata.source).toBe("generated");
    expect(asset.metadata.generator).toBe("noop");
    expect(asset.metadata.prompt).toBe("A futuristic factory floor");
    expect(asset.usage).toHaveLength(0);
  });

  it("produces unique IDs on each call", async () => {
    const gen = new NoopImageGenerator();
    const [a, b] = await Promise.all([
      gen.generate({ prompt: "p1", aspectRatio: "4:3" }),
      gen.generate({ prompt: "p2", aspectRatio: "4:3" }),
    ]);
    expect(a.id).not.toBe(b.id);
  });
});
