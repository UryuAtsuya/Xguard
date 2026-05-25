# XGuard Architecture

Created: 2026-05-25

## Current Shape

XGuard is a read-only recovery preparation service. The implementation repo keeps product code outside the MyLife Vault and separates prototype concerns into:

```text
backend/   Express API, repository boundaries, backup/proof services
shared/    DTOs shared by frontend and backend
docs/      implementation contracts and deployment notes
```

The frontend and Supabase-backed persistence layer are still planned. The current backend prototype is intentionally fixture-backed so the API boundary can be reviewed before live X API calls or paid usage are introduced.

## v0 Request Flow

1. A user starts X OAuth with the minimum scope: `tweet.read`, `users.read`, `offline.access`.
2. The callback stores token references only. Raw token material must stay in a backend-only secret store such as Supabase Vault or an equivalent KMS-backed table.
3. A backup run reads the user's own profile and recent posts.
4. The backend writes account snapshots, tweet snapshots, backup run status, and API usage events in one transactional unit.
5. Proof pages are generated from a redacted public DTO. Raw X API payloads are never published.
6. Compliance events can revoke proof pages or mark deleted/protected/withheld content for removal.

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
