# 顧客画面・管理画面のorigin分離

更新日: 2026-07-19

## 配置

| Audience | URL | Source | Build output | Sites project |
|---|---|---|---|---|
| customer | `https://app.<base-domain>` | `frontend/customer/` | `dist/frontend-customer/` | root `.openai/hosting.json` |
| admin | `https://admin.<base-domain>` | `frontend/admin/` | `dist/frontend-admin/` | `sites/admin/.openai/hosting.json` |

2つのVite applicationはentry、build、test、CSS、API clientを共有しない。共有できるのはroot `shared/` のDTOと、`frontend/shared/` のaudience非依存UI token/test setupだけである。

customerには `/` の保全フローだけを配置する。Sites WorkerはSPA全体fallbackを行わないため、`/admin`、`/login`、未知pathはHTTP 404になる。customer buildに `/api/admin`、管理component、管理画面文言が入っていないことを `npm run check:bundle-separation` で検証する。

adminは `/login`、`/auth/callback`、`/`、`/team` だけをSPA routeとして許可する。検索エンジン向けにはHTML metaとWorker response headerの両方で`noindex`を指定する。customerへのlinkは置かない。

## 認証・認可

- Supabase Authのemail magic linkとPKCEを使う。
- browser側はpublishable keyだけを使い、`shouldCreateUser: false`で未招待userの自動作成を止める。
- access tokenはbrowserの`sessionStorage`に保存し、管理APIの`Authorization: Bearer`だけに利用する。
- backendはSupabase JWKS、issuer、`authenticated` audience、有効期限を検証する。
- backendはrequestごとに`admin_members`のemail、Supabase user ID、`active` status、roleを検証する。
- `owner`はmember管理、`operator`と`viewer`はread-only snapshotを利用できる。
- X OAuthで発行したcustomer session tokenは管理APIで403になる。
- `admin_members`と`admin_membership_events`はRLSを有効にし、service-role以外のtable accessをrevokeする。

## 環境変数

hostnameは固定せず環境変数で指定する。

Backend:

```env
CUSTOMER_CORS_ORIGINS=https://app.example.com
ADMIN_CORS_ORIGINS=https://admin.example.com
ADMIN_AUTH_MODE=supabase
ADMIN_REDIRECT_URL=https://admin.example.com/auth/callback
SUPABASE_URL=https://project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
```

Admin frontend:

```env
VITE_XGUARD_API_BASE_URL=https://api.example.com
VITE_SUPABASE_URL=https://project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_ADMIN_REDIRECT_URL=https://admin.example.com/auth/callback
```

`SUPABASE_SERVICE_ROLE_KEY`はbackendとbootstrap scriptだけに置き、`VITE_*`には絶対に設定しない。Supabase Authのredirect allowlistにもadmin callback URLを登録する。

`npm run build:sites:customer`はpublic HTTPSの`VITE_XGUARD_API_BASE_URL`を必須にする。`npm run build:sites:admin`はそれに加えて`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`、`VITE_ADMIN_REDIRECT_URL`を検証する。localhost、private IP、URL credential、query/hash、API baseのpath、`service_role`形式のkeyはartifact生成前に拒否し、preflight outputへ値を表示しない。

## 初回ownerとrollout

schema適用後、backend環境に`ADMIN_BOOTSTRAP_EMAIL`を一時的に設定し、次を一度だけ実行する。

```bash
npm run admin:bootstrap
```

scriptは既存memberがある場合に停止し、秘密情報やmagic linkを出力しない。rollout順はschema/backend、非公開admin deploy、owner bootstrap、admin smoke、customer deploy、custom domain/DNS接続とする。
