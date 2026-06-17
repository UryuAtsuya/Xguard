# XGuard Architecture

作成日: 2026-05-25

## 現在の構成

XGuard は read-only recovery preparation service である。implementation repo は product code を MyLife Vault の外に置き、prototype の関心事を次のように分ける。

```text
backend/   Express API、repository boundaries、backup/proof services、usage ledger
frontend/  Vite + React の cast recovery UI、mock OAuth から backup/proof までの操作画面
shared/    frontend と backend で共有する DTOs
supabase/  auth profile、X backup、proof page、compliance、Stripe event の初期schema
docs/      implementation contracts と deployment notes
```

現在の prototype は fixture-backed な backend と API 接続済み frontend で、mock OAuth、backup run、proof visibility、redacted proof DTO 取得までをローカルで確認できる。Supabase-backed persistence layer と live X API adapter はまだ production replacement 境界であり、live API calls や paid usage を導入する前に repository boundary と cost guardrails を review できるようにしている。

## v0 Request Flow

1. user が最小 scope の `tweet.read`、`users.read`、`offline.access` で X OAuth を開始する。
2. callback は token references だけを保存する。Raw token material は Supabase Vault または同等の KMS-backed table など、backend-only secret store に留める。
3. backup run は user 自身の profile と recent posts を読む。
4. backend は X API adapter call ごとに usage event を 1 件記録し、conservative cost と最新 rate-limit metadata を backup run に roll up する。
5. real Supabase adapter は account snapshots、tweet snapshots、backup run status、API usage events を 1 つの transactional unit で書き込む必要がある。
6. Proof pages は redacted public DTO から生成する。Raw X API payloads は公開しない。
7. Compliance events は proof pages を revoke したり、deleted/protected/withheld content を removal 対象として mark できる。

## Safety Boundaries

- 自動 DM、follow/unfollow、posting、ban evasion workflow は作らない。
- retention、privacy、cost が承認されるまで、v0 では `follows.read` を使わない。
- Frontend code は token refs、raw tokens、service-role keys、raw Stripe payloads を受け取らない。
- Account state transitions は、1 回の failed request から final ban status を断定せず、`connected`、`auth_expired`、`rate_limited`、`suspected_banned`、`banned`、`deleted`、`unknown` を使う。

## 次の実装境界

`InMemoryTokenRepository` を service-role store に支えられた `SupabaseTokenRepository` に置き換える。repository contract は次を support する必要がある。

- OAuth callback 後に token references を保存する。
- backend jobs 用に non-revoked token references を読む。
- accounts を `auth_expired` に移す。
- user deletion または disconnect 後に token rows を revoke する。


## 2026-05-26 Ledger 境界

`ApiUsageLedgerService` は cost-aware backup runs の backend contract である。prototype は in-memory のままだが、production repository は次を行う Supabase transaction を使う必要がある。

- X API calls の前に `backup_runs` row を作成する。
- endpoint、resource count、conservative estimated cost、rate-limit headers 付きで `api_usage_events` を insert する。
- すべての events を記録した後に backup run summary を update する。
- `user_profiles.monthly_api_cost_limit_usd` を超える前に run を stop または mark する。

## 2026-05-27 Ledger 検証

usage ledger は repository write の前に service boundary で metering counts を validate する。Production Supabase code は、input を validate し、transactional rows を create または append し、その後 completed `backup_runs` summary を roll up する、という順序を維持する必要がある。Invalid negative、fractional、`NaN`、infinite counts は、`api_usage_events` や monthly cost guardrails に影響する前に fail させる。

## 2026-05-28 Supabase Ledger Repository

`SupabaseApiUsageLedgerRepository` は Supabase transaction store boundary を導入しながら service contract を安定させる。adapter は `backup_runs` を作成し、`api_usage_events` を insert し、rollup 用 events を list し、後で real service-role Supabase client が実装できる 1 つの interface 経由で summaries を update する。

Usage events は insert 前に user の current monthly API cost status を確認する。Projected cost が `monthly_api_cost_limit_usd` を超える場合、adapter は event を persist する前に fail するため、backup workers は paid usage を無言で増やさずに run を stop または mark できる。
