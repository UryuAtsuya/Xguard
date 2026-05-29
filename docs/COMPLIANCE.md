# XGuard Compliance Contract

作成日: 2026-05-25

## Product Boundary（プロダクト境界）

XGuard は user-authorized backup data を保存し、controlled proof pages を生成する。ban evasion、mass outreach、platform manipulation に見える行動を自動化してはならない。

v0 から除外するもの:

- 自動 DM,
- 自動 follow/unfollow,
- 自動 posting,
- follower list publication,
- raw X payload publication,
- X enforcement を迂回する手順。

## Deletion と Visibility

Compliance events は public proof pages を revoke し、deleted、protected、withheld、または user-requested content を非表示にできる必要がある。

必要な event types:

- `tweet_deleted`
- `tweet_protected`
- `tweet_withheld`
- `tweet_changed`
- `user_deleted`
- `user_suspended`
- `user_request_delete`
- `proof_page_revoked`

## Public Proof DTO Rules

Proof pages は raw API responses ではなく `ProofPublicPayload` を使う。

公開できる fields:

- username と display name,
- public profile summary,
- captured date range,
- aggregate snapshot counts,
- redacted representative posts,
- 信頼性に必要な public metrics。

公開してはいけない fields:

- OAuth token refs または raw tokens,
- service-role keys,
- raw X API payloads,
- private compliance notes,
- raw Stripe webhook payloads。

## Manual Review Queue

Recovery messaging は manual review queue のまま扱う。XGuard は owner review 用の copy draft を作ってよいが、v0 では messages の送信や accounts の follow を自動実行してはならない。
