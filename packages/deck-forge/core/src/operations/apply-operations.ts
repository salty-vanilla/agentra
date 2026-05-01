import type { PresentationIR } from "#src/index.js";
import { addChart } from "#src/operations/handlers/add-chart.js";
import { addImage } from "#src/operations/handlers/add-image.js";
import { addSlide } from "#src/operations/handlers/add-slide.js";
import { addTable } from "#src/operations/handlers/add-table.js";
import { addText } from "#src/operations/handlers/add-text.js";
import { applyTheme } from "#src/operations/handlers/apply-theme.js";
import { attachAsset } from "#src/operations/handlers/attach-asset.js";
import { deleteElement } from "#src/operations/handlers/delete-element.js";
import { moveElement } from "#src/operations/handlers/move-element.js";
import { moveSlide } from "#src/operations/handlers/move-slide.js";
import { removeSlide } from "#src/operations/handlers/remove-slide.js";
import { resizeElement } from "#src/operations/handlers/resize-element.js";
import { setElementFrame } from "#src/operations/handlers/set-element-frame.js";
import { setElementRegion } from "#src/operations/handlers/set-element-region.js";
import { setSlideLayout } from "#src/operations/handlers/set-slide-layout.js";
import { updateChartData } from "#src/operations/handlers/update-chart-data.js";
import { updateElementStyle } from "#src/operations/handlers/update-element-style.js";
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
        case "set_element_frame": {
          const r1 = setElementFrame(next, operation);
          if (r1.status === "skipped") {
            appendOperationRecord(next, operation, "skipped", r1.reason);
            continue;
          }
          break;
        }
        case "move_element": {
          const r2 = moveElement(next, operation);
          if (r2.status === "skipped") {
            appendOperationRecord(next, operation, "skipped", r2.reason);
            continue;
          }
          break;
        }
        case "resize_element": {
          const r3 = resizeElement(next, operation);
          if (r3.status === "skipped") {
            appendOperationRecord(next, operation, "skipped", r3.reason);
            continue;
          }
          break;
        }
        case "set_element_region": {
          const r4 = setElementRegion(next, operation);
          if (r4.status === "skipped") {
            appendOperationRecord(next, operation, "skipped", r4.reason);
            continue;
          }
          break;
        }
        case "update_element_style": {
          const r5 = updateElementStyle(next, operation);
          if (r5.status === "skipped") {
            appendOperationRecord(next, operation, "skipped", r5.reason);
            continue;
          }
          break;
        }
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
