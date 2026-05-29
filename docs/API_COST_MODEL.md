# XGuard API コストモデル

作成日: 2026-05-25

## コスト方針

XGuard v0 は X API usage を metered backend cost として扱う。すべての live API call は `api_usage_events` record を作成し、backup-related calls を該当する `backup_runs.id` に紐づける必要がある。

production pricing を設定する前に、Developer Console values の manual confirmation がまだ必要である。それまでは、この file を final pricing truth ではなく implementation contract として使う。

## 記録する Events

| Field | 目的 |
|---|---|
| `endpoint` | 正確な X API endpoint または internal adapter name |
| `method` | HTTP method |
| `resource_type` | `post`, `user`, `media`, `usage`, or `unknown` |
| `resource_count` | request または return された posts/users/media objects の数 |
| `owned_read` | authenticated user 自身の data に対する read かどうか |
| `estimated_cost_usd` | call 時点の cost estimate |
| `rate_limit_limit` | 提供された場合の X rate-limit ceiling |
| `rate_limit_remaining` | 提供された場合の remaining calls |
| `rate_limit_reset_at` | 提供された場合の reset timestamp |
| `status_code` | cost/error analysis 用 HTTP status |

## v0 デフォルト

- `owned_read`: authenticated user 自身の profile と posts では `true`。
- `estimated_cost_usd`: Developer Console pricing がこの file に転記されるまで、conservative public read estimates を使う。
- `monthly_api_cost_limit_usd`: `user_profiles` の user-level guardrail。
- Backup jobs は user monthly cost limit を超える前に stop する必要がある。

## 2026-05-26 実装契約

`ApiUsageLedgerService` は `backup_runs` と `api_usage_events` の backend boundary である。prototype は X API adapter call ごとに event を 1 件記録し、それを backup run に attach し、`api_units_used`、`estimated_cost_usd`、latest rate-limit metadata を completed run に roll up する。

## 2026-05-27 検証契約

`ApiUsageLedgerService` は repository writes の前に invalid numeric quantities を拒否する。`tweetLimit`、`resourceCount`、`rateLimitLimit`、`rateLimitRemaining`、`tweetsCaptured`、`profilesCaptured` は non-negative integers でなければならない。Negative values、decimals、`NaN`、`Infinity` は programming または adapter errors として扱い、`api_usage_events` の作成や `backup_runs` の update をしてはならない。

real app から Developer Console values が転記されるまで、service は conservative public read estimates を使う。

| Resource type | Prototype unit cost | 補足 |
|---|---:|---|
| `post` | `$0.005` | `GET /2/users/:id/tweets` で使用する。 |
| `user` | `$0.010` | `GET /2/users/me` と profile lookup で使用する。 |
| `follower` / `following` | `$0.010` | future P1 用にのみ track する。`follows.read` は v0 の外に置く。 |
| `media` / `usage` / `unknown` | `$0.000` | endpoint-specific pricing が確認されるまでの placeholder。 |

`owned_read` は記録するが、この third-party SaaS use case に lower rate が適用されると Developer Console で確認できるまで、estimates には Owned Reads discount を適用しない。

## 未完了の Manual Check

X Developer Console で確認すること:

- user lookup と post lookup の endpoint-level pricing。
- monthly spending limit と alert settings。
- plan で Usage API access が利用できるか。
- authenticated third-party SaaS backups に Owned Reads pricing が適用されるか。
- target endpoints が返す rate-limit headers。

## 2026-05-27 検証契約

`ApiUsageLedgerService` は repository writes の前に invalid metering numbers を拒否する。service は `tweetLimit`、`resourceCount`、rate-limit counters、`tweetsCaptured`、`profilesCaptured` に non-negative integers を要求する。`estimateXApiReadCostUsd` も cost estimate の計算前に invalid `resourceCount` values を拒否する。

これにより、後続の Supabase transaction repository が negative、fractional、`NaN`、infinite usage totals を persist しないようにする。この environment では Developer Console values がまだ manually confirmed ではないため、上記の conservative prototype prices を active implementation default とする。

## 2026-05-28 Supabase Transaction 境界

`SupabaseApiUsageLedgerRepository` は service-role Supabase client 用の adapter boundary を提供する。`api_usage_events` row を insert する前に user の current monthly API cost を確認し、projected cost が `monthly_api_cost_limit_usd` を超える場合は `api_usage_ledger_monthly_cost_limit_exceeded:<userId>` を throw する。

schema には `record_api_usage_event_with_monthly_limit` も含まれる。この function は user の `user_profiles` row を lock し、current month の `api_usage_events` を sum し、新しい event が `monthly_api_cost_limit_usd` を超える場合は persistence 前に insert を拒否する。これにより、cost-limit enforcement を usage event insert と同じ database transaction 内に保つ。

現在の store contract は、real service-role implementation に対し、`backup_runs` summary updates と `api_usage_events` inserts を transactional に保ち、insert または guard check が fail した場合に partial usage event を残さないことを求める。SQL function は `public`、`anon`、`authenticated` roles には expose しない。
