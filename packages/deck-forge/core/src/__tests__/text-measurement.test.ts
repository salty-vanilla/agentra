import { describe, expect, it } from "vitest";
import {
  estimateTextBoxHeight,
  estimateTextLines,
  inferTextLanguage,
} from "#src/measurement/text-measurement.js";
import {
  richTextParagraphsToPlainText,
  richTextToPlainText,
} from "#src/measurement/rich-text-utils.js";
import type { RichText } from "#src/index.js";

// ---------------------------------------------------------------------------
// inferTextLanguage
// ---------------------------------------------------------------------------

describe("inferTextLanguage", () => {
  it("detects Japanese text", () => {
    expect(inferTextLanguage("これはテストです")).toBe("ja");
  });

  it("detects English text", () => {
    expect(inferTextLanguage("This is a test")).toBe("en");
  });

  it("returns 'en' for empty text", () => {
    expect(inferTextLanguage("")).toBe("en");
  });

  it("detects mixed text with ≥20% CJK as Japanese", () => {
    // 4 CJK chars out of ~12 total chars → ~33%
    expect(inferTextLanguage("abc テスト def 日本")).toBe("ja");
  });

  it("detects mixed text with <20% CJK as English", () => {
    // 1 CJK char out of ~20 total chars → ~5%
    expect(inferTextLanguage("This is a long sentence 日")).toBe("en");
  });
});

// ---------------------------------------------------------------------------
// estimateTextLines
// ---------------------------------------------------------------------------

describe("estimateTextLines", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTextLines({ text: "", width: 400, fontSize: 18 })).toBe(0);
  });

  it("estimates Japanese text uses more lines than English at same width", () => {
    const text = "A".repeat(40); // 40 chars
    const jaText = "あ".repeat(40); // 40 CJK chars

    const enLines = estimateTextLines({ text, width: 400, fontSize: 18, language: "en" });
    const jaLines = estimateTextLines({ text: jaText, width: 400, fontSize: 18, language: "ja" });

    expect(jaLines).toBeGreaterThan(enLines);
  });

  it("respects explicit newlines", () => {
    const singleLine = estimateTextLines({ text: "Hello world", width: 1000, fontSize: 18 });
    const twoLines = estimateTextLines({ text: "Hello\nworld", width: 1000, fontSize: 18 });

    expect(twoLines).toBe(singleLine + 1);
  });

  it("increases lines when width is narrower", () => {
    const text = "This is a moderately long sentence for testing";
    const wide = estimateTextLines({ text, width: 800, fontSize: 18 });
    const narrow = estimateTextLines({ text, width: 200, fontSize: 18 });

    expect(narrow).toBeGreaterThan(wide);
  });

  it("handles multiple empty lines from consecutive newlines", () => {
    const lines = estimateTextLines({ text: "A\n\nB", width: 400, fontSize: 18 });
    expect(lines).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// estimateTextBoxHeight
// ---------------------------------------------------------------------------

describe("estimateTextBoxHeight", () => {
  it("returns 0 for empty text", () => {
    expect(estimateTextBoxHeight({ text: "", width: 400, fontSize: 18 })).toBe(0);
  });

  it("height increases with more text", () => {
    const short = estimateTextBoxHeight({ text: "Hello", width: 400, fontSize: 18 });
    const long = estimateTextBoxHeight({
      text: "Hello ".repeat(50),
      width: 400,
      fontSize: 18,
    });

    expect(long).toBeGreaterThan(short);
  });

  it("uses default lineHeight of 1.4", () => {
    const height = estimateTextBoxHeight({ text: "Hello", width: 1000, fontSize: 20 });
    // 1 line × 20 × 1.4 = 28
    expect(height).toBe(28);
  });

  it("respects custom lineHeight", () => {
    const height = estimateTextBoxHeight({
      text: "Hello",
      width: 1000,
      fontSize: 20,
      lineHeight: 2.0,
    });
    // 1 line × 20 × 2.0 = 40
    expect(height).toBe(40);
  });

  it("respects maxCharsPerLineOverride", () => {
    const text = "A".repeat(30);
    const height = estimateTextBoxHeight({
      text,
      width: 1000,
      fontSize: 18,
      maxCharsPerLineOverride: 10,
    });
    // 3 lines × 18 × 1.4 = 75.6
    expect(height).toBeCloseTo(75.6, 1);
  });
});

// ---------------------------------------------------------------------------
// richTextToPlainText / richTextParagraphsToPlainText
// ---------------------------------------------------------------------------

describe("richTextToPlainText", () => {
  it("joins runs within a paragraph", () => {
    const text: RichText = {
      paragraphs: [{ runs: [{ text: "Hello " }, { text: "world" }] }],
    };
    expect(richTextToPlainText(text)).toBe("Hello world");
  });

  it("separates paragraphs with newlines", () => {
    const text: RichText = {
      paragraphs: [
        { runs: [{ text: "First" }] },
        { runs: [{ text: "Second" }] },
      ],
    };
    expect(richTextToPlainText(text)).toBe("First\nSecond");
  });

  it("includes bullet paragraphs", () => {
    const text: RichText = {
      paragraphs: [
        { runs: [{ text: "Item 1" }], bullet: { indentLevel: 0 } },
        { runs: [{ text: "Item 2" }], bullet: { indentLevel: 0 } },
      ],
    };
    expect(richTextToPlainText(text)).toBe("Item 1\nItem 2");
  });

  it("handles empty RichText", () => {
    const text: RichText = { paragraphs: [] };
    expect(richTextToPlainText(text)).toBe("");
  });
});

describe("richTextParagraphsToPlainText", () => {
  it("returns per-paragraph strings", () => {
    const text: RichText = {
      paragraphs: [
        { runs: [{ text: "First" }] },
        { runs: [{ text: "Second" }] },
      ],
    };
    expect(richTextParagraphsToPlainText(text)).toEqual(["First", "Second"]);
  });

  it("returns empty array for empty RichText", () => {
    const text: RichText = { paragraphs: [] };
    expect(richTextParagraphsToPlainText(text)).toEqual([]);
  });
});
