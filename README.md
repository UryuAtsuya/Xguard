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

## Source of Truth

Planning and company notes are maintained in:

`/Users/uryuatsuya/Documents/ObsidianVault/MyLife/company/projects/x-ban-recovery-storage`
