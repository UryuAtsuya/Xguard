# XGuard API 仕様

更新日: 2026-08-23

## v0 Backend 範囲

現在の v0 backend はread-only OAuth、mock / live backup、usage/cost ledger rollup、proof-page DTO generationを扱う。live経路の実credential / staging smokeと、snapshot全体のtransactional persistenceは別のrelease gateである。

## Routes 一覧

| Method | Path | 目的 | 認証 | 外部書き込み |
|---|---|---|---|---|
| GET | `/health` | API health check。`version`に`APP_VERSION`またはRailway commit SHAを返す | なし | なし |
| GET | `/api/x/oauth/start` | read-only X OAuth authorization metadata と一回限り `state` / S256 PKCE `code_challenge` を返す | なし | なし |
| GET | `/api/x/oauth/status` | deployment diagnostic として明示有効化され、専用header tokenが一致した場合のみ、OAuth mode、callback、v0 scopes、secret 設定有無だけを返す | `x-xguard-diagnostic-token` header | なし |
| GET | `/api/x/oauth/callback` | callback shape、`state`、TTL、replay を検証し、repository interface に token references を保存する | OAuth `state` | なし |
| GET | `/api/customer/session` | callback後のcustomer sessionからtoken非公開のconnected account DTOを復元する | `Authorization: Bearer <sessionToken>` | なし |
| POST | `/api/backup/run` | mockまたはlive read-only backupを実行し、usage/cost metadataをroll upする。作成されたproofは初期`private` | `Authorization: Bearer <sessionToken>` | なし |
| GET | `/api/backup/status/:runId` | mock backup status を owner のみ読む | `Authorization: Bearer <sessionToken>` | なし |
| PATCH | `/api/recovery/:runId/proof/visibility` | owner のみ proof visibility を `unlisted` / `public` / `revoked` に更新する。初期 `private` からの公開/取消を扱い、revoked 後の再公開は409 | `Authorization: Bearer <sessionToken>` | なし |
| GET | `/api/recovery/:runId/proof` | owner preview 用に mock backup の redacted proof DTO を `public` / `unlisted` 相当で返す。`private` / revoked は404 | `Authorization: Bearer <sessionToken>` | なし |

## OAuth Status

`GET /api/x/oauth/status` は deployment diagnostic 用の read-only endpoint であり、無認証公開しない。診断で使う場合だけ `X_OAUTH_STATUS_EXPOSURE=deployment_diagnostic` と32 bytes以上のランダムな `X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` を設定し、request header `x-xguard-diagnostic-token` に同じtokenを指定する。deployment diagnostic有効時は環境名に関係なくheader tokenを必須とし、tokenが未設定または32 bytes未満の場合はbackendの起動を停止する。exposureが無効、headerが未指定または不一致の場合は一律404 JSONを返す。すべてのresponseに `Cache-Control: no-store` を付ける。

有効かつheader token一致時の response fields は `mode`、`exposure`、`callbackUrl`、`scopes`、`clientIdConfigured`、`clientSecretConfigured`、`writesEnabled`、`missingEnv` に固定する。`X_CLIENT_ID` の値、`X_CLIENT_SECRET` の値、`X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` の値、token material、write/follow/DM scopes は返さない。v0 scopes は `tweet.read`、`users.read`、`offline.access` のみで維持する。

## OAuth Start / Callback

`GET /api/x/oauth/start?username=<X username>` は `state` と S256 PKCE `code_challenge` を発行し、`state`、`code_verifier`、入力username、有効期限をbackendの`OAuthStateRepository`に保存する。usernameは1から15文字の英数字または`_`に制限し、configured flowでは必須とする。`code_verifier`はresponse bodyやfrontendへ返さない。responseには`authorizationUrl`、`scopes`、`state`、`codeChallenge`、`codeChallengeMethod`、`stateExpiresAt`、`mode`、`callbackUrl`、`writesEnabled`を返す。v0 scopesは`tweet.read`、`users.read`、`offline.access`のみで、`code_challenge_method`は`S256`に固定する。

`GET /api/x/oauth/callback`は`code + state`または`error=access_denied + state`を受ける。保存済みstateが存在しない、別の値、またはreplayの場合は`403 { "error": "invalid_oauth_state" }`、TTL超過は`403 { "error": "expired_oauth_state" }`を返す。stateを一回で消費し、configured modeではX token endpointへ`code`、`code_verifier`、`client_id`、`redirect_uri`をform送信する。返却scopeをread-only 3 scopeと完全一致させ、`GET /2/users/me`のusernameを開始時usernameとcase-insensitiveに照合する。

raw access / refresh tokenはAES-256-GCM encrypted file storeへ保存し、token repositoryとAPI responseにはopaque referenceだけを渡す。成功時は43文字のcustomer sessionを発行し、configured modeでは`303 Location: <CUSTOMER_APP_URL>/#xguard_session=...`でcustomer appへ戻す。response bodyは空、`Cache-Control: no-store`と`Referrer-Policy: no-referrer`を付ける。frontendはfragmentを直ちに削除し、`GET /api/customer/session`でconnected accountを取得する。provider error description、authorization code、raw token、client secret、PKCE verifierはredirect / response / logへ出さない。

consent拒否、scope不一致、account不一致、token endpoint / X API / secret store failureは固定error codeだけをcustomer fragmentへ返す。account不一致、scope不一致、X API失敗、secret保存失敗では取得済みaccess / refresh tokenをbest-effortでrevokeする。`offline.access`に必要なrefresh tokenが欠落したresponseも拒否する。TTLは`OAUTH_STATE_TTL_SECONDS`で変更でき、既定値は300秒である。PKCE verifier byte lengthは`OAUTH_PKCE_VERIFIER_BYTES`で変更でき、既定値は64 bytes、許可範囲は32から96 bytesである。

`OAuthStateRepository`は開発既定ではin-memoryだが、`OAUTH_STATE_REPOSITORY=supabase`で`oauth_states`のservice-role storeを使う。Supabase storeは`state`、`code_verifier`、`requested_username`、`expires_at`を保存し、callback時に対象行を削除して返すことで一回限り消費とreplay拒否を同じ境界へ寄せる。`code_verifier`はservice-role境界の内側に留め、API responseやfrontendへ返さない。`NODE_ENV=production`では`OAUTH_STATE_REPOSITORY`の明示設定を必須にする。

## 置き換え予定の Backend Interfaces

- `TokenRepository`: configured modeのraw tokenはbackend-only encrypted file storeへ保存済み。in-memory token refをservice-role `SupabaseTokenRepository`へ接続し、refresh rotation、利用者disconnect、`auth_expired` transitionを永続化する。
- `XApiClient`: configured modeは`GET /2/users/me`と`GET /2/users/:id/tweets`をlive実行する。snapshotのSupabase transaction接続とrate-limit header記録は未完了。`follows.read`はfollower/following retention、privacy、cost handlingが承認された後だけ追加する。
- `ApiUsageLedgerService`: in-memory repository を、`backup_runs` を作成し、`api_usage_events` を記録し、完了前に cost/rate-limit metadata を roll up する Supabase transaction に置き換える。
- backup service: configured modeのlive readは接続済み。snapshots、usage events、rate-limit metadataを実DB transactionへ書き込むrunnerへ置き換える。

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
