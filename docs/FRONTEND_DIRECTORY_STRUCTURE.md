# frontend の画面境界とディレクトリ構造

作成日: 2026-07-14

## 結論

XGuard の frontend は、単一 Vite application を維持しながら、`customer` と `admin` を `frontend/src/` 直下の独立した境界として配置する。

- お客様画面は入力、状況確認、復旧準備だけを扱う。
- 管理画面は DB snapshot、レビュー、保全状況、compliance を扱う。
- `customer` と `admin` は相互に import しない。
- 共有できるのは audience に依存しない HTTP、UI primitive、設定、utility だけとする。
- frontend の `/admin` 分離は認可の代替にしない。管理 API は backend で request ごとに認証・認可する。

## 現状

現在は `/` と `/admin` の URL と component は分かれているが、コード境界はまだ不十分である。

- `frontend/index.html` と `frontend/src/main.tsx` は単一 entry point である。
- `frontend/src/App.tsx` が audience 判定に加えて、お客様画面と管理画面の state、OAuth、backup、DB snapshot の操作をまとめて所有している。
- `frontend/src/api.ts` に customer API と admin API が混在している。
- `frontend/src/styles.css` に両画面の style が集約されている。
- `frontend/src/App.test.tsx` が両画面の integration test を同じ file で扱っている。

URL 分離はできているため、次は directory、state、API、CSS、test の所有権を audience ごとに揃える。

## 調査した設計原則

- React は UI を component hierarchy に分け、component の関心を一つに絞り、state は必要とする最も近い owner に置くことを推奨している。XGuard では customer state と admin state を共通 `App.tsx` ではなく各 audience に置く。参考: [Thinking in React](https://react.dev/learn/thinking-in-react)
- Vite は複数 HTML entry の Multi-Page App を公式にサポートしている。現時点では運用を二重化せず、別 origin や別 release cycle が必要になった場合の次段階として使う。参考: [Building for Production - Multi-Page App](https://vite.dev/guide/build#multi-page-app)
- OWASP は deny-by-default と request ごとの permission validation を推奨している。`/admin` の URL、別 component、lazy load は security boundary ではなく、backend authorization が必須である。参考: [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- Feature-Sliced Design は `app`、`pages`、`shared` などを責務で分け、必要な layer だけを採用できる。XGuard では audience 境界を最優先にした軽量な構成だけを採用する。参考: [Layers](https://feature-sliced.design/docs/reference/layers)

## 採用する構造

```text
frontend/
├── index.html
├── public/
├── src/
│   ├── app/
│   │   ├── App.tsx
│   │   ├── audience.ts
│   │   └── styles/
│   │       └── globals.css
│   ├── customer/
│   │   ├── CustomerApp.tsx
│   │   ├── pages/
│   │   │   └── home/
│   │   │       ├── CustomerHomePage.tsx
│   │   │       └── CustomerHomePage.test.tsx
│   │   ├── features/
│   │   │   ├── connect-x/
│   │   │   │   ├── api.ts
│   │   │   │   ├── model.ts
│   │   │   │   └── ConnectXForm.tsx
│   │   │   ├── run-backup/
│   │   │   │   ├── api.ts
│   │   │   │   ├── model.ts
│   │   │   │   └── RunBackupPanel.tsx
│   │   │   └── prepare-recovery/
│   │   │       ├── model.ts
│   │   │       └── RecoveryPanel.tsx
│   │   ├── styles/
│   │   │   └── customer.css
│   │   └── index.ts
│   ├── admin/
│   │   ├── AdminApp.tsx
│   │   ├── pages/
│   │   │   └── dashboard/
│   │   │       ├── AdminDashboardPage.tsx
│   │   │       └── AdminDashboardPage.test.tsx
│   │   ├── features/
│   │   │   ├── inspect-database/
│   │   │   │   ├── api.ts
│   │   │   │   ├── model.ts
│   │   │   │   └── DatabaseSnapshotPanel.tsx
│   │   │   └── review-compliance/
│   │   │       ├── model.ts
│   │   │       └── ComplianceReviewPanel.tsx
│   │   ├── styles/
│   │   │   └── admin.css
│   │   └── index.ts
│   ├── shared/
│   │   ├── api/
│   │   │   └── httpClient.ts
│   │   ├── config/
│   │   ├── lib/
│   │   │   └── formatDateTime.ts
│   │   ├── styles/
│   │   │   └── tokens.css
│   │   └── ui/
│   ├── test/
│   │   └── setup.ts
│   └── main.tsx
├── vite.config.ts
└── tsconfig.json
```

この tree は最終的な file 数を強制しない。空 directory を先に作らず、既存機能を移す slice で必要になった file だけを追加する。

## Directory の責務

### `app/`

application の起動と audience 解決だけを扱う。

- `App.tsx` は `/` と `/admin` の entry component を選択するだけにする。
- OAuth、backup、DB snapshot の state や API call を置かない。
- audience component は lazy import し、customer access 時に admin implementation を初期 load しない。

### `customer/`

お客様が理解・操作する機能を所有する。

- `@username` の入力
- read-only X 接続
- backup の実行と進捗
- proof / 復旧準備の確認

内部 DB 名、compliance event、運用 KPI、管理用 endpoint を表示・import しない。

### `admin/`

運用者だけが使う機能を所有する。

- DB snapshot
- backup / proof page の運用状態
- compliance review
- 将来の operator action

customer の session や state を流用しない。production では admin 専用 identity と role を backend が検証する。

### `shared/`

audience 非依存の技術部品だけを置く。

置いてよいもの:

- base URL と JSON error handling を行う `httpClient`
- button、spinner、visually-hidden など意味を持たない UI primitive
- date formatter
- color / spacing token

置かないもの:

- customer の backup workflow
- admin の DB table
- audience 固有 API function
- customer と admin の state をまとめた型

## Import rule

```text
app      -> customer, admin, shared
customer -> shared
admin    -> shared
shared   -> external packages only
```

次を禁止する。

- `customer/**` から `admin/**` の import
- `admin/**` から `customer/**` の import
- `shared/**` から `customer/**` または `admin/**` の import
- 別 audience の内部 file への deep import
- audience 固有の state を `app/` に持ち上げること

各 audience の外から利用できる module は `customer/index.ts` と `admin/index.ts` で明示する。将来 ESLint を導入する場合は `no-restricted-imports` でこの rule を自動化する。

## API と型の配置

- JSON transport と error handling は `shared/api/httpClient.ts` に置く。
- `/api/x/oauth/*` と `/api/backup/*` の呼び出しは該当する `customer/features/*/api.ts` が所有する。
- `/api/admin/*` の呼び出しは `admin/features/*/api.ts` が所有する。
- frontend/backend 共通 DTO の正本は既存の repository root `shared/` に維持する。
- 画面表示専用の state と view model は利用する audience / feature の `model.ts` に置く。

## CSS の配置

- reset、font、body の最低限だけを `app/styles/globals.css` に置く。
- brand color、spacing、radius など意味を持たない token は `shared/styles/tokens.css` に置く。
- お客様画面の visual rule は `customer/styles/customer.css` に置く。
- 管理画面の visual rule は `admin/styles/admin.css` に置く。
- customer selector と admin selector を同じ stylesheet に書かない。

## 選択肢の評価

| 選択肢 | 境界 | 運用コスト | 今回の判断 |
|---|---|---:|---|
| 単一 SPA + audience directory | state、API、CSS、test、lazy chunk を分離 | 低 | 採用 |
| Vite MPA + customer/admin 別 HTML entry | root component と bundle も分離 | 中 | 条件成立時に移行 |
| 別 frontend application / repository | deploy、origin、release を完全分離 | 高 | 現時点では不採用 |

Vite MPA へ移行する条件は次のいずれかとする。

- admin が customer と異なる origin または network access policy を必要とする。
- admin 専用 SSO / MFA と独立した session lifecycle を導入する。
- customer と admin の release cycle または担当 owner が分かれる。
- admin route と運用機能が増え、単一 application の build / test が bottleneck になる。

## Security boundary

directory、route、bundle の分離は情報設計と誤 import の防止には有効だが、access control ではない。

- `/api/admin/*` は未認証を拒否する。
- 認証済みでも admin role がなければ拒否する。
- resource access は request ごとに検証する。
- service-role key、raw token、raw X payload を frontend bundle に含めない。
- frontend で link を隠すことを認可として扱わない。

## 移行順序

現在、同じ frontend file を変更する PR #35 と PR #36 が並行しているため、directory move は両 PR の取り込み順を確定してから開始する。先に大規模な file move を重ねると、設計と無関係な conflict が増える。

1. `develop` に UI の最新変更を揃え、移行専用の `feature/*` branch を作る。
2. `shared/api/httpClient.ts` と `shared/styles/tokens.css` を抽出する。
3. customer の state、API、component、CSS、test を `customer/` へ移す。
4. admin の state、API、component、CSS、test を `admin/` へ移す。
5. `App.tsx` を audience 解決と lazy import だけの shell にする。
6. build、customer test、admin test、customer bundle からの admin 初期 load 不在を検証する。
7. backend admin authorization を別 security slice で実装・検証する。

## 完了条件

- `/` と `/admin` が現在の機能を維持する。
- customer と admin が state、API function、CSS、test file を共有しない。
- `App.tsx` に audience 固有の business state がない。
- customer と admin の相互 import がない。
- customer 初期表示で admin chunk を load しない。
- `npm run check` と `git diff --check` が通る。
- `/api/admin/*` の production authorization 未完了を frontend 分離で完了扱いしない。
