# XGuard API 仕様

作成日: 2026-05-24

## v0 Backend 範囲

現在の prototype は read-only API spike である。OAuth intake、token repository boundary、mock backup run、usage/cost ledger rollup、proof-page DTO generation をモデル化する。

## Routes 一覧

| Method | Path | 目的 | 認証 | 外部書き込み |
|---|---|---|---|---|
| GET | `/health` | API health check | なし | なし |
| GET | `/api/x/oauth/start` | read-only X OAuth authorization metadata と一回限り `state` / S256 PKCE `code_challenge` を返す | なし | なし |
| GET | `/api/x/oauth/status` | deployment diagnostic として明示有効化され、専用header tokenが一致した場合のみ、OAuth mode、callback、v0 scopes、secret 設定有無だけを返す | `x-xguard-diagnostic-token` header | なし |
| GET | `/api/x/oauth/callback` | callback shape、`state`、TTL、replay を検証する。mock mode のみ prototype token refs / session を発行し、configured mode は実token exchange実装まで501で停止する | OAuth `state` | なし |
| POST | `/api/backup/run` | fixture-backed mock backup を実行し、usage/cost metadata を roll up する。応答は `backupRun` summary のみで、作成された proof は初期 `private` として扱う | `Authorization: Bearer <sessionToken>` | なし |
| GET | `/api/backup/status/:runId` | mock backup status を owner のみ読む | `Authorization: Bearer <sessionToken>` | なし |
| PATCH | `/api/recovery/:runId/proof/visibility` | owner のみ proof visibility を `unlisted` / `public` / `revoked` に更新する。初期 `private` からの公開/取消を扱い、revoked 後の再公開は409 | `Authorization: Bearer <sessionToken>` | なし |
| GET | `/api/recovery/:runId/proof` | owner preview 用に mock backup の redacted proof DTO を `public` / `unlisted` 相当で返す。`private` / revoked は404 | `Authorization: Bearer <sessionToken>` | なし |

## OAuth Status

`GET /api/x/oauth/status` は deployment diagnostic 用の read-only endpoint であり、無認証公開しない。診断で使う場合だけ `X_OAUTH_STATUS_EXPOSURE=deployment_diagnostic` と32 bytes以上のランダムな `X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` を設定し、request header `x-xguard-diagnostic-token` に同じtokenを指定する。deployment diagnostic有効時は環境名に関係なくheader tokenを必須とし、tokenが未設定または32 bytes未満の場合はbackendの起動を停止する。exposureが無効、headerが未指定または不一致の場合は一律404 JSONを返す。すべてのresponseに `Cache-Control: no-store` を付ける。

有効かつheader token一致時の response fields は `mode`、`exposure`、`callbackUrl`、`scopes`、`clientIdConfigured`、`clientSecretConfigured`、`writesEnabled`、`missingEnv` に固定する。`X_CLIENT_ID` の値、`X_CLIENT_SECRET` の値、`X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` の値、token material、write/follow/DM scopes は返さない。v0 scopes は `tweet.read`、`users.read`、`offline.access` のみで維持する。

## OAuth Start / Callback

`GET /api/x/oauth/start` は `state` と S256 PKCE `code_challenge` を発行し、`state`、`code_verifier`、有効期限を backend の `OAuthStateRepository` に保存する。`code_verifier` は response body や frontend へ返さない。response には `authorizationUrl`、`scopes`、`state`、`codeChallenge`、`codeChallengeMethod`、`stateExpiresAt`、`mode`、`callbackUrl`、`writesEnabled` を返す。v0 scopes は `tweet.read`、`users.read`、`offline.access` のみで、`code_challenge_method` は `S256` に固定する。

`GET /api/x/oauth/callback` は `code` と `state` を必須にする。保存済み `state` が存在しない、別の値、または replay の場合は `403 { "error": "invalid_oauth_state" }` を返す。TTL 超過後の callback は `403 { "error": "expired_oauth_state" }` を返す。正常時は `state` を一回で消費し、保存していた `code_verifier` を token exchange boundary へ渡してから token repository boundary へ進む。現prototypeでは外部X token endpointをまだ呼ばず、mock mode のみ repository ref と session を生成する。configured mode の callback は環境名に関係なく、実token exchangeが入るまで prototype token refs / session を発行せず、`501 { "error": "x_oauth_token_exchange_not_implemented" }` を返す。API response には token material と `code_verifier` を返さない。TTL は `OAUTH_STATE_TTL_SECONDS` で変更でき、既定値は300秒である。PKCE verifier byte length は `OAUTH_PKCE_VERIFIER_BYTES` で変更でき、既定値は64 bytes、許可範囲は32から96 bytesである。

`/api/x/oauth/callback`、`/api/backup/*`、`/api/recovery/*` は session、backup、proof payload を扱うため、すべて `Cache-Control: no-store` を返す。

現在の `OAuthStateRepository` は in-memory prototype で、`save` 時に期限切れrecordを掃除する。本番deployでは callback が別process / 別instanceへ届く可能性があるため、同じ一回限り消費・TTL・replay拒否契約を持つ共有永続storeへ置き換える。

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
