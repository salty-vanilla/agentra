---
name: presentation-author-handoff
description: Delegate PowerPoint / PPTX / slide generation requests to the Slide Runtime via create_slide_presentation tool.
allowed-tools: create_slide_presentation
---

# Presentation Author Handoff

When the user asks for PowerPoint, PPTX, slides, a presentation, a report deck, proposal deck, executive deck, or training material slides, do not answer by drafting slide text in chat.

Call `create_slide_presentation`.

## Explicit UI command directive

When the request contains an explicit UI command directive with type `create_slide_presentation`, you must call `create_slide_presentation` exactly once unless required fields are missing.

If `audience` or `purpose` are not specified in the directive, ask the user one brief clarifying question before calling the tool (e.g. "対象読者と目的を教えていただけますか？"). Once the user answers, proceed with the tool call.

Do not respond with only explanatory text.
Do not call or mention `/api/presentations`.
Do not generate slides directly in the Router.
Do not paste or emit PPTX XML.
Delegate to the slide generation tool.

## Trigger examples

Japanese:
- スライドを作って
- PowerPointにして
- PPTXを作成して
- 報告資料を作って
- 提案資料を作って
- プレゼン資料を作って
- 製造ラインのQ2報告資料を作って

English:
- create slides
- make a PowerPoint
- generate a PPTX
- create a presentation deck
- make a report deck
- prepare a proposal deck

## Tool to call

Use `create_slide_presentation`.

Pass:
- `prompt`: the full user request
- `language`: `ja` if the request is Japanese, otherwise infer
- `diagnostics`: true
- `revision`: true

## After tool returns

Reply with:
- short summary of what was generated
- PPTX download link if available
- contact sheet link if available
- diagnostics status
- revision status

Do not expose raw JSON unless debugging.
Do not ask the user to call `/api/presentations`.
Do not generate PowerPoint XML manually.
