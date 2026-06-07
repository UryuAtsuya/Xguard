# XGuard

XGuardは、Xアカウント向けのread-firstな再起動準備サービスです。

v0の目的は、BANされたアカウントを自動復活させることではありません。ユーザー本人が許可したXデータを平常時に保存し、問題発生後に管理された証明ページを公開して、新しいアカウントで手動再起動しやすくすることです。

## 現在のスコープ

- ユーザー本人のXアカウントへのOAuth接続。
- プロフィールと直近投稿のread-onlyバックアップ。
- 保存済みデータから生成する公開用proof page DTO。
- 削除済み、非公開、withheldコンテンツとユーザー削除依頼に対応するcompliance queue。
- Stripe subscriptionとwebhook冪等性の設計。

## v0で作らないもの

- 自動DM。
- 自動follow/unfollow。
- BAN回避導線。
- 生のX API payload公開。
- follower listの一括公開。
- 自動投稿。

## ドキュメント

- `docs/X_API_SCOPE.md`: 現在のX APIデータ範囲とポリシー境界。
- `docs/IMPLEMENTATION_GATE.md`: product codeを書く前のチェックリスト。
- `docs/API_SPEC.md`: 現在のbackend prototype routeと置き換え予定interface。
- `docs/ARCHITECTURE.md`: backend-first architectureと安全境界。
- `docs/API_COST_MODEL.md`: API usage eventとcost tracking contract。
- `docs/COMPLIANCE.md`: proof page、削除、manual reviewのcompliance contract。

## プロトタイプコード

最初のコードスパイクはbackend-firstです。

```text
backend/       Express API prototype、mock X client、token repository boundary
frontend/      Vite + React prototype、mobile-first XGuard操作画面
shared/        将来frontend/backendで共有するTypeScript DTO
supabase/      auth profile、X backup、proof page、compliance、Stripe eventの初期schema
```

ローカル起動:

```bash
npm install
npm run dev:api
npm run dev:web
```

検証:

```bash
npm run check
```

`dev:web` は `http://localhost:5173` で起動し、`/api` と `/health` を `http://localhost:4000` のbackend prototypeへproxyします。

## 環境変数

プロトタイプは未設定でもmock modeで起動します。実値を入れると、OAuth開始URLがconfigured modeに切り替わります。

```env
PORT=4000
APP_BASE_URL=http://localhost:4000
X_CLIENT_ID=
X_CLIENT_SECRET=
X_CALLBACK_URL=
```

- `X_CLIENT_ID`: mock modeからconfigured modeへ切り替える最小スイッチ。`NODE_ENV=production` では必須です。
- `X_CALLBACK_URL`: 明示したcallback URL。未設定時は `APP_BASE_URL` またはlocal portから生成します。`NODE_ENV=production` ではlocalhost/loopback callbackを拒否します。
- `X_CLIENT_SECRET`: 現時点では検知のみ。token exchangeはまだ未実装です。`NODE_ENV=production` では必須で、configured callback では prototype token refs / session を発行せず、`501` で停止します。

## 正本

計画と会社運用メモは以下で管理します。

`/Users/uryuatsuya/Documents/ObsidianVault/MyLife/company/projects/x-ban-recovery-storage`

## GitHub同期ルール

意味のある実装変更は、検証後に `UryuAtsuya/Xguard` へcommit/pushします。`origin` がない場合は以下を設定します。

```bash
git remote add origin https://github.com/UryuAtsuya/Xguard.git
```
