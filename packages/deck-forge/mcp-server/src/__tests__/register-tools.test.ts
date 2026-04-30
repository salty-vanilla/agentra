import { describe, expect, it } from "vitest";

import { registerTools } from "../register-tools.js";

type RegisteredToolHandler = (input: Record<string, unknown>) => Promise<{
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
  structuredContent?: Record<string, unknown>;
}>;

type RegisteredTool = {
  name: string;
  handler: RegisteredToolHandler;
};

describe("registerTools", () => {
  it("passes acquisitionMode to presentation_generate_asset_plan", async () => {
    const tools = collectTools();
    const tool = tools.find((item) => item.name === "presentation_generate_asset_plan");
    if (!tool) {
      throw new Error("presentation_generate_asset_plan not registered");
    }

    const result = await tool.handler({
      brief: {
        id: "brief-1",
        title: "Factory deck",
        audience: { primary: "leaders", expertiseLevel: "executive" },
        goal: { type: "proposal", mainMessage: "Modernize", desiredOutcome: "Approve" },
        tone: { style: "executive", formality: "formal", stance: "confident" },
        narrative: {
          structure: "proposal",
          arc: [{ role: "hook", message: "why now" }],
        },
        output: { formats: ["pptx"], aspectRatio: "16:9", language: "en" },
        constraints: { slideCount: 3 },
        visualDirection: { style: "minimal", mood: "calm" },
      },
      slideSpecs: [
        {
          id: "slide-1",
          title: "Hero",
          intent: {
            type: "proposal",
            keyMessage: "Move fast",
            audienceTakeaway: "Clear value",
          },
          layout: { type: "hero", density: "low", emphasis: "visual" },
          content: [{ id: "title-1", type: "title", text: "Move fast" }],
        },
      ],
      acquisitionMode: "retrieve",
    });

    expect(result.isError).not.toBe(true);
    const payload = result.structuredContent ?? JSON.parse(result.content[0]?.text ?? "{}");
    expect(payload.assetSpecs?.[0]?.type).toBe("retrieved_image");
  });

  it("returns tool error for search without provider key", async () => {
    const tools = collectTools();
    const tool = tools.find((item) => item.name === "presentation_search_assets");
    if (!tool) {
      throw new Error("presentation_search_assets not registered");
    }

    const result = await tool.handler({
      query: "factory automation",
      provider: "unsplash",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain("unsplashApiKey or UNSPLASH_ACCESS_KEY");
    expect(result.structuredContent?.error_code).toBe("MISSING_REQUIRED_FIELDS");
    expect(result.structuredContent?.missing_fields).toContain("unsplash_api_key");
  });
});

function collectTools(): RegisteredTool[] {
  const tools: RegisteredTool[] = [];
  const server = {
    registerTool: (
      name: string,
      _config: unknown,
      handler: (input: Record<string, unknown>) => Promise<unknown>,
    ) => {
      tools.push({
        name,
        handler: async (input) =>
          (await handler(input)) as {
            isError?: boolean;
            content: Array<{ type: string; text: string }>;
            structuredContent?: Record<string, unknown>;
          },
      });
    },
  };

  registerTools(server as never);
  return tools;
}
