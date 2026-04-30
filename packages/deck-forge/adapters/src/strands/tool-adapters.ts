import {
  addChartHandler,
  applyPresentationOperationsHandler,
  attachRetrievedAssetHandler,
  buildPresentationIrHandler,
  buildReviewPacketHandler,
  componentPreflightHandler,
  componentSynthesizeHandler,
  createPresentationSpecHandler,
  designPassHandler,
  exportPresentationHandler,
  exportSlideImagesHandler,
  generateAssetPlanHandler,
  generateDeckPlanHandler,
  generateImageHandler,
  generateSlideSpecsHandler,
  inspectPresentationHandler,
  listComponentsHandler,
  planPresentationOperationsHandler,
  presentationTools,
  reviewPresentationHandler,
  searchAssetsHandler,
  updateChartDataHandler,
  validatePresentationHandler,
  visualReviewHandler,
} from "@deck-forge/tools";
import { tool } from "@strands-agents/sdk";
import { z } from "zod";

export type StrandsPresentationTool = ReturnType<typeof tool>;
export type StrandsPresentationToolHandler = (input: Record<string, unknown>) => Promise<unknown>;

const handlerMap: Record<string, StrandsPresentationToolHandler> = {
  presentation_create_spec: async (input) => createPresentationSpecHandler(input as never),
  presentation_generate_deck_plan: async (input) => generateDeckPlanHandler(input as never),
  presentation_generate_slide_specs: async (input) => generateSlideSpecsHandler(input as never),
  presentation_component_preflight: async (input) => componentPreflightHandler(input as never),
  presentation_component_synthesize: async (input) => componentSynthesizeHandler(input as never),
  presentation_component_list: async (input) => listComponentsHandler(input as never),
  presentation_generate_asset_plan: async (input) => generateAssetPlanHandler(input as never),
  presentation_build_ir: async (input) => buildPresentationIrHandler(input as never),
  presentation_apply_operations: async (input) =>
    applyPresentationOperationsHandler(input as never),
  presentation_review: async (input) => reviewPresentationHandler(input as never),
  presentation_plan_operations: async (input) => planPresentationOperationsHandler(input as never),
  presentation_design_pass: async (input) => designPassHandler(input as never),
  presentation_visual_review: async (input) => visualReviewHandler(input as never),
  presentation_add_chart: async (input) => addChartHandler(input as never),
  presentation_update_chart_data: async (input) => updateChartDataHandler(input as never),
  presentation_inspect: async (input) => inspectPresentationHandler(input as never),
  presentation_validate: async (input) => validatePresentationHandler(input as never),
  presentation_build_review_packet: async (input) => buildReviewPacketHandler(input as never),
  presentation_export: async (input) => exportPresentationHandler(input as never),
  presentation_export_slide_images: async (input) => exportSlideImagesHandler(input as never),
  presentation_generate_image: async (input) => generateImageHandler(input as never),
  presentation_search_assets: async (input) => searchAssetsHandler(input as never),
  presentation_attach_retrieved_asset: async (input) => attachRetrievedAssetHandler(input as never),
};

function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  const properties = (schema.properties ?? {}) as Record<string, { type?: string }>;
  const required = (schema.required ?? []) as string[];

  const shape: Record<string, z.ZodType> = {};
  for (const [key, prop] of Object.entries(properties)) {
    let fieldSchema: z.ZodType;
    switch (prop.type) {
      case "string":
        fieldSchema = z.string();
        break;
      case "number":
        fieldSchema = z.number();
        break;
      case "boolean":
        fieldSchema = z.boolean();
        break;
      case "array":
        fieldSchema = z.array(z.unknown());
        break;
      case "object":
        fieldSchema = z.record(z.string(), z.unknown());
        break;
      default:
        fieldSchema = z.unknown();
    }
    if (!required.includes(key)) {
      fieldSchema = fieldSchema.optional();
    }
    shape[key] = fieldSchema;
  }
  return z.object(shape).passthrough();
}

export function createPresentationTools(): StrandsPresentationTool[] {
  return presentationTools.map((def) => {
    const handler = handlerMap[def.name];
    if (!handler) {
      throw new Error(`No handler found for tool: ${def.name}`);
    }
    return tool({
      name: def.name,
      description: def.description,
      inputSchema: jsonSchemaToZod(def.inputSchema),
      callback: async (input: unknown) => {
        const payload =
          typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
        const result = await handler(payload);
        return JSON.stringify(result);
      },
    });
  });
}
