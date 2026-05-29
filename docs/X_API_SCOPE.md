# XGuard X API Scope

作成日: 2026-05-23

## v0 Position

XGuard v0 は read-only recovery preparation product である。

user 自身の X account に接続し、user authorization のもとで profile と recent post data を backup し、controlled proof-page DTO を作成する。account restoration は約束せず、write actions も自動化しない。

## 必須 OAuth Scopes

- `tweet.read`
- `users.read`
- `offline.access`

`follows.read` は P1 のみ。follower/following retention、privacy、cost handling が確認されるまで、v0 では request しない。

## v0 で避けるもの

- `tweet.write`
- `follows.write`
- DM write scopes
- automated posting、automated DM、automated follow/unfollow だけに必要な scopes

## 初期 Endpoints

| 目的 | Endpoint | v0 の使い方 |
|---|---|---|
| Authenticated user | `GET /2/users/me` | connected account を識別する |
| Profile lookup | `GET /2/users/:id` | profile snapshot を保存する |
| Recent posts | `GET /2/users/:id/tweets` | recent owned posts を保存する |
| Followers | `GET /2/users/:id/followers` | P1。default では public にしない |
| Following | `GET /2/users/:id/following` | P1。default では public にしない |
| Usage | `GET /2/usage/tweets` | API consumption を track する |

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

- debugging または reprocessing に必要な場合のみ、raw payload を internal に保存する。
- raw payload を直接 publish しない。
- `proof_pages.public_payload` は redacted DTO として生成する。
- policy と privacy handling が確認されるまで、follower/following individual lists は private に保つ。
- backup run ごとに API usage と rate-limit headers を保存する。
- deletion/protected/withheld/user deletion requests を compliance queue で track する。

## Product Copy Rules

- Say: "BAN後の再起動支援"
- Say: "証明ページ生成"
- Say: "事前バックアップ"
- Do not say: "BAN復活"
- Do not say: "自動復元"
- ban evasion を示唆しない。

## 未解決 Questions

- Developer Console endpoint-level prices。
- 3,000 JPY/month subscription の exact monthly API cost。
- media files を XGuard storage に copy できるか、reference のみにするべきか。
- follower/following IDs を recovery use 用に保存できるか、また retention rules は何か。
- Supabase Vault が refresh token encryption に十分か。
