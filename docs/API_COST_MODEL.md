# XGuard API Cost Model

Created: 2026-05-25

## Cost Policy

XGuard v0 treats X API usage as a metered backend cost. Every live API call should create an `api_usage_events` record and attach backup-related calls to the relevant `backup_runs.id`.

Developer Console values still need manual confirmation before production pricing is set. Until then, use this file as the implementation contract, not as final pricing truth.

## Events To Record

| Field | Purpose |
|---|---|
| `endpoint` | Exact X API endpoint or internal adapter name |
| `method` | HTTP method |
| `resource_type` | `post`, `user`, `media`, `usage`, or `unknown` |
| `resource_count` | Number of posts/users/media objects requested or returned |
| `owned_read` | Whether the read is for the authenticated user's own data |
| `estimated_cost_usd` | Cost estimate at call time |
| `rate_limit_limit` | X rate-limit ceiling when provided |
| `rate_limit_remaining` | Remaining calls when provided |
| `rate_limit_reset_at` | Reset timestamp when provided |
| `status_code` | HTTP status for cost/error analysis |

## v0 Defaults

- `owned_read`: `true` for authenticated user's own profile and posts.
- `estimated_cost_usd`: conservative public read estimates until Developer Console pricing is copied into this file.
- `monthly_api_cost_limit_usd`: user-level guardrail in `user_profiles`.
- Backup jobs must stop before crossing the user monthly cost limit.

## 2026-05-26 Implementation Contract

`ApiUsageLedgerService` is now the backend boundary for `backup_runs` plus `api_usage_events`. The prototype records one event per X API adapter call, attaches it to the backup run, and rolls up `api_units_used`, `estimated_cost_usd`, and the latest rate-limit metadata onto the completed run.

Until Developer Console values are copied from the real app, the service uses conservative public read estimates:

| Resource type | Prototype unit cost | Notes |
|---|---:|---|
| `post` | `$0.005` | Used for `GET /2/users/:id/tweets`. |
| `user` | `$0.010` | Used for `GET /2/users/me` and profile lookup. |
| `follower` / `following` | `$0.010` | Tracked for future P1 only; `follows.read` remains outside v0. |
| `media` / `usage` / `unknown` | `$0.000` | Placeholder until endpoint-specific pricing is confirmed. |

`owned_read` is recorded, but no Owned Reads discount is applied in estimates until the Developer Console confirms that the lower rate applies to this third-party SaaS use case.

## Open Manual Check

Confirm in X Developer Console:

- endpoint-level pricing for user lookup and post lookup,
- monthly spending limit and alert settings,
- whether Usage API access is available for the plan,
- whether Owned Reads pricing applies to authenticated third-party SaaS backups,
- rate-limit headers returned by the target endpoints.
