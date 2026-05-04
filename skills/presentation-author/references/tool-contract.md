# Tool Contract

## Router tool: create_slide_presentation

Used by the General Runtime / Router Agent.

Input:
- prompt: string
- language?: "ja" | "en"
- diagnostics?: boolean
- revision?: boolean

Output:
- success
- summary
- pptxDownloadUrl
- contactSheetDownloadUrl
- uploadedArtifacts
- diagnosticsStatus
- revisionAttempted
- revisionSucceeded
- revisionReason
- warnings
- error

## Slide Runtime tool: create_presentation

Used by the Slide Agent.

Input:
- prompt
- language
- styleGuide
- diagnostics
- revision
- timeoutMs

Output:
- local artifacts
- uploaded artifacts
- download URLs
- diagnostics status
- revision status
