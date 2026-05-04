# Presentation Author Skill

This skill supports PowerPoint / PPTX / slide deck generation through a dedicated Slide Runtime.

## Scope

Use this skill when the user asks to create, generate, draft, revise, or export:

- PowerPoint decks
- PPTX files
- slide decks
- presentation materials
- report decks
- proposal decks
- executive summary decks
- training slides

## Architecture

Router Agent should not create PPTX directly.
Router Agent delegates to the Slide Runtime through `create_slide_presentation`.

Slide Agent uses `create_presentation` to generate editable PPTX via PptxGenJS, diagnostics, revision, and artifact upload.

## Sections

- Router handoff guidance: `references/router-handoff.md`
- Slide agent guidance: `references/slide-agent-guidance.md`
- Font policy: `references/font-policy.md`
- Artifact response policy: `references/artifact-response.md`
- Tool contracts: `references/tool-contract.md`
- Diagnostics and revision policy: `references/diagnostics-revision.md`
