# Seed Notes

`data/app` 配下の固定 JSON をもとに、将来的に DynamoDB へ投入するスクリプトをここへ追加します。

初期段階では以下を方針とします。

- 完全ランダムではなく固定サンプルを優先する
- 再現性のある thread / message セットを持つ
- 認証導入後は `user_id` ベースで投入する

