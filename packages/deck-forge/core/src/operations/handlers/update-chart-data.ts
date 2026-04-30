import type { PresentationIR } from "#src/index.js";
import type { UpdateChartDataOperation } from "#src/operations/types.js";
import { findSlide } from "#src/operations/utils.js";

export function updateChartData(
  presentation: PresentationIR,
  operation: UpdateChartDataOperation,
): void {
  const slide = findSlide(presentation, operation.slideId);
  const element = slide.elements.find((item) => item.id === operation.elementId);
  if (!element) {
    throw new Error(`Element not found: ${operation.elementId}`);
  }
  if (element.type !== "chart") {
    throw new Error(`Element is not a chart: ${operation.elementId}`);
  }

  element.data = operation.data;
  if (operation.encoding) {
    element.encoding = operation.encoding;
  }
  if (operation.chartType) {
    element.chartType = operation.chartType;
  }
}
