# XGuard X API Scope

Created: 2026-05-23

## v0 Position

XGuard v0 is a read-only recovery preparation product.

It connects to the user's own X account, backs up profile and recent post data with the user's authorization, and creates a controlled proof-page DTO. It does not promise account restoration and does not automate write actions.

## Required OAuth Scopes

- `tweet.read`
- `users.read`
- `follows.read`
- `offline.access`

## Avoid in v0

- `tweet.write`
- `follows.write`
- DM write scopes
- Any scope needed only for automated posting, automated DM, or automated follow/unfollow

## Initial Endpoints

| Purpose | Endpoint | v0 Use |
|---|---|---|
| Authenticated user | `GET /2/users/me` | Identify connected account |
| Profile lookup | `GET /2/users/:id` | Save profile snapshot |
| Recent posts | `GET /2/users/:id/tweets` | Save recent owned posts |
| Followers | `GET /2/users/:id/followers` | P1, not public by default |
| Following | `GET /2/users/:id/following` | P1, not public by default |
| Usage | `GET /2/usage/tweets` | Track API consumption |

## Field Sets

### User

```text
user.fields=created_at,description,location,profile_image_url,public_metrics,verified
```

### Post

```text
tweet.fields=created_at,author_id,public_metrics,attachments,possibly_sensitive,referenced_tweets,conversation_id
```

### Media

```text
expansions=attachments.media_keys
media.fields=url,preview_image_url,alt_text,public_metrics
```

## Storage Rules

- Store raw payload internally only when required for debugging or reprocessing.
- Never publish raw payload directly.
- Generate `proof_pages.public_payload` as a redacted DTO.
- Keep follower/following individual lists private until policy and privacy handling are confirmed.
- Store API usage and rate-limit headers per backup run.
- Track deletion/protected/withheld/user deletion requests in a compliance queue.

## Product Copy Rules

- Say: "BAN後の再起動支援"
- Say: "証明ページ生成"
- Say: "事前バックアップ"
- Do not say: "BAN復活"
- Do not say: "自動復元"
- Do not imply ban evasion.

## Open Questions

- Developer Console endpoint-level prices.
- Exact monthly API cost for a 3,000 JPY/month subscription.
- Whether media files can be copied to XGuard storage or only referenced.
- Whether follower/following IDs can be stored for recovery use and under what retention rules.
- Whether Supabase Vault is sufficient for refresh token encryption.
