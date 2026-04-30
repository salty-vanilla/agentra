# Slide Image Review

Deck Forge exposes slide images as review material for external Agent, LLM, and VLM reviewers.

## Runtime contract

- `SlideImageRenderer` is the provider interface.
- `HtmlSlideImageRenderer` renders PresentationIR through the built-in HTML exporter and screenshots slides with Playwright.
- `createLocalRuntime()` does not register a renderer by default, so Playwright is an explicit opt-in.
- Custom runtimes can implement `PresentationRuntime.buildReviewPacket()` or pass a custom `slideImageRenderer`.

## Playwright dependency

`playwright` is an optional peer dependency of `@deck-forge/core`.

To use the built-in renderer:

```sh
pnpm add playwright
pnpm exec playwright install chromium
```

Then opt in:

```ts
import { HtmlSlideImageRenderer, createLocalRuntime } from "@deck-forge/core";

const runtime = createLocalRuntime({
  slideImageRenderer: new HtmlSlideImageRenderer(),
});
```

If Playwright or the Chromium browser binary is unavailable, direct slide image export fails with `SLIDE_IMAGE_RENDERER_UNAVAILABLE`. Review packet creation captures renderer failures in `packet.warnings` and still returns text, inspect, and validation context.

## Tooling

- `presentation_export_slide_images` renders slides to PNG/JPEG and returns base64 data or file paths.
- `presentation_build_review_packet` can include slide images when `renderImages: true`.
- VLM provider calls are intentionally outside this package. The package provides the review packet, slide images, deterministic validation gates, and operation interfaces.

## Scaffold generation

`presentation_create_spec`, `presentation_generate_deck_plan`, and `presentation_generate_slide_specs` are scaffold helpers. Production creation should prefer Agent-authored `createArtifacts` grounded in the user request.
