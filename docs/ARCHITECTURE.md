# XGuard Architecture

更新日: 2026-08-23

## サービス境界

XGuardは、Xアカウントのprofileと直近投稿をread-onlyで保全し、問題発生後の本人確認と手動復旧を支えるprototypeである。自動解除、自動投稿、自動DM、follow/unfollow、ban回避は対象にしない。

現在のrepositoryは、audienceごとに分離した2つのfrontend、Express backend、Supabase向けschema / repository boundaryで構成する。

| Layer | 現在の実装 | Runtime上の状態 |
|---|---|---|
| Customer frontend | `frontend/customer/`の独立Vite app | `/`だけを許可し、customer APIだけを呼ぶ |
| Admin frontend | `frontend/admin/`の独立Vite app | `/login`、`/auth/callback`、`/`、`/team`だけを許可する |
| Backend API | `backend/src/app.ts`のExpress app、Node.js 22 multi-stage image | non-root containerでcustomer/admin APIを別CORS allowlistと別認証境界で提供する |
| Database/Auth | `supabase/schema.sql`、Supabase Auth、service-role HTTP repository | 一部repositoryはruntime接続済み。実staging DBでの統合検証は未完了 |
| X API | mock / live OAuth・API client | configured modeでtoken exchange、本人照合、profile / recent posts readを実行可能。実staging smokeは未完了 |

production想定ではcustomerを`app.<base-domain>`、adminを`admin.<base-domain>`へ別originで配信し、backend APIとSupabaseをfrontendから分離する。配置、route、bundleの詳細は`docs/AUDIENCE_SEPARATION.md`、環境変数とrollout順は`docs/DEPLOY.md`を正本とする。

## Source Boundary

```text
frontend/
├── customer/    customer entrypoint、UI、CSS、API client、test
├── admin/       admin entrypoint、UI、CSS、API client、Auth、test
└── shared/      audience非依存のstyle tokenとtest setup
backend/
└── src/
    ├── admin/         Supabase Auth verification、member認可、招待
    ├── clients/       X API client contractとmock client
    ├── repositories/ memory / Supabase repository boundary
    └── services/      backup、proof DTO、usage ledger、OAuth exchange boundary
shared/          frontend/backendで共有するpublic DTO
supabase/        schema、RLS、service-role-only table、transaction RPC
sites/           customer/admin Sites Worker route boundary
docs/            API、deploy、audience分離、complianceのcontract
```

customerとadminはentrypoint、CSS、API client、build output、testを共有しない。共有範囲はroot `shared/`のDTOと`frontend/shared/`のaudience非依存要素に限定する。`npm run check:bundle-separation`が相互bundleへの管理API・画面文言の混入を検出する。

## Customer Request Flow

1. Customer frontendが保全対象のusernameを付けて`GET /api/x/oauth/start`を呼ぶ。
2. BackendはPKCE `code_verifier`、username、stateを`OAuthStateRepository`へ有効期限付きで保存する。development既定はmemory、`OAUTH_STATE_REPOSITORY=supabase`ではservice-role経由で`oauth_states`を使う。
3. `GET /api/x/oauth/callback`はstateを一度だけconsumeし、expired / invalid stateを拒否する。
4. mock modeではprototype token referenceを使う。configured modeではAuthorization Code + PKCEでX token endpointへ交換し、`GET /2/users/me`で入力usernameと本人accountを照合する。
5. raw access / refresh tokenはAES-256-GCMでbackend-only volumeへ保存し、app repositoryにはopaque referenceだけを渡す。callbackはcustomer sessionをURL fragmentでcustomer appへ戻し、frontendは復帰直後にfragmentを削除して`GET /api/customer/session`でaccountを復元する。
6. `POST /api/backup/run`はmock modeではfixture、configured modeでは`GET /2/users/me`と`GET /2/users/:id/tweets`からprofile / recent postsを読み、in-memory usage ledgerへ計測結果を記録する。
7. Backendはraw payloadではなくredacted public proof DTOを組み立てる。proof pageはmemory、または`CONTENT_COMPLIANCE_EVENT_REPOSITORY=supabase`時にSupabaseへ保存する。
8. Customer sessionを持つ本人だけがbackup status、proof visibility、公開可能なproof DTOへアクセスできる。revoke時はcompliance eventも記録する。

unit / component testの成功は、実X credentialでのconsent、persistent volume、実Supabase、backup全体のtransactional persistenceが動作した証明ではない。

## Admin Request Flow

1. Admin frontendはSupabase Authの招待済みemail magic linkとPKCEを使う。`shouldCreateUser: false`により未招待userを自動作成しない。
2. `/auth/callback`でcodeをSupabase sessionへ交換し、access tokenをbrowserの`sessionStorage`に保持する。
3. BackendはSupabase JWKS、issuer、`authenticated` audience、有効期限を検証する。
4. 各admin requestで`admin_members`のemail、Supabase user ID、`active` status、roleをservice-role経由で確認する。
5. `owner`だけがmember一覧、招待、role/status変更を実行できる。`operator`と`viewer`はdatabase snapshotをread-onlyで利用できる。
6. X OAuthで作られたcustomer sessionはadmin APIで拒否する。

`admin_members`と`admin_membership_events`はRLSを有効にし、`public`、`anon`、`authenticated`からのtable accessをrevokeしている。初回ownerはschema適用後に`npm run admin:bootstrap`で作成する。

## Persistence Status

| Concern | Schema / contract | Runtime接続 | 未完了境界 |
|---|---|---|---|
| OAuth state | `oauth_states`、username + PKCE、single-use consume | memory / Supabaseを選択可能 | 実staging DB検証 |
| Admin member / Auth | `admin_members`、membership events、Supabase Auth | Supabase JWKS / REST / inviteへ接続可能 | staging redirect、owner bootstrap、role smoke |
| Proof page / compliance | `proof_pages`、`content_compliance_events`、visibility + event RPC | memory / Supabaseを選択可能 | 実DB transaction検証 |
| API usage ledger | `backup_runs`、`api_usage_events`、monthly cost guard RPCとrepository | backup runtimeはin-memory | 実DB接続とbackup flowへの組み込み |
| X token reference | `x_oauth_connections`と`SupabaseTokenRepository` contract | raw tokenはAES-256-GCM encrypted file、refはin-memory | persistent volume smoke、refresh rotation、connection refの実DB永続化 |
| Account / snapshot | `x_accounts`、profile/tweet/media snapshot schema | configured modeはlive X read、mock modeはfixture | snapshot / usageのtransactional persistence |
| Customer session | repository contract | app runtimeはin-memory | staging向け永続session設計 |
| Recovery data | `recovery_sessions`、`recovery_cases`、owner consistency constraint | API flow未接続 | staging integrationと運用flow |

`supabase/schema.sql`は全主要tableでRLSを有効にし、owner consistency、proof revocation + compliance event、monthly API cost guardなどのconstraint / transaction RPCを定義する。ただしschema contract testの成功と、実Supabase stagingへのmigration・service-role・transaction検証は別の完了条件である。

## API Boundary

| Audience | Endpoint | Auth / purpose |
|---|---|---|
| customer | `GET /api/x/oauth/start?username=...` | usernameをPKCE/stateへ結び付けて開始する |
| customer | `GET /api/x/oauth/callback` | stateをconsumeし、mock接続またはlive exchange後にcustomerへ戻す |
| customer | `GET /api/customer/session` | callback fragmentのcustomer sessionで本人accountを復元する |
| diagnostic | `GET /api/x/oauth/status` | 明示的に有効化した短期diagnostic tokenでのみ利用する |
| customer | `POST /api/backup/run` | customer session必須。mock / configured modeに応じたread-only backup |
| customer | `GET /api/backup/status/:runId` | ownerだけがrunを参照する |
| customer | `PATCH /api/recovery/:runId/proof/visibility` | ownerだけが公開範囲を変更する |
| customer | `GET /api/recovery/:runId/proof` | private / revokedを公開せず、redacted DTOだけを返す |
| admin | `GET /api/admin/session` | Supabase tokenとactive memberを確認する |
| admin | `GET /api/admin/database-snapshot` | active admin member向けread-only snapshot |
| admin owner | member list / invitation / update | `owner` roleだけに許可する |

Backendはpathが`/api/admin`で始まるrequestだけにadmin CORS allowlistを使い、それ以外はcustomer allowlistを使う。service-role key、X secret、raw token、raw X payloadはfrontend/public DTOへ渡さない。

## Safety Boundaries

- X OAuth scopeは`tweet.read`、`users.read`、`offline.access`だけにする。
- 自動DM、follow/unfollow、posting、ban evasion workflowを作らない。
- raw X API payloadを公開せず、proof pageはredacted DTOから生成する。
- token materialとservice-role keyをbackend-only boundaryに留める。
- customer/adminをroute、bundle、CORS、認証、認可の各境界で分離する。
- 1回のfailed requestからfinal ban statusを断定しない。
- paid usageはmonthly cost guardを通し、無制限retryを行わない。

## Verification Evidenceと未完了項目

baseline commit `afa8f10a927e641764326758eac5d6c3a05ca1e4`では、Node.js 22 clean installの`npm ci && npm run check`と同一commitのGitHub Actionsが成功している。これはtypecheck、backend/customer/admin build、bundle separation、unit/component testのbaselineであり、production readinessの証明ではない。

次の項目は未完了である。

- `supabase/schema.sql`の実staging適用、RLS、service-role、transaction integration test
- 実X credentialによるconsent、callback、本人照合、live backupのstaging evidence
- encrypted token volumeの永続性、refresh rotation、利用者disconnect時のrevoke endpoint
- customer/admin/backendのstaging deploy、別origin、CORS、redirect、role E2E
- credential非露出、runtime log、search `noindex`、custom domain / DNSの実環境確認

実装順は、Supabase staging検証（#44）とlive X OAuth（#45）を完了してから、staging deploy / E2E（#46）へ進む。CIがgreenでも、これらのruntime evidenceが揃うまではproduction-readyと扱わない。

## 関連ドキュメント

- `README.md`: 現在地、local起動、日常の検証コマンド
- `docs/AUDIENCE_SEPARATION.md`: customer/adminのorigin、route、bundle、Auth境界
- `docs/DEPLOY.md`: environment、secret、deploy順、release gate
- `docs/API_SPEC.md`: backend endpointとDTO contract
- `docs/COMPLIANCE.md`: proof page、削除、manual review contract
