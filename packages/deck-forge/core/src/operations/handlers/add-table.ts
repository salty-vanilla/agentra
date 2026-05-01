import type { PresentationIR, TableElementIR } from "#src/index.js";
import type { AddTableOperation } from "#src/operations/types.js";
import { collectElementIds, findSlide, generateId, getTargetFrame } from "#src/operations/utils.js";

export function addTable(presentation: PresentationIR, operation: AddTableOperation): void {
  const slide = findSlide(presentation, operation.slideId);
  const elementId = operation.elementId ?? generateId("el", collectElementIds(presentation));

  const expectedColumnCount = operation.headers.length;
  const invalidRow = operation.rows.find((row) => row.length !== expectedColumnCount);

  if (invalidRow) {
    throw new Error("Table rows must match header column count.");
  }

  const tableElement: TableElementIR = {
    id: elementId,
    type: "table",
    frame: getTargetFrame(slide, operation.regionId),
    headers: operation.headers,
    rows: operation.rows,
    style: operation.style,
  };

  slide.elements.push(tableElement);
}
