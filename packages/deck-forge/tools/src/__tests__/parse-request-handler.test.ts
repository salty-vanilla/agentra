import { describe, expect, it } from "vitest";

import { parseRequestHandler, setIntentParser } from "#src/handlers/parse-request-handler.js";

describe("parseRequestHandler", () => {
  it("returns structured intent from configured parser", async () => {
    setIntentParser({
      parseCreate: async () => ({
        mode: "create",
        confidence: 0.95,
        goal: "Create executive proposal",
      }),
      parseModify: async () => ({
        mode: "modify",
        confidence: 0.95,
        modifyIntent: {
          changeRequest: "Update chart",
          operations: [],
        },
      }),
    });

    const result = await parseRequestHandler({
      mode: "create",
      userRequest: "create deck",
    });

    expect(result.intent.mode).toBe("create");
    expect(result.intent.confidence).toBe(0.95);
  });

  it("throws when parser is not configured", async () => {
    setIntentParser(undefined);
    await expect(
      parseRequestHandler({
        mode: "create",
        userRequest: "create deck",
      }),
    ).rejects.toThrow("NLU_PARSE_ERROR");
  });
});
