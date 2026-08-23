# XGuard

XGuardは、Xアカウントのプロフィールと直近投稿をread-onlyで保全し、問題発生後の本人確認と手動再起動を支えるプロトタイプです。BANの自動解除や自動投稿を行うサービスではありません。

## 現在地

- customerとadminは、同じrepository内の独立したVite + React applicationです。
- customerはmock OAuthを使ったローカル保全フローまで確認できます。
- adminはSupabase Authの招待済みemail magic linkとrole確認を前提にしています。
- configured X OAuthの実token exchangeは未実装です。production callbackは安全のため`501`で停止します。
- production deploy、実Supabase接続、実domainでのcustomer/admin分離確認は、コード・CI完了とは別の検証項目です。

## 画面構成

| 対象 | Local URL | 許可route | 目的 | 実装 |
|---|---|---|---|---|
| customer | `http://localhost:5173` | `/` | Xアカウント確認、プロフィールと直近25投稿の保全、保全結果の確認 | `frontend/customer/` |
| admin | `http://localhost:5174` | `/login`, `/auth/callback`, `/`, `/team` | magic link認証、運用snapshot確認、ownerによるmember管理 | `frontend/admin/` |

customerとadminはentrypoint、CSS、API client、build output、testを共有しません。共有範囲はroot `shared/`のDTOと、`frontend/shared/`のaudience非依存token/test setupだけです。

```text
frontend/
├── customer/               # customer app
│   └── src/
│       ├── CustomerApp.tsx # `/`以外を404にするapp shell
│       ├── CustomerPortal.tsx
│       └── api.ts          # customer APIのみ
├── admin/                  # admin app
│   └── src/
│       ├── AdminApp.tsx    # admin routeとrole別画面
│       ├── auth.ts         # Supabase magic link / PKCE
│       └── api.ts          # `/api/admin/*`のみ
└── shared/                 # audience非依存の共通要素
```

productionではcustomerを`app.<base-domain>`、adminを`admin.<base-domain>`へ別originで配信します。customer側の`/admin`、`/login`、未知pathと、admin側の許可route以外は404です。詳細は`docs/AUDIENCE_SEPARATION.md`を参照してください。

### customer `/`

1. Xのusernameを入力し、OAuthを開始する。
2. 確認できたアカウントと入力usernameが一致した場合だけ、プロフィールと直近25投稿を保全する。
3. 完了後にbackup runと公開用proof DTOの要約を表示する。

画面内には保全対象、安全性、FAQも表示します。mock modeではOAuth callbackをローカルで完了できますが、実X OAuth接続が完成したことは意味しません。

### admin

| Route | 画面の目的 |
|---|---|
| `/login` | 招待済みemailへmagic linkを送る |
| `/auth/callback` | PKCE codeをsessionへ交換し、backendで`admin_members`を確認する |
| `/` | backup run、proof page、compliance eventのread-only snapshotと要対応件数を確認する |
| `/team` | `owner`だけがmemberを招待し、role/statusを管理する |

`operator`と`viewer`はdashboardのread-only snapshotを利用でき、member管理は`owner`だけです。Supabase URLとpublishable keyがない状態ではadmin認証は動きません。`SUPABASE_SERVICE_ROLE_KEY`はbackend/bootstrap専用で、frontendへ設定しません。

## ローカル起動

CIはNode.js 22を使用します。初回は依存関係を固定してinstallします。

```bash
npm ci
```

3つのterminalで起動します。

```bash
npm run dev:api            # http://localhost:4000
npm run dev:web:customer   # http://localhost:5173
npm run dev:web:admin      # http://localhost:5174
```

`npm run dev:web`はcustomer起動のaliasです。customer/adminとも`/api`と`/health`をlocal backendへproxyします。

customerのmock smokeは環境変数未設定でも実行できます。adminをブラウザ確認する場合は、少なくとも次のfrontend値と、対応するbackend/Supabase設定が必要です。

```env
VITE_SUPABASE_URL=https://project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_ADMIN_REDIRECT_URL=http://localhost:5174/auth/callback
```

backend/productionの環境変数とrollout順は`docs/DEPLOY.md`、mock API smokeの手順は`docs/LOCAL_STATUS_CHECK.md`を参照してください。

## テスト・検証コマンド

| 目的 | Command | 確認範囲 |
|---|---|---|
| customer test | `npm run test:web:customer` | customer component、保全フロー、404 |
| admin test | `npm run test:web:admin` | magic link、callback、dashboard、team、404 |
| production依存audit | `npm run audit:production` | production依存の既知脆弱性がないこと |
| customer build | `npm run build:web:customer` | `dist/frontend-customer/` |
| admin build | `npm run build:web:admin` | `dist/frontend-admin/` |
| bundle境界 | `npm run build:web && npm run check:bundle-separation` | customer bundleへのadmin情報混入と、その逆を検出 |
| 全体gate | `npm run check` | frontend typecheck、API/customer/admin build、bundle境界、全Vitest |
| Supabase integration前提 | `npm run check:supabase-integration-env` | integration flag、DB URL、`psql`、schemaの有無 |

変更後の最小gateは次の順です。

```bash
git diff --check
npm run check
```

画面を変更した場合は、全体gateに加えてcustomer/adminを別portで起動し、許可routeと404をブラウザで確認します。Supabase SQL integration testは実DB URLを必要とするため、通常のunit testとは分けて実施します。

## 2026年8月にテスト段階を完了する最短ルート

Node.js 22のclean install baselineは、commit `afa8f10a927e641764326758eac5d6c3a05ca1e4`で`npm ci && npm run check`とGitHub Actionsの成功を確認済みです。次は実Supabase staging検証とlive X OAuthを独立して完了し、その後にstaging E2Eへ進みます。

baselineがgreenになった後は、機能追加を広げず次の順で確認します。

1. customer mock smoke: `/`のアカウント確認、保全、完了表示と、`/admin`を含む未知pathの404。
2. admin staging smoke: `/login`、`/auth/callback`、dashboard、ownerの`/team`、viewer/operatorの権限制限。
3. 別origin smoke: customer/adminのCORS、adminの`noindex`、bundle境界、API権限分離。
4. 結果をpass/failで記録し、失敗だけを小さなIssueにする。

この4項目が揃った状態を「テスト段階完了」とし、production準備は別判定にします。実X OAuth token exchange、実credential、DNS、deploy runtimeの確認が終わるまではproduction-readyと扱いません。

## v0の安全境界

- OAuth scopeは`tweet.read`、`users.read`、`offline.access`だけにする。
- 自動DM、自動follow/unfollow、自動投稿、BAN回避導線を作らない。
- raw X API payloadやtoken materialをfrontend/public proof pageへ出さない。
- service-role keyはbackendまたはbootstrapだけに置く。

## 関連ドキュメント

- `docs/AUDIENCE_SEPARATION.md`: customer/adminのorigin、認証、認可、rollout境界。
- `docs/FRONTEND_DIRECTORY_STRUCTURE.md`: frontendのimport/build/test境界。
- `docs/LOCAL_STATUS_CHECK.md`: mock APIとlocal smoke手順。
- `docs/DEPLOY.md`: environment、deploy順、release gate。
- `docs/API_SPEC.md`: backend routeとinterface。
- `docs/ARCHITECTURE.md`: backend-first architectureと安全境界。
- `docs/COMPLIANCE.md`: proof page、削除、manual reviewのcontract。

計画と会社運用メモの正本は`/Users/uryuatsuya/Documents/ObsidianVault/MyLife/company/projects/x-ban-recovery-storage`です。通常の変更は`feature/*`から`develop`へpull requestを作成し、検証済みの同一commitだけを`develop`から`main`へ昇格します。
