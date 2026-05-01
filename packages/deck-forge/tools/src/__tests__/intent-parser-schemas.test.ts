import type {
  AssetSpec,
  ContentBlock,
  DeckPlan,
  PresentationBrief,
  SlideSpec,
} from "@deck-forge/core";
import { describe, expect, it } from "vitest";
import {
  ASSET_SPEC_JSON_SCHEMA,
  BRIEF_JSON_SCHEMA,
  CONTENT_BLOCK_JSON_SCHEMA,
  DECK_PLAN_JSON_SCHEMA,
  SLIDE_SPEC_JSON_SCHEMA,
  validateAgentCreateArtifacts,
  validateBrief,
  validateDeckPlan,
  validateSlideSpec,
} from "#src/index.js";
import type { StructuredIntent } from "#src/types.js";

const validBrief: PresentationBrief = {
  id: "brief-1",
  title: "Manufacturing AI PoC",
  audience: { primary: "executives", expertiseLevel: "executive" },
  goal: {
    type: "proposal",
    mainMessage: "Approve a 90-day AI pilot",
    desiredOutcome: "Executive go/no-go on $180K budget",
  },
  tone: { formality: "executive", energy: "confident", technicalDepth: "low" },
  narrative: {
    structure: "proposal",
    arc: [{ role: "hook", message: "12% OEE gap is recoverable" }],
  },
  output: { formats: ["pptx"], aspectRatio: "16:9", language: "en" },
  constraints: { slideCount: 1 },
  visualDirection: { style: "corporate", mood: "trustworthy" },
};

const validDeckPlan: DeckPlan = {
  id: "deck-1",
  briefId: "brief-1",
  title: "Manufacturing AI PoC",
  slideCountTarget: 1,
  globalStoryline: "Problem → Pilot → Decision",
  sections: [
    {
      id: "sec-1",
      title: "Decision",
      role: "proposal",
      slides: [
        {
          id: "slide-1",
          title: "Approve Pilot",
          intent: {
            type: "proposal",
            keyMessage: "Approve a 90-day AI pilot",
            audienceTakeaway: "Vote to fund the pilot",
          },
          expectedLayout: "single_column",
          contentRequirements: [
            {
              id: "req-1",
              description: "Headline budget number",
              priority: "high",
            },
          ],
        },
      ],
    },
  ],
};

const validSlide: SlideSpec = {
  id: "slide-1",
  title: "Approve the AI Pilot",
  intent: {
    type: "proposal",
    keyMessage: "Approve a 90-day AI pilot for $180K",
    audienceTakeaway: "Vote to fund the pilot",
  },
  layout: { type: "single_column", density: "medium" },
  content: [
    {
      id: "block-1",
      type: "paragraph",
      text: "We propose a 90-day pilot in Plant 4, budget $180K, target +12% OEE.",
    },
  ],
};

const validIntent: StructuredIntent = {
  mode: "create",
  confidence: 0.9,
  slideCount: 1,
  grounding: { language: "en" },
  createArtifacts: {
    brief: validBrief,
    deckPlan: validDeckPlan,
    slideSpecs: [validSlide],
  },
};

describe("JSON schema constants", () => {
  it.each([
    ["BRIEF_JSON_SCHEMA", BRIEF_JSON_SCHEMA],
    ["DECK_PLAN_JSON_SCHEMA", DECK_PLAN_JSON_SCHEMA],
    ["SLIDE_SPEC_JSON_SCHEMA", SLIDE_SPEC_JSON_SCHEMA],
    ["CONTENT_BLOCK_JSON_SCHEMA", CONTENT_BLOCK_JSON_SCHEMA],
    ["ASSET_SPEC_JSON_SCHEMA", ASSET_SPEC_JSON_SCHEMA],
  ])("%s is a usable draft-7 JSON schema", (_name, schema) => {
    expect(schema).toBeTypeOf("object");
    expect(schema.$schema).toContain("draft-07");
  });

  it("exposes a discriminated union for ContentBlock", () => {
    // Zod v4 emits `oneOf` for discriminated unions targeting draft-7.
    const variants =
      (CONTENT_BLOCK_JSON_SCHEMA.oneOf as unknown[] | undefined) ??
      (CONTENT_BLOCK_JSON_SCHEMA.anyOf as unknown[] | undefined);
    expect(Array.isArray(variants)).toBe(true);
    expect((variants ?? []).length).toBeGreaterThan(1);
  });

  it("exposes a discriminated union for AssetSpec", () => {
    const variants =
      (ASSET_SPEC_JSON_SCHEMA.oneOf as unknown[] | undefined) ??
      (ASSET_SPEC_JSON_SCHEMA.anyOf as unknown[] | undefined);
    expect(Array.isArray(variants)).toBe(true);
    expect((variants ?? []).length).toBeGreaterThan(1);
  });

  it("describes Brief with required fields", () => {
    expect(BRIEF_JSON_SCHEMA.type).toBe("object");
    expect(BRIEF_JSON_SCHEMA.required).toEqual(
      expect.arrayContaining(["id", "title", "audience", "goal"]),
    );
  });
});

describe("validateBrief", () => {
  it("returns valid for a well-formed brief", () => {
    expect(validateBrief(validBrief)).toEqual({ valid: true, issues: [] });
  });

  it("flags missing required fields without throwing", () => {
    const result = validateBrief({ ...validBrief, audience: undefined });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.startsWith("brief"))).toBe(true);
  });

  it("flags language mismatch", () => {
    const result = validateBrief(validBrief, { expectedLanguage: "ja" });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("language"))).toBe(true);
  });
});

describe("validateDeckPlan", () => {
  it("returns valid for a well-formed plan", () => {
    expect(validateDeckPlan(validDeckPlan)).toEqual({ valid: true, issues: [] });
  });

  it("flags missing slide ids in cross-check", () => {
    const result = validateDeckPlan(validDeckPlan, {
      slideIds: ["slide-1", "slide-missing"],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("slide-missing"))).toBe(true);
  });

  it("flags slide-count mismatch", () => {
    const result = validateDeckPlan(validDeckPlan, { expectedSlideCount: 3 });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("slide count mismatch"))).toBe(true);
  });
});

describe("validateSlideSpec", () => {
  it("returns valid for a well-formed slide", () => {
    expect(validateSlideSpec(validSlide)).toEqual({ valid: true, issues: [] });
  });

  it("flags an empty content array", () => {
    const result = validateSlideSpec({ ...validSlide, content: [] });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("no content"))).toBe(true);
  });

  it("flags must-include misses without throwing", () => {
    const result = validateSlideSpec(validSlide, {
      mustInclude: ["completely-absent-token"],
    });
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("completely-absent-token"))).toBe(true);
  });

  it("flags generic filler patterns by default", () => {
    const filler: SlideSpec = {
      ...validSlide,
      content: [
        {
          id: "block-filler",
          type: "paragraph",
          text: "Proposal Point: more details to come.",
        } as ContentBlock,
      ],
    };
    const result = validateSlideSpec(filler);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("Proposal Point"))).toBe(true);
  });

  it("validates each ContentBlock variant", () => {
    const variants: ContentBlock[] = [
      { id: "b1", type: "paragraph", text: "ok" },
      {
        id: "b2",
        type: "bullet_list",
        items: [{ text: "first" }, { text: "second" }],
      },
      {
        id: "b3",
        type: "metric",
        label: "OEE",
        value: "82",
        unit: "%",
      },
    ];
    const result = validateSlideSpec({ ...validSlide, content: variants });
    expect(result.valid).toBe(true);
  });
});

describe("validateAgentCreateArtifacts (non-throwing)", () => {
  it("returns valid + artifacts for a sound intent", () => {
    const result = validateAgentCreateArtifacts({
      userRequest: "Build me a manufacturing AI proposal deck.",
      intent: validIntent,
    });
    expect(result.valid).toBe(true);
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts?.slideSpecs).toHaveLength(1);
  });

  it("returns invalid (no artifacts) when createArtifacts is missing", () => {
    const result = validateAgentCreateArtifacts({
      userRequest: "x",
      intent: { ...validIntent, createArtifacts: undefined },
    });
    expect(result.valid).toBe(false);
    expect(result.artifacts).toBeUndefined();
    expect(result.issues[0]).toContain("createArtifacts");
  });

  it("aggregates issues from multiple stages without throwing", () => {
    const result = validateAgentCreateArtifacts({
      userRequest: "x",
      intent: {
        ...validIntent,
        slideCount: 5,
        createArtifacts: {
          brief: validBrief,
          deckPlan: validDeckPlan,
          slideSpecs: [{ ...validSlide, title: "" }],
        },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(1);
  });

  it("exports AssetSpec type without runtime use (compile check)", () => {
    const asset: AssetSpec = {
      id: "a1",
      type: "icon",
      name: "rocket",
    };
    expect(asset.type).toBe("icon");
  });
});
