import type { DeckPlan, PresentationBrief } from "@deck-forge/core";
import { describe, expect, it } from "vitest";
import {
  getBriefGenerationPrompt,
  getDeckPlanGenerationPrompt,
  getSlideSpecGenerationPrompt,
} from "#src/index.js";

const brief: PresentationBrief = {
  id: "brief-1",
  title: "Manufacturing AI PoC",
  audience: { primary: "executives", expertiseLevel: "executive" },
  goal: {
    type: "proposal",
    mainMessage: "Approve a 90-day AI pilot",
    desiredOutcome: "Executive go/no-go",
  },
  tone: { formality: "executive", energy: "confident", technicalDepth: "low" },
  narrative: { structure: "proposal", arc: [] },
  output: { formats: ["pptx"], aspectRatio: "16:9", language: "en" },
  constraints: { slideCount: 5 },
  visualDirection: { style: "corporate", mood: "trustworthy" },
};

const deckPlan: DeckPlan = {
  id: "deck-1",
  briefId: "brief-1",
  title: "Manufacturing AI PoC",
  slideCountTarget: 1,
  globalStoryline: "Problem → Pilot",
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
            keyMessage: "Approve the pilot",
            audienceTakeaway: "Vote yes",
          },
          expectedLayout: "single_column",
          contentRequirements: [],
        },
      ],
    },
  ],
};

describe("intent-parser prompts", () => {
  it("brief prompt includes goal and audience and English rules", () => {
    const prompt = getBriefGenerationPrompt({
      goal: "Make the AI proposal deck",
      audience: "Plant managers",
      language: "en",
    });
    expect(prompt).toContain("Make the AI proposal deck");
    expect(prompt).toContain("Plant managers");
    expect(prompt).toContain("PresentationBrief");
  });

  it("brief prompt switches to Japanese when language=ja", () => {
    const prompt = getBriefGenerationPrompt({
      goal: "AI提案資料",
      language: "ja",
    });
    expect(prompt).toContain("AI提案資料");
    expect(prompt).toContain("PresentationBrief");
    expect(prompt).toMatch(/共通ルール|プレゼン/);
  });

  it("deck-plan prompt summarizes brief title, goal, audience", () => {
    const prompt = getDeckPlanGenerationPrompt({ brief });
    expect(prompt).toContain("Manufacturing AI PoC");
    expect(prompt).toContain("Approve a 90-day AI pilot");
    expect(prompt).toContain("executives");
    expect(prompt).toContain("Target slide count: 5");
  });

  it("slide-spec prompt locates the targeted slide in the deckPlan", () => {
    const prompt = getSlideSpecGenerationPrompt({
      brief,
      deckPlan,
      slideId: "slide-1",
    });
    expect(prompt).toContain("slide-1");
    expect(prompt).toContain("Approve Pilot");
    expect(prompt).toContain("Section: Decision");
  });

  it("slide-spec prompt degrades gracefully for an unknown id", () => {
    const prompt = getSlideSpecGenerationPrompt({
      brief,
      deckPlan,
      slideId: "ghost",
    });
    expect(prompt).toContain("ghost");
    expect(prompt).toContain("not found in deckPlan");
  });
});
