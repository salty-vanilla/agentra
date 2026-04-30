# Deck Forge Runtime

AgentCore Runtime app for invoking `DeckForgeRunner`.

## Deck Forge dependency

`@deck-forge/runner@0.1.0` is published to npm and should be consumed directly.
It is the generated bundled runner distribution for the `deck-forge` source
monorepo.

This app depends on the published package exactly:

```json
{
  "@deck-forge/runner": "0.1.0"
}
```

The source monorepo still lives in `salty-vanilla/deck-forge`; this package is
the deployable bridge that `agentra` consumes.

## Image assets

- `PEXELS_API_KEY` enables retrieved-image assets.
- `PEXELS_API_KEY_SECRET_ID` can be used in AWS to load the key from Secrets Manager.
- `AWS_REGION` or `BEDROCK_REGION` enables Bedrock image generation.
- `DECK_FORGE_BEDROCK_IMAGE_MODEL_ID` selects the Bedrock image model.
- Default model is `amazon.nova-canvas-v1:0`.
- To use Stability, set the model id to a supported Bedrock Stability model such as
  `stability.stable-image-core-v1:0` or `stability.stable-image-ultra-v1:0`.

`acquisitionMode` defaults to `generate` in Agentra so the runtime does not rely
on Deck Forge 0.1.0's retrieved-image provider default. Pexels-first retrieval
requires a Deck Forge release that threads `imageProvider: "pexels"` through the
runner/core asset plan.

## Artifacts

- `DECK_FORGE_ARTIFACT_BUCKET` enables S3 publishing for generated PPTX files.
- `DECK_FORGE_ARTIFACT_PREFIX` controls the object key prefix and defaults to
  `deck-forge/`.
- Responses include `localPath` for runtime debugging and `s3Uri` /
  `presignedUrl` when S3 publishing is configured.
