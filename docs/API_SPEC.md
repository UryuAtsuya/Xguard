# XGuard API 仕様

作成日: 2026-05-24

## v0 Backend 範囲

現在の prototype は read-only API spike である。OAuth intake、token repository boundary、mock backup run、usage/cost ledger rollup、proof-page DTO generation をモデル化する。

## Routes 一覧

| Method | Path | 目的 | 外部書き込み |
|---|---|---|---|
| GET | `/health` | API health check | なし |
| GET | `/api/x/oauth/start` | read-only X OAuth authorization metadata を返す | なし |
| GET | `/api/x/oauth/status` | deployment diagnostic として明示有効化された場合のみ、OAuth mode、callback、v0 scopes、secret 設定有無だけを返す | なし |
| GET | `/api/x/oauth/callback` | callback shape を検証し、repository interface に token references を保存する | なし |
| POST | `/api/backup/run` | fixture-backed mock backup を実行し、usage/cost metadata を roll up する | なし |
| GET | `/api/backup/status/:runId` | mock backup status を読む | なし |
| GET | `/api/recovery/:runId/proof` | mock backup 用の redacted proof DTO を返す | なし |

## OAuth Status

`GET /api/x/oauth/status` は deployment diagnostic 用の read-only endpoint である。`X_OAUTH_STATUS_EXPOSURE` が未設定の場合は環境名に関係なく無効化され、404 JSON を返す。診断で使う場合だけ `X_OAUTH_STATUS_EXPOSURE=deployment_diagnostic` を明示する。

有効時の response fields は `mode`、`exposure`、`callbackUrl`、`scopes`、`clientIdConfigured`、`clientSecretConfigured`、`writesEnabled`、`missingEnv` に固定する。`X_CLIENT_ID` の値、`X_CLIENT_SECRET` の値、token material、write/follow/DM scopes は返さない。v0 scopes は `tweet.read`、`users.read`、`offline.access` のみで維持する。

## 置き換え予定の Backend Interfaces

- `TokenRepository`: in-memory token refs を、service-role storage と Vault/encryption handling に支えられた `SupabaseTokenRepository` に置き換える。repository は raw token material を frontend に露出せず、`auth_expired` transitions と token revocation を扱える必要がある。
- `XApiClient`: fixture data を、v0 では `tweet.read`、`users.read`、`offline.access` に限定した X API calls に置き換える。`follows.read` は follower/following retention、privacy、cost handling が承認された後だけ追加する。
- `ApiUsageLedgerService`: in-memory repository を、`backup_runs` を作成し、`api_usage_events` を記録し、完了前に cost/rate-limit metadata を roll up する Supabase transaction に置き換える。
- `MockBackupService`: fixture-backed calls を、snapshots、usage events、rate-limit metadata を書き込む transactional backup runner に置き換える。

## 意図的に除外するもの

- 自動 DM
- 自動 follow/unfollow
- 自動 posting
- ban evasion flows
- 公開 raw X API payloads
- OAuth client secret や token material の API レスポンス露出

## Validation Rules

`POST /api/backup/run` は HTTP boundary で `tweetLimit` をすでに制約している。`ApiUsageLedgerService` は repository writes の前に、usage と summary counters の negative、fractional、`NaN`、infinite values を拒否することで、2 段目の backend guard を追加する。

## 2026-05-28 Supabase Ledger Adapter

`SupabaseApiUsageLedgerRepository` は `ApiUsageLedgerService` の production-facing adapter boundary である。camelCase service DTOs を Supabase snake_case rows に map し、writes を transaction store interface で包み、user の `monthly_api_cost_limit_usd` を超える前に新しい `api_usage_events` を拒否する。
