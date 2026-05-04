# @agentra/presentation-author-runtime

Minimal Slide Agent runtime that exposes `create_presentation` as a Strands tool, backed by `@agentra/presentation-author`.

## What PA-6 adds

- `create_presentation` Strands-compatible tool
- Minimal Slide Agent with font policy system prompt
- Runtime Dockerfile with OS/Python dependencies
- LLM adapter (Bedrock Claude)
- Local dogfood command

## Architecture

```
Slide Agent (Strands)
  └── create_presentation tool
        └── createPresentation() (from @agentra/presentation-author)
              ├── LLM → generate PptxGenJS script
              ├── node presentation.js → deck.pptx
              ├── diagnostics (render, overflow, fonts)
              └── revision (if diagnostics fail)
```

## Runtime dependencies

### Node

- `@agentra/presentation-author` (workspace)
- `@aws-sdk/client-bedrock-runtime`
- `@strands-agents/sdk`
- `pptxgenjs` (transitive)

### Python

```
pdf2image
Pillow
python-pptx
numpy
```

Install:

```bash
pip install -r packages/presentation-author/python/requirements.txt
```

### OS packages (Docker)

```
libreoffice
poppler-utils
fontconfig
fonts-noto-cjk
python3 + python3-pip + python3-venv
```

### Font policy

| Preset | Japanese | Latin | Use case |
|---|---|---|---|
| standard | BIZ UDPGothic | Arial | General business |
| readable | BIZ UDGothic | Verdana | Text-heavy |
| product-lp | BIZ UDPGothic | Trebuchet MS | Product intro |
| research-elegant | BIZ UDPMincho | Georgia | Research/formal |
| table-numeric | BIZ UDGothic | Arial | Tables/numbers |

Default: `standard`. Falls back to Noto Sans CJK JP if BIZ fonts are not installed.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PRESENTATION_AUTHOR_MODEL_ID` | `global.anthropic.claude-sonnet-4-6` | LLM for script generation |
| `AWS_REGION` | `us-east-1` | Bedrock region |
| `BEDROCK_MODEL_ID` | `global.anthropic.claude-sonnet-4-6` | Slide Agent model |
| `PRESENTATION_AUTHOR_OUTPUT_DIR` | (temp dir) | Output directory |
| `PRESENTATION_AUTHOR_ENABLE_DIAGNOSTICS` | `true` | Enable diagnostics |
| `PRESENTATION_AUTHOR_ENABLE_REVISION` | `true` | Enable revision |

## Running locally

```bash
# Install workspace deps
pnpm install

# Install Python deps (for diagnostics)
pip install -r packages/presentation-author/python/requirements.txt

# Run dogfood
pnpm --filter @agentra/presentation-author-runtime dogfood:presentation
```

## Docker build

```bash
docker build -f apps/presentation-author-runtime/Dockerfile .
```

## Known limitations

- No Router Agent — this is a dedicated Slide Agent only
- No Agent Registry Skill packaging
- No template analysis (`templatePath` accepted but unused)
- No image generation or icon provider
- No VLM visual review
- Artifact paths are local filesystem only (no S3 upload)
- BIZ fonts may fall back to Noto CJK unless bundled in the image
- `skia-canvas` helpers (`autoFontSize`, `calcTextBox`) unavailable; prompts use heuristic sizing
