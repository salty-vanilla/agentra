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
  reviewPresentationHandler,
  searchAssetsHandler,
  updateChartDataHandler,
  validatePresentationHandler,
  visualReviewHandler,
} from "@deck-forge/tools";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const anyObject = z.object({}).passthrough();

export type ToolRuntimePolicy = {
  workspaceRoot?: string;
  allowOutsideWorkspace?: boolean;
};

export function registerTools(server: McpServer, policy?: ToolRuntimePolicy): void {
  server.registerTool(
    "presentation_create_spec",
    {
      description:
        "Create a scaffold presentation brief from a user request. For production decks, an Agent should provide grounded createArtifacts.",
      inputSchema: {
        userRequest: z.string(),
        audience: z.string().optional(),
        goal: z.string().optional(),
        slideCount: z.number().int().positive().optional(),
        tone: z.string().optional(),
        outputFormat: z.enum(["pptx", "pdf", "html", "json"]).optional(),
      },
    },
    async ({ userRequest, audience, goal, slideCount, tone, outputFormat }) => {
      try {
        const output = await createPresentationSpecHandler({
          userRequest,
          audience,
          goal,
          slideCount,
          tone,
          outputFormat,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_generate_deck_plan",
    {
      description:
        "Generate a scaffold deck plan from a presentation brief. This is a helper, not a substitute for Agent planning.",
      inputSchema: {
        brief: anyObject,
      },
    },
    async ({ brief }) => {
      try {
        const output = await generateDeckPlanHandler({
          brief: brief as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_generate_slide_specs",
    {
      description:
        "Generate scaffold slide specs from brief and deck plan. For production decks, prefer Agent-authored slideSpecs.",
      inputSchema: {
        brief: anyObject,
        deckPlan: anyObject,
      },
    },
    async ({ brief, deckPlan }) => {
      try {
        const output = await generateSlideSpecsHandler({
          brief: brief as never,
          deckPlan: deckPlan as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_component_preflight",
    {
      description: "Analyze required slide components against persistent catalog.",
      inputSchema: {
        slideSpecs: z.array(anyObject),
        componentsDir: z.string().optional(),
      },
    },
    async ({ slideSpecs, componentsDir }) => {
      try {
        const output = await componentPreflightHandler({
          slideSpecs: slideSpecs as never,
          componentsDir,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_component_synthesize",
    {
      description: "Synthesize and persist missing slide components.",
      inputSchema: {
        slideSpecs: z.array(anyObject),
        componentsDir: z.string().optional(),
      },
    },
    async ({ slideSpecs, componentsDir }) => {
      try {
        const output = await componentSynthesizeHandler({
          slideSpecs: slideSpecs as never,
          componentsDir,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_component_list",
    {
      description: "List persistent component catalog.",
      inputSchema: {
        componentsDir: z.string().optional(),
      },
    },
    async ({ componentsDir }) => {
      try {
        const output = await listComponentsHandler({ componentsDir });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_generate_asset_plan",
    {
      description: "Generate asset specs from brief and slide specs.",
      inputSchema: {
        brief: anyObject,
        slideSpecs: z.array(anyObject),
        acquisitionMode: z.enum(["generate", "retrieve", "auto"]).optional(),
      },
    },
    async ({ brief, slideSpecs, acquisitionMode }) => {
      try {
        const output = await generateAssetPlanHandler({
          brief: brief as never,
          slideSpecs: slideSpecs as never,
          acquisitionMode,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_build_ir",
    {
      description: "Build PresentationIR from spec artifacts.",
      inputSchema: {
        brief: anyObject,
        deckPlan: anyObject,
        slideSpecs: z.array(anyObject),
        assetSpecs: z.array(anyObject),
        id: z.string().optional(),
        version: z.string().optional(),
        title: z.string().optional(),
        theme: anyObject.optional(),
        meta: anyObject.optional(),
      },
    },
    async ({ brief, deckPlan, slideSpecs, assetSpecs, id, version, title, theme, meta }) => {
      try {
        const output = await buildPresentationIrHandler({
          brief: brief as never,
          deckPlan: deckPlan as never,
          slideSpecs: slideSpecs as never,
          assetSpecs: assetSpecs as never,
          id,
          version,
          title,
          theme: theme as never,
          meta: meta as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_apply_operations",
    {
      description: "Apply operation list to presentation IR and return updated presentation.",
      inputSchema: {
        presentation: anyObject,
        operations: z.array(anyObject),
      },
    },
    async ({ presentation, operations }) => {
      try {
        const output = await applyPresentationOperationsHandler({
          presentation: presentation as never,
          operations: operations as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_review",
    {
      description: "Review a presentation and return actionable issues.",
      inputSchema: {
        presentation: anyObject,
        report: anyObject.optional(),
        goal: z.string().optional(),
        packet: anyObject.optional(),
      },
    },
    async ({ presentation, report, goal, packet }) => {
      try {
        const output = await reviewPresentationHandler({
          presentation: presentation as never,
          report: report as never,
          goal,
          packet: packet as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_plan_operations",
    {
      description: "Plan presentation operations from review issues.",
      inputSchema: {
        presentation: anyObject,
        issues: z.array(anyObject),
        goal: z.string().optional(),
      },
    },
    async ({ presentation, issues, goal }) => {
      try {
        const output = await planPresentationOperationsHandler({
          presentation: presentation as never,
          issues: issues as never,
          goal,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_design_pass",
    {
      description:
        "Run a SlideDesigner over the presentation (or a single slide) to refine typography, hierarchy and emphasis.",
      inputSchema: {
        presentation: anyObject,
        slideId: z.string().optional(),
        options: z
          .object({
            focus: z
              .array(z.enum(["layout", "typography", "color", "hierarchy", "decoration"]))
              .optional(),
            maxOperations: z.number().optional(),
          })
          .optional(),
      },
    },
    async ({ presentation, slideId, options }) => {
      try {
        const output = await designPassHandler({
          presentation: presentation as never,
          slideId,
          options,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_visual_review",
    {
      description:
        "Run a VisualReviewer over a presentation. Returns findings + suggested operations (NOT auto-applied).",
      inputSchema: {
        presentation: anyObject,
        slideImages: z.array(anyObject).optional(),
        focus: z
          .array(z.enum(["overlap", "hierarchy", "color", "typography", "decoration", "balance"]))
          .optional(),
      },
    },
    async ({ presentation, slideImages, focus }) => {
      try {
        const output = await visualReviewHandler({
          presentation: presentation as never,
          slideImages: slideImages as never,
          focus,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_add_chart",
    {
      description: "Add chart element to a slide.",
      inputSchema: {
        presentation: anyObject,
        operation: anyObject,
      },
    },
    async ({ presentation, operation }) => {
      try {
        const output = await addChartHandler({
          presentation: presentation as never,
          operation: operation as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_update_chart_data",
    {
      description: "Update chart data of an existing chart element.",
      inputSchema: {
        presentation: anyObject,
        operation: anyObject,
      },
    },
    async ({ presentation, operation }) => {
      try {
        const output = await updateChartDataHandler({
          presentation: presentation as never,
          operation: operation as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_inspect",
    {
      description: "Inspect presentation with include filters and optional anchor target.",
      inputSchema: {
        presentation: anyObject,
        query: anyObject,
      },
    },
    async ({ presentation, query }) => {
      try {
        const output = await inspectPresentationHandler({
          presentation: presentation as never,
          query: query as never,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_validate",
    {
      description: "Validate presentation and return ValidationReport.",
      inputSchema: {
        presentation: anyObject,
        level: z.enum(["basic", "strict", "export"]).optional(),
      },
    },
    async ({ presentation, level }) => {
      try {
        const output = await validatePresentationHandler({
          presentation: presentation as never,
          level,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_build_review_packet",
    {
      description:
        "Build a standardized review packet for an Agent/LLM/VLM reviewer, optionally including rendered slide images.",
      inputSchema: {
        userRequest: z.string(),
        presentation: anyObject,
        validationReport: anyObject.optional(),
        grounding: anyObject.optional(),
        renderImages: z.boolean().optional(),
        slideIds: z.array(z.string()).optional(),
        imageFormat: z.enum(["png", "jpeg"]).optional(),
        imageScale: z.number().positive().optional(),
      },
    },
    async ({
      userRequest,
      presentation,
      validationReport,
      grounding,
      renderImages,
      slideIds,
      imageFormat,
      imageScale,
    }) => {
      try {
        const output = await buildReviewPacketHandler({
          userRequest,
          presentation: presentation as never,
          validationReport: validationReport as never,
          grounding: grounding as never,
          renderImages,
          slideIds,
          imageFormat,
          imageScale,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_export",
    {
      description: "Export presentation to json/pptx/html/pdf.",
      inputSchema: {
        presentation: anyObject,
        format: z.enum(["json", "pptx", "html", "pdf"]),
        outputPath: z.string().optional(),
        workspaceRoot: z.string().optional(),
        allowOutsideWorkspace: z.boolean().optional(),
      },
    },
    async ({ presentation, format, outputPath, workspaceRoot, allowOutsideWorkspace }) => {
      try {
        const output = await exportPresentationHandler({
          presentation: presentation as never,
          format,
          outputPath,
          workspaceRoot: workspaceRoot ?? policy?.workspaceRoot,
          allowOutsideWorkspace: allowOutsideWorkspace ?? policy?.allowOutsideWorkspace,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_export_slide_images",
    {
      description: "Render presentation slides to PNG/JPEG images for Agent/LLM/VLM review.",
      inputSchema: {
        presentation: anyObject,
        format: z.enum(["png", "jpeg"]).optional(),
        slideIds: z.array(z.string()).optional(),
        scale: z.number().positive().optional(),
        outputDir: z.string().optional(),
        workspaceRoot: z.string().optional(),
        allowOutsideWorkspace: z.boolean().optional(),
      },
    },
    async ({
      presentation,
      format,
      slideIds,
      scale,
      outputDir,
      workspaceRoot,
      allowOutsideWorkspace,
    }) => {
      try {
        const output = await exportSlideImagesHandler({
          presentation: presentation as never,
          format,
          slideIds,
          scale,
          outputDir,
          workspaceRoot: workspaceRoot ?? policy?.workspaceRoot,
          allowOutsideWorkspace: allowOutsideWorkspace ?? policy?.allowOutsideWorkspace,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_generate_image",
    {
      description:
        "Generate an image asset from a GeneratedImageAssetSpec and optionally update presentation assets.",
      inputSchema: {
        assetSpec: anyObject,
        presentation: anyObject.optional(),
        outputDir: z.string().optional(),
        preferredGenerator: z.string().optional(),
        provider: z.enum(["openai", "bedrock", "local-file"]).optional(),
        model: z.string().optional(),
        timeoutMs: z.number().int().positive().optional(),
        retries: z.number().int().min(0).optional(),
        openaiApiKey: z.string().optional(),
        openaiBaseUrl: z.string().optional(),
        bedrockRegion: z.string().optional(),
        bedrockModelId: z.string().optional(),
        unsplashApiKey: z.string().optional(),
        pexelsApiKey: z.string().optional(),
        pixabayApiKey: z.string().optional(),
        workspaceRoot: z.string().optional(),
        allowOutsideWorkspace: z.boolean().optional(),
      },
    },
    async ({
      assetSpec,
      presentation,
      outputDir,
      preferredGenerator,
      provider,
      model,
      timeoutMs,
      retries,
      openaiApiKey,
      openaiBaseUrl,
      bedrockRegion,
      bedrockModelId,
      unsplashApiKey,
      pexelsApiKey,
      pixabayApiKey,
      workspaceRoot,
      allowOutsideWorkspace,
    }) => {
      try {
        const output = await generateImageHandler({
          assetSpec: assetSpec as never,
          presentation: presentation as never,
          outputDir,
          preferredGenerator,
          provider,
          model,
          timeoutMs,
          retries,
          openaiApiKey,
          openaiBaseUrl,
          bedrockRegion,
          bedrockModelId,
          unsplashApiKey,
          pexelsApiKey,
          pixabayApiKey,
          workspaceRoot: workspaceRoot ?? policy?.workspaceRoot,
          allowOutsideWorkspace: allowOutsideWorkspace ?? policy?.allowOutsideWorkspace,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_search_assets",
    {
      description: "Search external providers and return image candidates.",
      inputSchema: {
        query: z.string(),
        provider: z.enum(["unsplash", "pexels", "pixabay"]).optional(),
        limit: z.number().int().positive().optional(),
        unsplashApiKey: z.string().optional(),
        pexelsApiKey: z.string().optional(),
        pixabayApiKey: z.string().optional(),
      },
    },
    async ({ query, provider, limit, unsplashApiKey, pexelsApiKey, pixabayApiKey }) => {
      try {
        const output = await searchAssetsHandler({
          query,
          provider,
          limit,
          unsplashApiKey,
          pexelsApiKey,
          pixabayApiKey,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "presentation_attach_retrieved_asset",
    {
      description: "Retrieve/attach an external asset and update presentation assets.",
      inputSchema: {
        presentation: anyObject,
        assetSpec: anyObject,
        outputDir: z.string().optional(),
        unsplashApiKey: z.string().optional(),
        pexelsApiKey: z.string().optional(),
        pixabayApiKey: z.string().optional(),
        workspaceRoot: z.string().optional(),
        allowOutsideWorkspace: z.boolean().optional(),
      },
    },
    async ({
      presentation,
      assetSpec,
      outputDir,
      unsplashApiKey,
      pexelsApiKey,
      pixabayApiKey,
      workspaceRoot,
      allowOutsideWorkspace,
    }) => {
      try {
        const output = await attachRetrievedAssetHandler({
          presentation: presentation as never,
          assetSpec: assetSpec as never,
          outputDir,
          unsplashApiKey,
          pexelsApiKey,
          pixabayApiKey,
          workspaceRoot: workspaceRoot ?? policy?.workspaceRoot,
          allowOutsideWorkspace: allowOutsideWorkspace ?? policy?.allowOutsideWorkspace,
        });
        return toToolResult(output);
      } catch (error) {
        return toToolError(error);
      }
    },
  );
}

function toToolResult(payload: Record<string, unknown>): {
  content: [{ type: "text"; text: string }];
  structuredContent: Record<string, unknown>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
  };
}

function toToolError(error: unknown): {
  isError: true;
  content: [{ type: "text"; text: string }];
  structuredContent: {
    error_code: string;
    message: string;
    missing_fields?: string[];
  };
} {
  const message = error instanceof Error ? error.message : String(error);
  const parsed = parseErrorShape(message);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: parsed,
  };
}

function parseErrorShape(message: string): {
  error_code: string;
  message: string;
  missing_fields?: string[];
} {
  const missingFields = extractMissingFields(message);
  if (missingFields.length > 0) {
    return {
      error_code: "MISSING_REQUIRED_FIELDS",
      message,
      missing_fields: missingFields,
    };
  }

  if (message.includes("PATH_OUTSIDE_WORKSPACE")) {
    return {
      error_code: "PATH_POLICY_ERROR",
      message,
    };
  }

  if (message.includes("NLU_PARSE_ERROR")) {
    return {
      error_code: "NLU_PARSE_ERROR",
      message,
    };
  }

  if (message.includes("IMAGE_RETRIEVE_ERROR")) {
    return {
      error_code: "IMAGE_RETRIEVE_ERROR",
      message,
    };
  }

  return {
    error_code: "TOOL_EXECUTION_ERROR",
    message,
  };
}

function extractMissingFields(message: string): string[] {
  const fields = new Set<string>();

  const missingListMatch = message.match(/missing required fields:\s*([a-zA-Z0-9_,\-\s.]+)/i);
  if (missingListMatch?.[1]) {
    for (const raw of missingListMatch[1].split(",")) {
      const normalized = raw.trim();
      if (normalized.length > 0) {
        fields.add(normalized);
      }
    }
  }

  const simpleRequiredMatches = message.matchAll(/([a-zA-Z0-9_.-]+)\s+(?:is required|requires)/gi);
  for (const match of simpleRequiredMatches) {
    const name = match[1]?.trim();
    if (name) {
      fields.add(name);
    }
  }

  const providerKeyMap: Array<{ pattern: RegExp; field: string }> = [
    { pattern: /unsplashApiKey|UNSPLASH_ACCESS_KEY/, field: "unsplash_api_key" },
    { pattern: /pexelsApiKey|PEXELS_API_KEY/, field: "pexels_api_key" },
    { pattern: /pixabayApiKey|PIXABAY_API_KEY/, field: "pixabay_api_key" },
  ];
  for (const entry of providerKeyMap) {
    if (entry.pattern.test(message)) {
      fields.add(entry.field);
    }
  }

  return [...fields];
}
