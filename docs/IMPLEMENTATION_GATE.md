# XGuard Implementation Gate

Created: 2026-05-23

## Before Product Code

- Confirm endpoint-level pricing in X Developer Console.
- Finalize read-only OAuth scopes.
- Add secure OAuth token storage to the DB schema.
- Add API usage tracking and backup run logging.
- Add proof-page visibility, revocation, and redaction fields.
- Add content compliance events.
- Add Stripe webhook idempotency.

## First Code Spike

1. OAuth callback skeleton.
2. Token repository interface.
3. X API client interface.
4. Mock backup run that writes no external data.
5. Proof DTO builder with fixture input.

## Do Not Build Yet

- Next.js marketing LP.
- Automated DM.
- Automated follow/unfollow.
- Automated posting.
- AI-generated mass outreach.
- Public follower/following directory.

## Go Criteria

- Read-only flow can be tested without write scopes.
- Token storage design avoids plaintext token exposure to the frontend.
- Proof payload is a separate DTO, not raw X API response JSON.
- Each backup run records usage, rate limit headers, and errors.
- Compliance deletion path is represented in schema before launch.
