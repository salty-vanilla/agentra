# Third-Party Notices

This file records third-party code and assets adapted into Agentra, and their licenses.

## SDPM — Spec-Driven Presentation Maker

- **Source:** [aws-samples/sample-spec-driven-presentation-maker](https://github.com/aws-samples/sample-spec-driven-presentation-maker)
- **License:** MIT-0 (MIT No Attribution) — Copyright Amazon.com, Inc. or its affiliates.
- **Used in:** the `sdpm-skill` Presentation Author Engine (Epic #442). Agentra
  invokes the SDPM Skill (`skill/`, Layer 1) `pptx_builder.py` to turn a Deck
  Workspace (`deck.json` / `specs/*` / `slides/{slug}.json`) into a PPTX, and
  bridges that workspace into Agentra's `decks/{deckId}/...` storage, BFF
  snapshot, and DeckPreview pipeline.
- **What is NOT used:** SDPM's Remote MCP server, Web UI app, Cognito auth, API
  Gateway, and CDK infrastructure are not adapted.
- **Attribution:** MIT-0 imposes no attribution requirement. This notice is kept
  as a matter of good practice. The SDPM skill version targeted at adoption is
  `0.3.8`; the concrete vendoring (pinned copy + sync script) is configured via
  the `SDPM_SKILL_DIR` environment variable and provisioned for the ephemeral
  smoke environment (#449).

Adapted files that read the SDPM Deck Workspace layout carry a `// Adapted from
aws-samples/sample-spec-driven-presentation-maker (MIT-0)` header comment.
