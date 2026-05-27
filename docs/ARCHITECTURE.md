# XGuard Architecture

Created: 2026-05-25

## Current Shape

XGuard is a read-only recovery preparation service. The implementation repo keeps product code outside the MyLife Vault and separates prototype concerns into:

```text
backend/   Express API, repository boundaries, backup/proof services, usage ledger
shared/    DTOs shared by frontend and backend
docs/      implementation contracts and deployment notes
```

The frontend and Supabase-backed persistence layer are still planned. The current backend prototype is intentionally fixture-backed so the API boundary can be reviewed before live X API calls or paid usage are introduced.

## v0 Request Flow

1. A user starts X OAuth with the minimum scope: `tweet.read`, `users.read`, `offline.access`.
2. The callback stores token references only. Raw token material must stay in a backend-only secret store such as Supabase Vault or an equivalent KMS-backed table.
3. A backup run reads the user's own profile and recent posts.
4. The backend records one usage event per X API adapter call and rolls up conservative cost plus latest rate-limit metadata onto the backup run.
5. The real Supabase adapter must write account snapshots, tweet snapshots, backup run status, and API usage events in one transactional unit.
6. Proof pages are generated from a redacted public DTO. Raw X API payloads are never published.
7. Compliance events can revoke proof pages or mark deleted/protected/withheld content for removal.

## Safety Boundaries

- No automatic DM, follow/unfollow, posting, or ban evasion workflow.
- No `follows.read` in v0 until retention, privacy, and cost are approved.
- Frontend code never receives token refs, raw tokens, service-role keys, or raw Stripe payloads.
- Account state transitions use `connected`, `auth_expired`, `rate_limited`, `suspected_banned`, `banned`, `deleted`, and `unknown` instead of claiming final ban status from one failed request.

## Next Implementation Boundary

Replace `InMemoryTokenRepository` with `SupabaseTokenRepository` backed by a service-role store. The repository contract should support:

- saving token references after OAuth callback,
- reading non-revoked token references for backend jobs,
- moving accounts to `auth_expired`,
- revoking token rows after user deletion or disconnect.


## 2026-05-26 Ledger Boundary

`ApiUsageLedgerService` is the backend contract for cost-aware backup runs. The prototype remains in-memory, but the production repository must use a Supabase transaction that:

- creates the `backup_runs` row before X API calls,
- inserts `api_usage_events` with endpoint, resource count, conservative estimated cost, and rate-limit headers,
- updates the backup run summary after all events are recorded,
- stops or marks the run before crossing `user_profiles.monthly_api_cost_limit_usd`.

The service validates usage quantities before repository writes. Backup limits, resource counts, rate-limit counts, and captured snapshot totals must be non-negative integers so malformed adapter output cannot corrupt cost or quota rollups.
