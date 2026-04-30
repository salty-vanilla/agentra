import type { ToolDefinition } from "#src/types.js";

export const presentationTools: ToolDefinition[] = [
  {
    name: "presentation_create_spec",
    description:
      "Create a scaffold presentation brief from a user request. For production decks, an Agent should provide grounded createArtifacts.",
    inputSchema: {
      type: "object",
      properties: {
        userRequest: { type: "string" },
        audience: { type: "string" },
        goal: { type: "string" },
        slideCount: { type: "number" },
        tone: { type: "string" },
        outputFormat: { type: "string", enum: ["pptx", "pdf", "html", "json"] },
      },
      required: ["userRequest"],
    },
  },
  {
    name: "presentation_generate_deck_plan",
    description:
      "Generate a scaffold deck plan from a presentation brief. This is a helper, not a substitute for Agent planning.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "object" },
      },
      required: ["brief"],
    },
  },
  {
    name: "presentation_generate_slide_specs",
    description:
      "Generate scaffold slide specs from brief and deck plan. For production decks, prefer Agent-authored slideSpecs.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "object" },
        deckPlan: { type: "object" },
      },
      required: ["brief", "deckPlan"],
    },
  },
  {
    name: "presentation_component_preflight",
    description: "Analyze slide specs against persistent component catalog and return gaps.",
    inputSchema: {
      type: "object",
      properties: {
        slideSpecs: { type: "array", items: { type: "object" } },
        componentsDir: { type: "string" },
      },
      required: ["slideSpecs"],
    },
  },
  {
    name: "presentation_component_synthesize",
    description: "Create missing component specs from slide specs and persist them.",
    inputSchema: {
      type: "object",
      properties: {
        slideSpecs: { type: "array", items: { type: "object" } },
        componentsDir: { type: "string" },
      },
      required: ["slideSpecs"],
    },
  },
  {
    name: "presentation_component_list",
    description: "List persistent component catalog entries.",
    inputSchema: {
      type: "object",
      properties: {
        componentsDir: { type: "string" },
      },
      required: [],
    },
  },
  {
    name: "presentation_generate_asset_plan",
    description: "Generate asset specs from brief and slide specs.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "object" },
        slideSpecs: { type: "array", items: { type: "object" } },
        acquisitionMode: { type: "string", enum: ["generate", "retrieve", "auto"] },
        imageProvider: { type: "string", enum: ["pexels", "unsplash", "pixabay"] },
      },
      required: ["brief", "slideSpecs"],
    },
  },
  {
    name: "presentation_build_ir",
    description: "Build PresentationIR from spec artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        brief: { type: "object" },
        deckPlan: { type: "object" },
        slideSpecs: { type: "array", items: { type: "object" } },
        assetSpecs: { type: "array", items: { type: "object" } },
        id: { type: "string" },
        version: { type: "string" },
        title: { type: "string" },
        theme: { type: "object" },
        meta: { type: "object" },
      },
      required: ["brief", "deckPlan", "slideSpecs", "assetSpecs"],
    },
  },
  {
    name: "presentation_apply_operations",
    description: "Apply operation list to presentation IR and return updated presentation.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        operations: { type: "array", items: { type: "object" } },
      },
      required: ["presentation", "operations"],
    },
  },
  {
    name: "presentation_review",
    description: "Review a presentation and return actionable issues.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        report: { type: "object" },
        goal: { type: "string" },
        packet: { type: "object" },
      },
      required: ["presentation"],
    },
  },
  {
    name: "presentation_plan_operations",
    description: "Plan presentation operations from review issues.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        issues: { type: "array", items: { type: "object" } },
        goal: { type: "string" },
      },
      required: ["presentation", "issues"],
    },
  },
  {
    name: "presentation_design_pass",
    description:
      "Run a SlideDesigner over the presentation (or a single slide) to refine typography, hierarchy and emphasis. Returns the updated presentation, the operations applied, and per-slide rationales.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        slideId: { type: "string" },
        options: {
          type: "object",
          properties: {
            focus: {
              type: "array",
              items: {
                type: "string",
                enum: ["layout", "typography", "color", "hierarchy", "decoration"],
              },
            },
            maxOperations: { type: "number" },
          },
        },
      },
      required: ["presentation"],
    },
  },
  {
    name: "presentation_visual_review",
    description:
      "Run a VisualReviewer over a presentation (and optional pre-rendered slide images). Returns findings + suggested operations. Operations are NOT auto-applied; pipe them through presentation_apply_operations to materialize.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        slideImages: { type: "array", items: { type: "object" } },
        focus: {
          type: "array",
          items: {
            type: "string",
            enum: ["overlap", "hierarchy", "color", "typography", "decoration", "balance"],
          },
        },
      },
      required: ["presentation"],
    },
  },
  {
    name: "presentation_add_chart",
    description: "Add a chart element to a target slide.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        operation: { type: "object" },
      },
      required: ["presentation", "operation"],
    },
  },
  {
    name: "presentation_update_chart_data",
    description: "Update data/encoding/chartType of an existing chart element.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        operation: { type: "object" },
      },
      required: ["presentation", "operation"],
    },
  },
  {
    name: "presentation_inspect",
    description: "Inspect presentation with include filters and optional anchor target.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        query: { type: "object" },
      },
      required: ["presentation", "query"],
    },
  },
  {
    name: "presentation_validate",
    description: "Validate presentation and return ValidationReport.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        level: { type: "string", enum: ["basic", "strict", "export"] },
      },
      required: ["presentation"],
    },
  },
  {
    name: "presentation_build_review_packet",
    description:
      "Build a standardized review packet for an Agent/LLM/VLM reviewer, optionally including rendered slide images.",
    inputSchema: {
      type: "object",
      properties: {
        userRequest: { type: "string" },
        presentation: { type: "object" },
        validationReport: { type: "object" },
        grounding: { type: "object" },
        renderImages: { type: "boolean" },
        slideIds: { type: "array", items: { type: "string" } },
        imageFormat: { type: "string", enum: ["png", "jpeg"] },
        imageScale: { type: "number" },
      },
      required: ["userRequest", "presentation"],
    },
  },
  {
    name: "presentation_export",
    description: "Export presentation to json/pptx/html/pdf.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        format: { type: "string", enum: ["json", "pptx", "html", "pdf"] },
        outputPath: { type: "string" },
        workspaceRoot: { type: "string" },
        allowOutsideWorkspace: { type: "boolean" },
      },
      required: ["presentation", "format"],
    },
  },
  {
    name: "presentation_export_slide_images",
    description: "Render presentation slides to PNG/JPEG images for Agent/LLM/VLM review.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        format: { type: "string", enum: ["png", "jpeg"] },
        slideIds: { type: "array", items: { type: "string" } },
        scale: { type: "number" },
        outputDir: { type: "string" },
        workspaceRoot: { type: "string" },
        allowOutsideWorkspace: { type: "boolean" },
      },
      required: ["presentation"],
    },
  },
  {
    name: "presentation_generate_image",
    description:
      "Generate an image asset from a GeneratedImageAssetSpec and optionally update presentation assets.",
    inputSchema: {
      type: "object",
      properties: {
        assetSpec: { type: "object" },
        presentation: { type: "object" },
        outputDir: { type: "string" },
        preferredGenerator: { type: "string" },
        provider: { type: "string", enum: ["openai", "bedrock", "local-file"] },
        model: { type: "string" },
        timeoutMs: { type: "number" },
        retries: { type: "number" },
        openaiApiKey: { type: "string" },
        openaiBaseUrl: { type: "string" },
        bedrockRegion: { type: "string" },
        bedrockModelId: { type: "string" },
        unsplashApiKey: { type: "string" },
        pexelsApiKey: { type: "string" },
        pixabayApiKey: { type: "string" },
        workspaceRoot: { type: "string" },
        allowOutsideWorkspace: { type: "boolean" },
      },
      required: ["assetSpec"],
    },
  },
  {
    name: "presentation_search_assets",
    description: "Search external image providers and return reusable candidates.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        provider: { type: "string", enum: ["unsplash", "pexels", "pixabay"] },
        limit: { type: "number" },
        unsplashApiKey: { type: "string" },
        pexelsApiKey: { type: "string" },
        pixabayApiKey: { type: "string" },
      },
      required: ["query"],
    },
  },
  {
    name: "presentation_attach_retrieved_asset",
    description: "Retrieve and attach an external/retrieved asset into presentation assets.",
    inputSchema: {
      type: "object",
      properties: {
        presentation: { type: "object" },
        assetSpec: { type: "object" },
        outputDir: { type: "string" },
        unsplashApiKey: { type: "string" },
        pexelsApiKey: { type: "string" },
        pixabayApiKey: { type: "string" },
        workspaceRoot: { type: "string" },
        allowOutsideWorkspace: { type: "boolean" },
      },
      required: ["presentation", "assetSpec"],
    },
  },
];
