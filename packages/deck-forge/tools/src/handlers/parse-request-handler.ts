import type { IntentParser, ParseRequestInput, ParseRequestOutput } from "#src/types.js";

let intentParser: IntentParser | undefined;

export function setIntentParser(parser: IntentParser | undefined): void {
  intentParser = parser;
}

export function getIntentParser(): IntentParser | undefined {
  return intentParser;
}

export async function parseRequestHandler(input: ParseRequestInput): Promise<ParseRequestOutput> {
  const parser = intentParser;
  if (!parser) {
    throw new Error("NLU_PARSE_ERROR: IntentParser is not configured.");
  }

  const intent =
    input.mode === "create"
      ? await parser.parseCreate({ userRequest: input.userRequest })
      : await parser.parseModify({
          userRequest: input.userRequest,
          inspectSummary: input.inspectSummary,
        });

  return { intent };
}
