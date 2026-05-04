# Artifact Response Policy

When deck generation succeeds, return a user-friendly message.

Include:
- PPTX download URL if available
- contact sheet URL if available
- diagnostics status
- revision status

Example Japanese response:

> 資料を作成しました。
>
> - PPTX: (pptxDownloadUrl)
> - 確認用コンタクトシート: (contactSheetDownloadUrl)
> - Diagnostics: pass
> - Revision: succeeded

If only local paths are available, explain that downloadable URLs are unavailable.

Do not expose raw JSON unless debugging.
Do not expose full S3 internals unless needed.
Do not log or repeat long presigned URLs unnecessarily beyond the user-facing link.
