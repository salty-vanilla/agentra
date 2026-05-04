# Router Handoff Guidance

When the user asks for PowerPoint, PPTX, slides, a presentation, a report deck, proposal deck, executive deck, or training material slides, do not answer by drafting slide text in chat.

Call `create_slide_presentation`.

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

Use:

`create_slide_presentation`

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
