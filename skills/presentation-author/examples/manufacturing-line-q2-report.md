# Manufacturing Line Q2 Report Example

User request:

> 製造ライン #4 の2026年Q2パフォーマンス報告資料を作ってください。
> 対象は経営層です。
> 6枚程度で、KPI、月次推移、不良率、停止時間の要因分析、Q3改善施策を含めてください。
> 日本語でお願いします。

Expected behavior:
- Router calls `create_slide_presentation`
- language: ja
- diagnostics: true
- revision: true

Expected output:
- executive-style Japanese deck
- PPTX download URL
- contact sheet URL
- diagnostics status
- revision status
