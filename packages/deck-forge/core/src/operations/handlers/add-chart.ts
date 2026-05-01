import type { ChartElementIR, PresentationIR } from "#src/index.js";
import type { AddChartOperation } from "#src/operations/types.js";
import { collectElementIds, findSlide, generateId, getTargetFrame } from "#src/operations/utils.js";

export function addChart(presentation: PresentationIR, operation: AddChartOperation): void {
  const slide = findSlide(presentation, operation.slideId);
  const elementId = operation.elementId ?? generateId("el", collectElementIds(presentation));

  const chartElement: ChartElementIR = {
    id: elementId,
    type: "chart",
    frame: getTargetFrame(slide, operation.regionId),
    chartType: operation.chartType,
    data: operation.data,
    encoding: operation.encoding,
    style: operation.style,
  };

  slide.elements.push(chartElement);
}
