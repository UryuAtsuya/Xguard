# XGuard API Spec

Created: 2026-05-24

## v0 Backend Scope

The current prototype is a read-only API spike. It models OAuth intake, token repository boundaries, a mock backup run, usage/cost ledger rollups, and proof-page DTO generation.

## Routes

| Method | Path | Purpose | External writes |
|---|---|---|---|
| GET | `/health` | API health check | No |
| GET | `/api/x/oauth/start` | Return read-only X OAuth authorization metadata | No |
| GET | `/api/x/oauth/callback` | Validate callback shape and store token references in the repository interface | No |
| POST | `/api/backup/run` | Run fixture-backed mock backup and roll up usage/cost metadata | No |
| GET | `/api/backup/status/:runId` | Read mock backup status | No |
| GET | `/api/recovery/:runId/proof` | Return redacted proof DTO for a mock backup | No |

## Backend Interfaces To Replace

- `TokenRepository`: replace in-memory token refs with `SupabaseTokenRepository` backed by service-role storage and Vault/encryption handling. The repository must support `auth_expired` transitions and token revocation without exposing raw token material to the frontend.
- `XApiClient`: replace fixture data with X API calls limited to `tweet.read`, `users.read`, and `offline.access` for v0. Add `follows.read` only after follower/following retention, privacy, and cost handling are approved.
- `ApiUsageLedgerService`: replace the in-memory repository with a Supabase transaction that creates `backup_runs`, records `api_usage_events`, and rolls up cost/rate-limit metadata before completion.
- `MockBackupService`: replace fixture-backed calls with a transactional backup runner that writes snapshots, usage events, and rate-limit metadata.

## Deliberately Excluded

- Automatic DM
- Automatic follow/unfollow
- Automated posting
- Ban evasion flows
- Public raw X API payloads

## Validation Rules

`POST /api/backup/run` already constrains `tweetLimit` at the HTTP boundary. `ApiUsageLedgerService` adds a second backend guard by rejecting negative, fractional, `NaN`, or infinite values for usage and summary counters before repository writes.

## 2026-05-28 Supabase Ledger Adapter

`SupabaseApiUsageLedgerRepository` is now the production-facing adapter boundary for `ApiUsageLedgerService`. It maps camelCase service DTOs to Supabase snake_case rows, wraps writes in a transaction store interface, and rejects new `api_usage_events` before the user's `monthly_api_cost_limit_usd` would be crossed.
