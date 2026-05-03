# AgentCore Tool Usage Guide

`@agentra/presentation-author` exposes a `createPresentation()` function designed to be wrapped as an AgentCore / Strands tool.

## Architecture

```
AgentCore Runtime (Strands tool wrapper)
  └── createPresentation(input, deps)
        └── runPresentationAuthor()
              ├── LLM → generate JS script
              ├── node presentation.js → deck.pptx
              ├── diagnostics (render, overflow, fonts)
              └── revision (if diagnostics fail)
```

## Registration example (pseudo-code)

```ts
import { createPresentation } from "@agentra/presentation-author";
import type { CreatePresentationToolDeps } from "@agentra/presentation-author";

// Build deps with your LLM client
const deps: CreatePresentationToolDeps = {
  llm: {
    generateText: async ({ system, prompt }) => {
      // Call Bedrock / OpenAI / etc.
      return "...generated code...";
    },
  },
};

const createPresentationTool = {
  name: "create_presentation",
  description: "Create an editable PowerPoint deck from a user prompt.",
  inputSchema: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "What to create" },
      language: { type: "string", enum: ["ja", "en"] },
      diagnostics: { type: "boolean", default: true },
      revision: { type: "boolean", default: true },
    },
    required: ["prompt"],
  },
  execute: async (input) => createPresentation(input, deps),
};
```

## Key points

- This package provides the **tool function only**
- AgentCore Runtime should wrap it with the actual Strands tool API
- Runtime image must include: Node.js, Python 3, LibreOffice, poppler-utils, Japanese fonts
- `createPresentation()` never throws for normal generation failures — it returns structured `{ success: false, error }` output
- Router Agent / Slide Agent integration belongs to a later phase (PA-6+)

## Runtime requirements

| Dependency | Purpose |
|---|---|
| Node.js ≥ 22 | Script execution |
| Python 3 | render_slides.py, overflow/font checks |
| LibreOffice | PPTX → PDF → PNG conversion |
| poppler-utils | PDF → PNG (pdftoppm) |
| pptxgenjs | PPTX generation |
| Japanese fonts (Noto Sans JP, etc.) | CJK rendering |

## Output structure

`CreatePresentationToolOutput` includes:

- `success` — whether a PPTX was generated
- `summary` — one-line human-readable summary
- `pptxPath` — path to generated deck
- `artifacts` — list of all output files with existence checks
- `diagnosticsStatus` — pass / warn / fail
- `revisionAttempted` / `revisionSucceeded` — revision loop status
- `error` — structured error with `phase` and `message` (only on failure)
