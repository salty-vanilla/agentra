import { describe, expect, it } from "vitest";
import { analyzeOperationLog } from "#src/diagnostics/operation-diagnostics.js";
import type { PresentationIR } from "#src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type OpLog = PresentationIR["operationLog"];

function makeEntry(
  type: string,
  slideId?: string,
): OpLog[number] {
  return {
    id: `op-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: "2026-01-01T00:00:00.000Z",
    actor: "system",
    operation: { type, ...(slideId ? { slideId } : {}) },
    result: "success",
  } as OpLog[number];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("analyzeOperationLog", () => {
  it("counts total operations", () => {
    const log: OpLog = [
      makeEntry("update_frame"),
      makeEntry("update_text"),
      makeEntry("update_style"),
    ];

    const summary = analyzeOperationLog(log);

    expect(summary.totalOperations).toBe(3);
  });

  it("classifies frame/position/resize operations", () => {
    const log: OpLog = [
      makeEntry("update_frame"),
      makeEntry("set_element_frame"),
      makeEntry("move_element"),
      makeEntry("resize_element"),
    ];

    const summary = analyzeOperationLog(log);

    expect(summary.frameUpdateOperations).toBe(2); // update_frame, set_element_frame
    expect(summary.positionUpdateOperations).toBe(1); // move_element
    expect(summary.sizeUpdateOperations).toBe(1); // resize_element
  });

  it("classifies layout repair operations", () => {
    const log: OpLog = [
      makeEntry("update_frame"),
      makeEntry("move_element"),
      makeEntry("resize_element"),
      makeEntry("set_element_position"),
      makeEntry("adjust_layout"),
      makeEntry("fix_bounds"),
    ];

    const summary = analyzeOperationLog(log);

    expect(summary.likelyLayoutRepairOperations).toBe(6);
  });

  it("classifies visual polish operations", () => {
    const log: OpLog = [
      makeEntry("update_font"),
      makeEntry("set_color"),
      makeEntry("update_style"),
      makeEntry("add_border"),
      makeEntry("set_fill"),
      makeEntry("add_decoration"),
    ];

    const summary = analyzeOperationLog(log);

    expect(summary.likelyVisualPolishOperations).toBe(6);
    expect(summary.fontUpdateOperations).toBe(1);
    expect(summary.styleUpdateOperations).toBe(5); // color, style, border, fill, decoration
  });

  it("classifies text update operations", () => {
    const log: OpLog = [
      makeEntry("update_text"),
      makeEntry("replace_content"),
      makeEntry("edit_copy"),
    ];

    const summary = analyzeOperationLog(log);

    expect(summary.textUpdateOperations).toBe(3);
  });

  it("groups operations by type", () => {
    const log: OpLog = [
      makeEntry("update_frame"),
      makeEntry("update_frame"),
      makeEntry("update_text"),
    ];

    const summary = analyzeOperationLog(log);

    expect(summary.operationsByType.update_frame).toBe(2);
    expect(summary.operationsByType.update_text).toBe(1);
  });

  it("groups operations by slideId", () => {
    const log: OpLog = [
      makeEntry("update_frame", "slide-1"),
      makeEntry("update_text", "slide-1"),
      makeEntry("update_frame", "slide-2"),
    ];

    const summary = analyzeOperationLog(log);

    expect(summary.operationsBySlideId["slide-1"]).toBe(2);
    expect(summary.operationsBySlideId["slide-2"]).toBe(1);
  });

  it("handles empty operation log", () => {
    const summary = analyzeOperationLog([]);

    expect(summary.totalOperations).toBe(0);
    expect(summary.likelyLayoutRepairOperations).toBe(0);
    expect(summary.likelyVisualPolishOperations).toBe(0);
  });

  it("does not crash on unknown or null operations", () => {
    const log: OpLog = [
      {
        id: "op-1",
        timestamp: "2026-01-01T00:00:00.000Z",
        actor: "system",
        operation: null,
        result: "success",
      } as unknown as OpLog[number],
      {
        id: "op-2",
        timestamp: "2026-01-01T00:00:00.000Z",
        actor: "system",
        operation: { type: "completely_unknown_type" },
        result: "success",
      } as unknown as OpLog[number],
      {
        id: "op-3",
        timestamp: "2026-01-01T00:00:00.000Z",
        actor: "system",
        operation: undefined,
        result: "success",
      } as unknown as OpLog[number],
    ];

    expect(() => analyzeOperationLog(log)).not.toThrow();

    const summary = analyzeOperationLog(log);
    expect(summary.totalOperations).toBe(3);
    expect(summary.operationsByType.unknown).toBe(2); // null + undefined → "unknown"
    expect(summary.operationsByType.completely_unknown_type).toBe(1);
  });

  // --- Phase 7.6A: repair category tests ---

  it("classifies frame operations as layout_frame", () => {
    const log: OpLog = [
      makeEntry("set_element_frame"),
      makeEntry("update_frame"),
      makeEntry("setFrame"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.layout_frame).toBe(3);
  });

  it("classifies move/position operations as layout_position", () => {
    const log: OpLog = [
      makeEntry("move_element"),
      makeEntry("set_position"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.layout_position).toBe(2);
  });

  it("classifies resize/width/height operations as layout_size", () => {
    const log: OpLog = [
      makeEntry("resize_element"),
      makeEntry("adjust_size"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.layout_size).toBe(2);
  });

  it("classifies font operations as visual_font", () => {
    const log: OpLog = [
      makeEntry("update_font"),
      makeEntry("set_fontSize"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.visual_font).toBe(2);
  });

  it("classifies style/color operations as visual_style", () => {
    const log: OpLog = [
      makeEntry("update_style"),
      makeEntry("set_color"),
      makeEntry("set_fill"),
      makeEntry("add_border"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.visual_style).toBe(4);
  });

  it("classifies text operations as content_text", () => {
    const log: OpLog = [
      makeEntry("update_text"),
      makeEntry("replace_content"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.content_text).toBe(2);
  });

  it("classifies delete operations as content_delete", () => {
    const log: OpLog = [
      makeEntry("delete_element"),
      makeEntry("remove_slide"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.content_delete).toBe(2);
  });

  it("classifies add operations as content_add", () => {
    const log: OpLog = [
      makeEntry("add_text"),
      makeEntry("create_element"),
      makeEntry("insert_slide"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.operationsByRepairCategory.content_add).toBe(3);
  });

  it("computes ratios correctly", () => {
    const log: OpLog = [
      // 3 layout repair
      makeEntry("set_element_frame"),
      makeEntry("move_element"),
      makeEntry("resize_element"),
      // 2 visual polish
      makeEntry("update_font"),
      makeEntry("update_style"),
      // 3 content rewrite
      makeEntry("update_text"),
      makeEntry("delete_element"),
      makeEntry("add_text"),
      // 2 unknown
      makeEntry("unknown_op"),
      makeEntry("mystery_op"),
    ];
    const summary = analyzeOperationLog(log);

    expect(summary.totalOperations).toBe(10);
    expect(summary.layoutRepairRatio).toBeCloseTo(0.3, 5);
    expect(summary.visualPolishRatio).toBeCloseTo(0.2, 5);
    expect(summary.contentRewriteRatio).toBeCloseTo(0.3, 5);
  });

  it("ratios are 0 for empty log", () => {
    const summary = analyzeOperationLog([]);
    expect(summary.layoutRepairRatio).toBe(0);
    expect(summary.visualPolishRatio).toBe(0);
    expect(summary.contentRewriteRatio).toBe(0);
  });

  it("topSlidesByOperations is sorted descending", () => {
    const log: OpLog = [
      makeEntry("update_frame", "slide-1"),
      makeEntry("update_frame", "slide-2"),
      makeEntry("update_frame", "slide-2"),
      makeEntry("update_frame", "slide-3"),
      makeEntry("update_frame", "slide-3"),
      makeEntry("update_frame", "slide-3"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.topSlidesByOperations[0]!.slideId).toBe("slide-3");
    expect(summary.topSlidesByOperations[0]!.operationCount).toBe(3);
    expect(summary.topSlidesByOperations[1]!.slideId).toBe("slide-2");
    expect(summary.topSlidesByOperations[2]!.slideId).toBe("slide-1");
  });

  it("topOperationTypes is sorted descending", () => {
    const log: OpLog = [
      makeEntry("update_text"),
      makeEntry("update_frame"),
      makeEntry("update_frame"),
      makeEntry("update_frame"),
      makeEntry("update_style"),
      makeEntry("update_style"),
    ];
    const summary = analyzeOperationLog(log);
    expect(summary.topOperationTypes[0]!.type).toBe("update_frame");
    expect(summary.topOperationTypes[0]!.count).toBe(3);
    expect(summary.topOperationTypes[1]!.type).toBe("update_style");
    expect(summary.topOperationTypes[1]!.count).toBe(2);
    expect(summary.topOperationTypes[2]!.type).toBe("update_text");
    expect(summary.topOperationTypes[2]!.count).toBe(1);
  });
});
