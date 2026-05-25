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
- `estimated_cost_usd`: `0` in the prototype until Developer Console pricing is copied into this file.
- `monthly_api_cost_limit_usd`: user-level guardrail in `user_profiles`.
- Backup jobs must stop before crossing the user monthly cost limit.

## Open Manual Check

Confirm in X Developer Console:

- endpoint-level pricing for user lookup and post lookup,
- monthly spending limit and alert settings,
- whether Usage API access is available for the plan,
- rate-limit headers returned by the target endpoints.
