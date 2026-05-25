# XGuard Compliance Contract

Created: 2026-05-25

## Product Boundary

XGuard stores user-authorized backup data and generates controlled proof pages. It must not automate behavior that looks like ban evasion, mass outreach, or platform manipulation.

Excluded from v0:

- automatic DM,
- automatic follow/unfollow,
- automated posting,
- follower list publication,
- raw X payload publication,
- instructions for bypassing X enforcement.

## Deletion And Visibility

Compliance events must be able to revoke public proof pages and hide deleted, protected, withheld, or user-requested content.

Required event types:

- `tweet_deleted`
- `tweet_protected`
- `tweet_withheld`
- `tweet_changed`
- `user_deleted`
- `user_suspended`
- `user_request_delete`
- `proof_page_revoked`

## Public Proof DTO Rules

Proof pages use `ProofPublicPayload`, not raw API responses.

Allowed public fields:

- username and display name,
- public profile summary,
- captured date range,
- aggregate snapshot counts,
- redacted representative posts,
- public metrics needed for credibility.

Disallowed public fields:

- OAuth token refs or raw tokens,
- service-role keys,
- raw X API payloads,
- private compliance notes,
- raw Stripe webhook payloads.

## Manual Review Queue

Recovery messaging remains a manual review queue. XGuard may draft copy for the owner to review, but v0 must not send messages or follow accounts automatically.
