import { describe, expect, it } from "vitest";

import * as rootAdapters from "#src/index.js";
import { createPresentationTools } from "#src/strands/index.js";

describe("createPresentationTools", () => {
  it("does not export Strands-specific APIs from the adapters root", () => {
    expect(rootAdapters).not.toHaveProperty("createPresentationTools");
    expect(Object.keys(rootAdapters)).toEqual([]);
  });

  it("returns Strands-compatible tools", () => {
    const tools = createPresentationTools();

    expect(tools).toHaveLength(23);
  });

  it("each tool has name, description and handler", () => {
    const tools = createPresentationTools();

    const expectedNames = [
      "presentation_create_spec",
      "presentation_generate_deck_plan",
      "presentation_generate_slide_specs",
      "presentation_component_preflight",
      "presentation_component_synthesize",
      "presentation_component_list",
      "presentation_generate_asset_plan",
      "presentation_build_ir",
      "presentation_apply_operations",
      "presentation_review",
      "presentation_plan_operations",
      "presentation_add_chart",
      "presentation_update_chart_data",
      "presentation_inspect",
      "presentation_validate",
      "presentation_build_review_packet",
      "presentation_export",
      "presentation_export_slide_images",
      "presentation_generate_image",
      "presentation_search_assets",
      "presentation_attach_retrieved_asset",
    ];

    const toolNames = tools.map((t) => {
      const candidate = t as { name?: string; toolSpec?: { name?: string } };
      return candidate.name ?? candidate.toolSpec?.name;
    });
    for (const name of expectedNames) {
      expect(toolNames).toContain(name);
    }
  });
});
