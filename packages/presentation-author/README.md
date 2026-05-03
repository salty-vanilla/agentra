# @agentra/presentation-author

Practical PPTX authoring runtime inspired by the OpenAI slides skill workflow.

## How it works

```
User prompt → LLM generates PptxGenJS code → execute with Node.js → deck.pptx
```

1. Build an authoring prompt from user input
2. Send to an LLM to get a complete PptxGenJS Node.js script
3. Validate the script for safety (no shell, no destructive fs ops)
4. Execute `node presentation.js` in a self-contained workspace
5. Return the path to the generated `deck.pptx`

## Workspace layout

Each run creates a self-contained workspace (helpers/scripts are copied from `vendor/openai-slides/`):

```
{workDir}/
  presentation.js          # LLM-generated authoring script
  deck.pptx                # Output
  package.json             # CJS module config
  helpers/
    pptxgenjs_helpers/     # Text, image, layout helpers
      index.js
      text.js
      image.js
      layout.js
      layout_builders.js
      ...
  scripts/                 # Python scripts (PA-3+)
    render_slides.py
    create_montage.py
    slides_test.py
    detect_font.py
    ensure_raster_image.py
  rendered/                # Slide PNGs (PA-3+)
  artifacts/               # Additional outputs
```

## Helper usage

Generated scripts import helpers locally:

```js
const pptxgen = require("pptxgenjs");
const {
  autoFontSize,
  calcTextBox,
  imageSizingCrop,
  imageSizingContain,
  warnIfSlideHasOverlaps,
  warnIfSlideElementsOutOfBounds,
} = require("./helpers/pptxgenjs_helpers");
```

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

## Diagnostics (PA-3)

After generating a PPTX, run render, contact-sheet, overflow validation, and font detection:

```ts
import { runPresentationAuthor } from "@agentra/presentation-author";

const result = await runPresentationAuthor(
  {
    prompt: "売上報告Q4のプレゼンを作成してください",
    language: "ja",
    diagnostics: { render: true, contactSheet: true, overflow: true, fonts: false },
  },
  { llm: myLlmClient },
);

console.log(result.diagnostics?.status); // 'pass' | 'warn' | 'fail'
```

Or use the low-level wrappers directly:

```ts
import {
  renderPresentation,
  createContactSheet,
  validatePresentationOverflow,
  detectPresentationFonts,
  runPresentationDiagnostics,
} from "@agentra/presentation-author";
```

### Python / OS dependencies

Install the Python packages:

```bash
pip install -r packages/presentation-author/python/requirements.txt
```

Required OS tools:
- LibreOffice (soffice) — PPTX→PDF conversion
- poppler-utils (pdftoppm) — PDF→PNG rasterization
- fontconfig (fc-list) — font detection
- Optional: inkscape, imagemagick, ghostscript, libheif-examples

## Single revision attempt (PA-4 Lite)

When `revision: true`, the runner asks the LLM for one revised script if diagnostics return `warn` or `fail`:

```ts
const result = await runPresentationAuthor(
  {
    prompt: "製造ライン #4 のQ2報告資料を作成してください",
    language: "ja",
    diagnostics: true,
    revision: true,
  },
  deps,
);

console.log(result.revision?.reason);
// 'diagnostics-pass' | 'revision-succeeded' | 'revision-execution-failed' | ...
```

- Revision runs at most once.
- Revision only triggers when diagnostics status is `warn` or `fail`.
- If revision fails, the initial deck is returned with warnings.
- No scoring, no multi-pass quality engine.
- The revised `presentation.js` and `deck.pptx` replace the root files only on success.

## Status

- **PA-1**: Minimal script execution path
- **PA-2**: Self-contained workspace with helpers and scripts
- **PA-3**: Render, contact sheet, overflow validation, font detection, diagnostics
- **PA-4 Lite**: Single diagnostics-driven revision attempt (current)
- AgentCore integration and visual review will be added in later phases
- The DeckForge typed strategy engine is frozen (`deck-forge-typed-engine-freeze-v0`) and not part of this package
