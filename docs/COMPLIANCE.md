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

## 2026-06-07 Release Gate

### Enterprise プラン適用要否チェックリスト

次のいずれかに該当する場合、production release 前に X API Enterprise または契約変更の要否を確認する。

- 月次 tweet read が 100 万件を超える、または超える見込みがある。この値は X 公式capではなく、XGuard内部の conservative review threshold として扱う。
- 複数顧客の data を同一 backend / token management plane で扱い、standard tier の想定を超える usage pattern になる。
- Usage API、spending limit、削除/非公開追従、または retention 要件が Basic / Pro tier の範囲で満たせない。

v0 scope は `tweet.read`、`users.read`、`offline.access` のみに固定する。`follows.read`、write scopes、DM、自動 follow/unfollow、自動投稿、bulk outreach、BAN 回避と見える導線は release gate の外に置く。

### 24時間削除SLA

ユーザーが削除リクエストまたは退会を要求した場合、24時間以内に次を完了する。

- `x_oauth_connections` の token ref / session token を revoke または削除する。
- 対象 `x_account_id` に紐づく backup data と proof data を削除する。
- public proof page は即時 `revoked` にし、公開payloadを返さない。
- `content_compliance_events` または audit log に、リクエスト時刻、完了時刻、対象ID、担当者または実行jobを記録する。

proof page revoke だけが要求された場合は、proof page を `revoked` または `private` にして公開payloadを停止する。backup data の削除を伴うかはユーザー要求に従い、退会・削除要求と混同しない。

24時間以内に物理削除が完了できない storage がある場合でも、公開・参照・再処理は即時停止し、未完了理由と追跡IDを audit log に残す。

### API access 終了時の全削除runbook

X API access 終了、契約終了、重大なpolicy incident、または operator 判断でサービス停止する場合は、次の順序で全削除を実行する。

1. X API token と refresh token を revoke し、新規 backup worker / scheduler を停止する。
2. 対象 user または全 user の `backup_runs` と関連 snapshot rows を削除または irreversible purge queue に入れる。
3. 対象 `proof_pages` を `revoked` にし、public payload を返さない状態にした上で削除する。
4. session token、OAuth state、temporary export、operator-only working files を削除する。
5. audit log に削除完了、タイムスタンプ、対象scope、担当者、検証方法を記録する。

この runbook が production operations に移されるまで、public launch は No-Go とする。
