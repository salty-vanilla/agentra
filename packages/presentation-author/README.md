# @agentra/presentation-author

Practical PPTX authoring runtime inspired by the OpenAI slides skill workflow.

## How it works

```
User prompt → LLM generates PptxGenJS code → execute with Node.js → deck.pptx
```

1. Build an authoring prompt from user input
2. Send to an LLM to get a complete PptxGenJS Node.js script
3. Validate the script for safety (no shell, no destructive fs ops)
4. Execute `node presentation.js` in a task-local workspace
5. Return the path to the generated `deck.pptx`

## Usage

```ts
import { runPresentationAuthor } from "@agentra/presentation-author";

const result = await runPresentationAuthor(
  { prompt: "売上報告Q4のプレゼンを作成してください", language: "ja" },
  {
    llm: {
      generateText: async ({ prompt }) => {
        // call your LLM here
        return llmGeneratedJavaScript;
      },
    },
  },
);

console.log(result.pptxPath); // /tmp/presentation-author/<id>/deck.pptx
```

## Status

- **PA-1**: Minimal script execution path (current)
- Rendering, validation, revision loops, and AgentCore integration will be added in later phases
- The DeckForge typed strategy engine is frozen (`deck-forge-typed-engine-freeze-v0`) and not part of this package
