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
});
