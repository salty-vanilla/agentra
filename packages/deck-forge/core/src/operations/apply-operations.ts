import type { PresentationIR } from "#src/index.js";
import { addChart } from "#src/operations/handlers/add-chart.js";
import { addImage } from "#src/operations/handlers/add-image.js";
import { addSlide } from "#src/operations/handlers/add-slide.js";
import { addTable } from "#src/operations/handlers/add-table.js";
import { addText } from "#src/operations/handlers/add-text.js";
import { applyTheme } from "#src/operations/handlers/apply-theme.js";
import { attachAsset } from "#src/operations/handlers/attach-asset.js";
import { deleteElement } from "#src/operations/handlers/delete-element.js";
import { moveSlide } from "#src/operations/handlers/move-slide.js";
import { removeSlide } from "#src/operations/handlers/remove-slide.js";
import { setSlideLayout } from "#src/operations/handlers/set-slide-layout.js";
import { updateChartData } from "#src/operations/handlers/update-chart-data.js";
import { updateText } from "#src/operations/handlers/update-text.js";
import type { PresentationOperation } from "#src/operations/types.js";
import { appendOperationRecord, clonePresentation } from "#src/operations/utils.js";

export async function applyOperations(
  presentation: PresentationIR,
  operations: PresentationOperation[],
): Promise<PresentationIR> {
  const next = clonePresentation(presentation);

  for (const operation of operations) {
    try {
      switch (operation.type) {
        case "add_slide":
          addSlide(next, operation);
          break;
        case "remove_slide":
          removeSlide(next, operation);
          break;
        case "move_slide":
          moveSlide(next, operation);
          break;
        case "set_slide_layout":
          setSlideLayout(next, operation);
          break;
        case "add_text":
          addText(next, operation);
          break;
        case "update_text":
          updateText(next, operation);
          break;
        case "delete_element":
          deleteElement(next, operation);
          break;
        case "add_image":
          addImage(next, operation);
          break;
        case "add_table":
          addTable(next, operation);
          break;
        case "add_chart":
          addChart(next, operation);
          break;
        case "update_chart_data":
          updateChartData(next, operation);
          break;
        case "attach_asset":
          attachAsset(next, operation);
          break;
        case "apply_theme":
          applyTheme(next, operation);
          break;
        default:
          throw new Error(`Unsupported operation type: ${(operation as { type: string }).type}`);
      }

      appendOperationRecord(next, operation, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      appendOperationRecord(next, operation, "failed", message);
      throw new Error(`Operation failed (${operation.type}): ${message}`);
    }
  }

  return next;
}
