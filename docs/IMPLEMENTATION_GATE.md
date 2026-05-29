# XGuard 実装ゲート

作成日: 2026-05-23

## プロダクトコード着手前

- X Developer Console で endpoint 単位の料金を確認する。
- 読み取り専用 OAuth scopes を確定する。
- DB schema に安全な OAuth token 保存領域を追加する。
- API usage tracking と backup run logging を追加する。
- proof page の visibility、revocation、redaction fields を追加する。
- content compliance events を追加する。
- Stripe webhook の idempotency を追加する。

## 最初のコードスパイク

1. OAuth callback の skeleton。
2. Token repository interface。
3. X API client interface。
4. 外部データを書き込まない mock backup run。
5. fixture input を使う Proof DTO builder。

## まだ作らないもの

- Next.js marketing LP.
- 自動 DM。
- 自動 follow/unfollow。
- 自動 posting。
- AI 生成の大量 outreach。
- 公開 follower/following directory。

## Go 条件

- read-only flow が write scopes なしでテストできる。
- token storage design が frontend への plaintext token 露出を避けている。
- Proof payload は raw X API response JSON ではなく、別 DTO になっている。
- 各 backup run が usage、rate limit headers、errors を記録する。
- launch 前に compliance deletion path が schema 上で表現されている。
