# Deck Forge Runtime

AgentCore Runtime app for invoking `DeckForgeRunner` from `@deck-forge/runner@0.2.0`.

## Deck Forge dependency

`@deck-forge/core`, `@deck-forge/tools`, and `@deck-forge/runner` at `^0.2.0`
are consumed from npm. The source monorepo lives in `salty-vanilla/deck-forge`.

v0.2.0 uses Node-compatible `#src/*` package imports internally, so the
`#/` import patch script from v0.1.0 has been removed.

## Create mode

Create mode uses a Bedrock-backed `IntentParser` that calls a text model
(default Claude Sonnet 4) to produce `createArtifacts` (brief, deckPlan,
slideSpecs, assetPlan) directly from the user request.

- `DECK_FORGE_BEDROCK_TEXT_MODEL_ID` selects the Bedrock text model for intent
  parsing, review, and operation planning. Defaults to
  `anthropic.claude-sonnet-4-20250514-v1:0`.

## AI review

When `revisionPolicy` is `ai_review`, a Bedrock-backed reviewer and operation
planner are wired in. The `reviewTrigger` field (default `warnings`) controls
when AI review runs: `errors`, `warnings`, or `always`.

## Slide images

`renderSlideImages: true` in the request enables Playwright-based slide image
rendering via `HtmlSlideImageRenderer`. The Dockerfile uses a Playwright base
image with Chromium pre-installed.

## Image assets

- `PEXELS_API_KEY` enables retrieved-image assets.
- `PEXELS_API_KEY_SECRET_ID` can be used in AWS to load the key from Secrets Manager.
- `AWS_REGION` or `BEDROCK_REGION` enables Bedrock image generation.
- `DECK_FORGE_BEDROCK_IMAGE_MODEL_ID` selects the Bedrock image model.
- Default model is `amazon.nova-canvas-v1:0`.
- To use Stability, set the model id to a supported Bedrock Stability model such as
  `stability.stable-image-core-v1:0` or `stability.stable-image-ultra-v1:0`.

## Artifacts

- `DECK_FORGE_ARTIFACT_BUCKET` enables S3 publishing for generated PPTX files.
- `DECK_FORGE_ARTIFACT_PREFIX` controls the object key prefix and defaults to
  `deck-forge/`.
- Responses include `localPath` for runtime debugging and `s3Uri` /
  `presignedUrl` when S3 publishing is configured.
