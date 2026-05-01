import { describe, expect, it } from "vitest";
import {
  estimateTableHeight,
  estimateTableRowHeight,
} from "#src/measurement/table-measurement.js";

describe("estimateTableRowHeight", () => {
  it("returns at least minRowHeight", () => {
    // Small font should still produce minRowHeight
    const height = estimateTableRowHeight({ fontSize: 8, minRowHeight: 30 });
    expect(height).toBeGreaterThanOrEqual(30);
  });

  it("uses default minRowHeight of 24", () => {
    const height = estimateTableRowHeight({ fontSize: 8 });
    expect(height).toBeGreaterThanOrEqual(24);
  });

  it("grows with larger font size", () => {
    const small = estimateTableRowHeight({ fontSize: 10 });
    const large = estimateTableRowHeight({ fontSize: 24 });
    expect(large).toBeGreaterThan(small);
  });
});

describe("estimateTableHeight", () => {
  it("increases with body row count", () => {
    const few = estimateTableHeight({ rowCount: 3, fontSize: 14 });
    const many = estimateTableHeight({ rowCount: 10, fontSize: 14 });
    expect(many).toBeGreaterThan(few);
  });

  it("accounts for header row by default", () => {
    // rowCount=3 with headerRows=1 → 4 total rows
    const height = estimateTableHeight({ rowCount: 3, fontSize: 14 });
    const rowHeight = estimateTableRowHeight({ fontSize: 14 });
    expect(height).toBeCloseTo(4 * rowHeight, 1);
  });

  it("respects custom headerRows", () => {
    const oneHeader = estimateTableHeight({ rowCount: 5, headerRows: 1, fontSize: 14 });
    const twoHeaders = estimateTableHeight({ rowCount: 5, headerRows: 2, fontSize: 14 });
    expect(twoHeaders).toBeGreaterThan(oneHeader);
  });

  it("respects custom minRowHeight", () => {
    const height = estimateTableHeight({
      rowCount: 3,
      fontSize: 8,
      minRowHeight: 40,
    });
    // 4 total rows × 40 = 160
    expect(height).toBe(160);
  });
});
