# XGuard Deploy Notes

更新日: 2026-08-23

## Target Topology（配置構成）

| Runtime | Target | 補足 |
|---|---|---|
| Customer frontend | Sites | `frontend/customer/`を`app.<base-domain>`へ配信する |
| Admin frontend | 別Sites project | `frontend/admin/`を`admin.<base-domain>`へ非公開から配信する |
| Backend API | Railway | `backend/src/server.ts` から Express API を起動する |
| Database/Auth | Supabase | Postgres、Auth、RLS、service-role backend access |
| Billing | Stripe | Webhooks は `stripe_events.event_id` で idempotent にする |
| Scheduler | Railway cron または separate worker | X API cost/rate limits の範囲内で backups と health checks を実行する |

## Backend Environment

```env
PORT=4000
NODE_ENV=production
APP_VERSION=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=
CUSTOMER_APP_URL=https://app.example.com/
X_TOKEN_SECRET_STORE_DIR=/var/lib/xguard/x-oauth-tokens
X_TOKEN_ENCRYPTION_KEY=
X_OAUTH_STATUS_EXPOSURE=disabled
X_OAUTH_STATUS_DIAGNOSTIC_TOKEN=
CUSTOMER_CORS_ORIGINS=https://app.example.com
ADMIN_CORS_ORIGINS=https://admin.example.com
ADMIN_AUTH_MODE=supabase
ADMIN_REDIRECT_URL=https://admin.example.com/auth/callback
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_BASE_URL=
```

`SUPABASE_SERVICE_ROLE_KEY`、X OAuth secrets、Stripe secrets、token encryption keys は backend または worker runtimes にのみ置く。

`APP_VERSION`はrelease tagまたはcommit SHAを指定する。未設定時はRailwayの`RAILWAY_GIT_COMMIT_SHA`を使用し、`GET /health`の`version`で実行中commitを照合する。どちらもないlocal runtimeは`unknown`になる。

`X_CLIENT_ID`はmockからconfigured OAuthへ切り替えるswitchである。configured serverは`X_CLIENT_SECRET`、`CUSTOMER_APP_URL`、`X_TOKEN_SECRET_STORE_DIR`、`X_TOKEN_ENCRYPTION_KEY`を必須にし、不足時は`invalid_runtime_env:<NAME>`で起動を停止する。`X_TOKEN_ENCRYPTION_KEY`は`openssl rand -base64 32`で生成した32 bytes keyとし、frontend、docs、commit、logへ残さない。rotationは既存token fileの復号を不能にするため、rotation時は全accountの再接続を計画する。

`X_TOKEN_SECRET_STORE_DIR`はRailwayのpersistent volume上のbackend専用directoryへ向ける。directory / file permissionはそれぞれ`0700` / `0600`へ固定される。ephemeral filesystem、frontend volume、repository checkout配下は指定しない。access / refresh tokenはAES-256-GCMで保存され、APIとtoken repositoryには`xguard-secret://...` referenceだけが渡る。

`X_CALLBACK_URL`はX Developer Consoleのcallback allowlistへ完全一致で登録する。未設定の場合は`${APP_BASE_URL}/api/x/oauth/callback`へfallbackするが、`NODE_ENV=production`ではHTTPSを必須とし、localhost、IPv4 `127.0.0.0/8`、IPv6 `::1`を拒否する。`CUSTOMER_APP_URL`もpublic HTTPS URLにし、callback成功後のsession fragmentの戻り先として使う。frontendはfragmentを取得後ただちにURLから削除する。

reverse proxy / Railwayのaccess logでは`/api/x/oauth/callback`のquery stringを記録しないか、`code`と`state`をredactする。applicationはcallback query、provider response body、token materialをlogへ出さない。

v0は`offline.access`のrefresh tokenを暗号化保存するが、自動refresh rotationと利用者向けdisconnect endpointは未実装である。access token失効時は再OAuthを行う。account / scope不一致、X API失敗、secret保存失敗時は取得済みaccess / refresh tokenをbest-effort revokeする。scheduled backupを有効化する前にrefresh rotationとrevoke運用を追加する。

deployment 診断が必要なときだけ `GET /api/x/oauth/status` を使う。`X_OAUTH_STATUS_EXPOSURE` は `disabled` または `deployment_diagnostic` を指定できる。未設定の場合は環境名に関係なく `disabled` として扱う。この endpoint を使う場合は `X_OAUTH_STATUS_EXPOSURE=deployment_diagnostic` と32 bytes以上のランダムな `X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` を設定し、request header `x-xguard-diagnostic-token` に同じ値を指定する。deployment diagnosticを有効化したままtokenを未設定または32 bytes未満にすると、backendは `invalid_runtime_env:X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` で起動を停止する。診断後は `disabled` に戻し、tokenをrotationする。header値をproxy、access log、APMへ記録しない。

有効かつheader token一致時の endpoint は `mode`、`exposure`、`callbackUrl`、`scopes`、`clientIdConfigured`、`clientSecretConfigured`、`writesEnabled`、`missingEnv` だけを返し、`X_CLIENT_ID` の値、`X_CLIENT_SECRET` の値、`X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` の値、token material は返さない。exposureが無効、tokenが未設定、headerが未指定または不一致の場合は一律404 JSONを返し、すべてのresponseに `Cache-Control: no-store` を付ける。v0 scopes は `tweet.read`、`users.read`、`offline.access` のみで、write/follow/DM scopes は追加しない。

`CUSTOMER_CORS_ORIGINS`と`ADMIN_CORS_ORIGINS`は別allowlistとして設定する。管理APIはadmin originだけ、顧客APIはcustomer originだけにCORS responseを返す。legacy `CORS_ORIGINS` はcustomer側のfallbackに限って残す。

`ADMIN_AUTH_MODE=supabase`では、backendがSupabase JWKSとservice-role RESTを使う。`SUPABASE_SERVICE_ROLE_KEY`はbackendだけに置く。admin frontendには`VITE_SUPABASE_URL`と`VITE_SUPABASE_PUBLISHABLE_KEY`だけを設定し、Supabase Authのredirect allowlistへ`ADMIN_REDIRECT_URL`を登録する。

## Build And Start

Railwayはrepository rootの`railway.json`により`Dockerfile` builderと`/health` gateを使う。backendは`PORT`を読み、`0.0.0.0`へbindする。imageはNode.js 22 multi-stage buildでproduction dependenciesとcompiled APIだけを含み、UID `10001`の`xguard` userで起動する。

```bash
npm ci
npm run build
node dist/backend/src/server.js
```

`npm run build` は `tsconfig.build.json` を使い、tests を production output から除外する。deployment 前に `npm run check` を実行する。

container contractのlocal / CI smoke:

```bash
npm run check:backend-container
```

このsmokeはimageをbuildし、read-only root filesystem、capability drop、non-root UID、production相当のfail-fast env、`/health`、writable volume mountを確認する。smoke用のenv値は外部serviceへ接続せず、実credentialを使用しない。

Railwayではpersistent volumeを`/app/data`へmountし、`X_TOKEN_SECRET_STORE_DIR=/app/data/x-oauth-tokens`を設定する。volumeはbuild時やpre-deploy commandでは利用できないため、token fileをimage layerへ作成しない。新規deployment後は、再起動前後で同じencrypted token fileを復号できることをstaging gateとして確認する。

frontend Sites artifact:

```bash
VITE_XGUARD_API_BASE_URL=https://api.example.com \
npm run build:sites:customer

VITE_XGUARD_API_BASE_URL=https://api.example.com \
VITE_SUPABASE_URL=https://project.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=... \
VITE_ADMIN_REDIRECT_URL=https://admin.example.com/auth/callback \
npm run build:sites:admin
```

両Sites buildはenvironment preflightを先に実行する。API / Supabase baseはpublic HTTPS originだけ、admin redirectは`/auth/callback`だけを許可する。値は検証outputへ表示しない。`VITE_SUPABASE_PUBLISHABLE_KEY`はpublic client用であり、`SUPABASE_SERVICE_ROLE_KEY`を渡すとbuildを拒否する。

rolloutはschema/backend、非公開admin deploy、`npm run admin:bootstrap`、admin smoke、customer deploy、custom domain/DNS接続の順に行う。実domainが確定するまではhostnameを環境変数で管理する。

## Release Gates

- `git diff --check`
- `npm run build`
- `npm run check`
- `npm run check:backend-container`
- 実Supabase/Postgres migration test: `RUN_SUPABASE_SQL_INTEGRATION_TESTS=1 SUPABASE_DB_URL='postgresql://...' npx vitest run --configLoader runner backend/src/__tests__/supabaseSqlApiUsageLedger.integration.test.ts`
- `npx vitest run --configLoader runner`
- X OAuth scopes が `tweet.read`、`users.read`、`offline.access` として confirmed
- X Developer Consoleに`X_CALLBACK_URL`を完全一致で登録
- persistent token volumeを再起動後にも復号・readできることを確認
- `/health.version`がdeploy対象commit SHAと一致
- 実X accountでconsent → callback → username一致 → profile / recent posts backupが成功
- customer URL / backend log / frontend bundle / proof DTOにraw token、authorization code、client secretがない
- Developer Console prices と spending limits を operations notes に転記済み
- public launch 前に proof-page revocation と compliance event monitoring が ready

## この状態では Deploy しない

- v0 に `follows.read`、DM、follow write、tweet write scopes が含まれている。
- Service-role keys が frontend bundles に expose されている。
- Public routes が raw X API payloads を返している。
- Automated DM/follow/posting jobs がある。
- `X_TOKEN_SECRET_STORE_DIR`がephemeral filesystemまたはrepository checkoutを指している。
- live tokenの自動refreshを前提にschedulerを有効化している。

## Backend Runtime Notes

- Railway backend は usage ledger を service-role Supabase client のみで実行する。`SUPABASE_SERVICE_ROLE_KEY` を Vercel frontend builds に expose しない。
- Backup workers は `monthly_api_cost_limit_usd` を超える場合に stop し、無限 retry ではなく `rate_limited` または `failed` status を surface する。
- production `SupabaseApiUsageLedgerStore` は `backup_runs` と `api_usage_events` の changes を database transaction 内で実行し、insert 前の monthly cost-limit guard を維持する必要がある。
- production pricing を final として扱う前に、Developer Console pricing、spending limit、Usage API availability を `docs/API_COST_MODEL.md` に転記する必要がある。
- `SUPABASE_DB_URL` / `POSTGRES_URL` は実DB migration test 専用で、backend/frontend runtime env として常設しない。test output、docs、commit message に接続文字列や service-role credential を残さない。
