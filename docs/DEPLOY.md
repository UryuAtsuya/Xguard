# XGuard Deploy Notes

更新日: 2026-05-25

## Target Topology（配置構成）

| Runtime | Target | 補足 |
|---|---|---|
| Frontend | Vercel | 将来の Next.js 14 App Router app は `frontend/` 配下に置く |
| Backend API | Railway | `backend/src/server.ts` から Express API を起動する |
| Database/Auth | Supabase | Postgres、Auth、RLS、service-role backend access |
| Billing | Stripe | Webhooks は `stripe_events.event_id` で idempotent にする |
| Scheduler | Railway cron または separate worker | X API cost/rate limits の範囲内で backups と health checks を実行する |

## Backend Environment

```env
PORT=4000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=
X_OAUTH_STATUS_EXPOSURE=disabled
X_OAUTH_STATUS_DIAGNOSTIC_TOKEN=
CORS_ORIGINS=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_BASE_URL=
```

`SUPABASE_SERVICE_ROLE_KEY`、X OAuth secrets、Stripe secrets、token encryption keys は backend または worker runtimes にのみ置く。

現在の prototype では、`X_CLIENT_ID` が mock OAuth metadata から configured OAuth metadata へ切り替える switch である。`X_CALLBACK_URL` は直接設定でき、未設定の場合は `${APP_BASE_URL}/api/x/oauth/callback` または local port `4000` に fallback する。`X_CLIENT_SECRET` は検出するがまだ exchange しないため、callback handling は repository references の保存に留める。

deployment 診断が必要なときだけ `GET /api/x/oauth/status` を使う。`X_OAUTH_STATUS_EXPOSURE` は `disabled` または `deployment_diagnostic` を指定できる。未設定の場合は環境名に関係なく `disabled` として扱う。この endpoint を使う場合は `X_OAUTH_STATUS_EXPOSURE=deployment_diagnostic` と32 bytes以上のランダムな `X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` を設定し、request header `x-xguard-diagnostic-token` に同じ値を指定する。deployment diagnosticを有効化したままtokenを未設定または32 bytes未満にすると、backendは `invalid_runtime_env:X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` で起動を停止する。診断後は `disabled` に戻し、tokenをrotationする。header値をproxy、access log、APMへ記録しない。

有効かつheader token一致時の endpoint は `mode`、`exposure`、`callbackUrl`、`scopes`、`clientIdConfigured`、`clientSecretConfigured`、`writesEnabled`、`missingEnv` だけを返し、`X_CLIENT_ID` の値、`X_CLIENT_SECRET` の値、`X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` の値、token material は返さない。exposureが無効、tokenが未設定、headerが未指定または不一致の場合は一律404 JSONを返し、すべてのresponseに `Cache-Control: no-store` を付ける。v0 scopes は `tweet.read`、`users.read`、`offline.access` のみで、write/follow/DM scopes は追加しない。

`CORS_ORIGINS` は browser からAPIへアクセスできる origin のallowlistで、複数指定する場合はcomma区切りにする。未設定かつ `NODE_ENV=production` の場合は `APP_BASE_URL` の origin だけを許可し、`APP_BASE_URL` も未設定ならcross-origin requestを許可しない。local/prototype環境では未設定時に既定の `cors` 挙動を維持する。

## Build And Start

```bash
npm ci
npm run build
node dist/backend/src/server.js
```

`npm run build` は `tsconfig.build.json` を使い、tests を production output から除外する。deployment 前に `npm run check` を実行する。

## Release Gates

- `git diff --check`
- `npm run build`
- `npm run check`
- 実Supabase/Postgres migration test: `RUN_SUPABASE_SQL_INTEGRATION_TESTS=1 SUPABASE_DB_URL='postgresql://...' npx vitest run --configLoader runner backend/src/__tests__/supabaseSqlApiUsageLedger.integration.test.ts`
- `npx vitest run --configLoader runner`
- X OAuth scopes が `tweet.read`、`users.read`、`offline.access` として confirmed
- Developer Console prices と spending limits を operations notes に転記済み
- public launch 前に proof-page revocation と compliance event monitoring が ready

## この状態では Deploy しない

- v0 に `follows.read`、DM、follow write、tweet write scopes が含まれている。
- Service-role keys が frontend bundles に expose されている。
- Public routes が raw X API payloads を返している。
- Automated DM/follow/posting jobs がある。

## Backend Runtime Notes

- Railway backend は usage ledger を service-role Supabase client のみで実行する。`SUPABASE_SERVICE_ROLE_KEY` を Vercel frontend builds に expose しない。
- Backup workers は `monthly_api_cost_limit_usd` を超える場合に stop し、無限 retry ではなく `rate_limited` または `failed` status を surface する。
- production `SupabaseApiUsageLedgerStore` は `backup_runs` と `api_usage_events` の changes を database transaction 内で実行し、insert 前の monthly cost-limit guard を維持する必要がある。
- production pricing を final として扱う前に、Developer Console pricing、spending limit、Usage API availability を `docs/API_COST_MODEL.md` に転記する必要がある。
- `SUPABASE_DB_URL` / `POSTGRES_URL` は実DB migration test 専用で、backend/frontend runtime env として常設しない。test output、docs、commit message に接続文字列や service-role credential を残さない。
