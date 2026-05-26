# XGuard Deploy Notes

Updated: 2026-05-25

## Target Topology

| Runtime | Target | Notes |
|---|---|---|
| Frontend | Vercel | Future Next.js 14 App Router app under `frontend/` |
| Backend API | Railway | Express API from `backend/src/server.ts` |
| Database/Auth | Supabase | Postgres, Auth, RLS, service-role backend access |
| Billing | Stripe | Webhooks must be idempotent through `stripe_events.event_id` |
| Scheduler | Railway cron or separate worker | Run backups and health checks within X API cost/rate limits |

## Backend Environment

```env
PORT=4000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
APP_BASE_URL=
```

`SUPABASE_SERVICE_ROLE_KEY`, X OAuth secrets, Stripe secrets, and token encryption keys belong only in backend or worker runtimes.

## Build And Start

```bash
npm ci
npm run build
node dist/backend/src/server.js
```

`npm run build` uses `tsconfig.build.json`, which excludes tests from production output. Run `npm run check` before deployment.

## Release Gates

- `git diff --check`
- `npm run build`
- `npm run check`
- `npx vitest run --configLoader runner`
- X OAuth scopes confirmed as `tweet.read`, `users.read`, `offline.access`
- Developer Console prices and spending limits copied into operations notes
- Proof-page revocation and compliance event monitoring ready before public launch

## Do Not Deploy With

- `follows.read`, DM, follow write, or tweet write scopes in v0.
- Service-role keys exposed to frontend bundles.
- Public routes returning raw X API payloads.
- Automated DM/follow/posting jobs.

## Backend Runtime Notes

- Railway backend must run the usage ledger with a service-role Supabase client only. Do not expose `SUPABASE_SERVICE_ROLE_KEY` to Vercel frontend builds.
- Backup workers should stop when `monthly_api_cost_limit_usd` would be crossed and surface `rate_limited` or `failed` status instead of retrying indefinitely.
- Developer Console pricing, spending limit, and Usage API availability must be copied into `docs/API_COST_MODEL.md` before production pricing is treated as final.
