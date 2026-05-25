# XGuard

XGuard is a read-first recovery preparation service for X accounts.

The v0 goal is not to restore banned accounts. The product stores user-authorized account data before trouble happens, then helps the user publish a controlled proof page and restart from a new account.

## Current Scope

- OAuth connection for the user's own X account.
- Read-only backup of profile and recent posts.
- Public proof-page DTO generated from stored data.
- Compliance queue for deleted/protected/withheld content and user deletion requests.
- Stripe subscription and webhook idempotency design.

## Out of Scope for v0

- Automatic DM.
- Automatic follow/unfollow.
- Ban evasion.
- Publishing raw X API payloads.
- Bulk follower list publication.
- Automated posting.

## Documents

- `docs/X_API_SCOPE.md`: current X API data and policy scope.
- `docs/IMPLEMENTATION_GATE.md`: checklist before writing product code.
- `docs/API_SPEC.md`: current backend prototype routes and replacement interfaces.
- `docs/ARCHITECTURE.md`: current backend-first architecture and safety boundaries.
- `docs/API_COST_MODEL.md`: API usage event and cost tracking contract.
- `docs/COMPLIANCE.md`: proof-page, deletion, and manual-review compliance contract.

## Prototype Code

The first code spike is backend-first:

```text
backend/       Express API prototype, mock X client, token repository boundary
shared/        TypeScript DTOs shared by frontend/backend later
supabase/      Initial schema for auth profiles, X backups, proof pages, compliance, Stripe events
```

Run locally:

```bash
npm install
npm run dev:api
```

Verify:

```bash
npm run check
```

## Source of Truth

Planning and company notes are maintained in:

`/Users/uryuatsuya/Documents/ObsidianVault/MyLife/company/projects/x-ban-recovery-storage`

## GitHub Sync Rule

Meaningful coding work should be committed and pushed to `UryuAtsuya/Xguard` after verification. If `origin` is missing, set it to:

```bash
git remote add origin https://github.com/UryuAtsuya/Xguard.git
```
