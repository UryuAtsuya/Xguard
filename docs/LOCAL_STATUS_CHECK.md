# ローカル状態確認

更新日: 2026-06-16

この手順は、XGuard prototype がローカルで起動し、read-only mock OAuth、backup、proof page DTO の基本フローまで動くことを確認するためのものです。実X API、Supabase、Stripe には接続しません。

## 前提

- 作業ディレクトリ: `/Users/uryuatsuya/XGuard/xguard`
- Node.js と npm が利用できること。
- `jq` があると API 応答を読みやすく確認できる。ない場合は `curl` の JSON をそのまま読む。
- prototype は環境変数未設定でも mock mode で起動する。

初回または依存更新後:

```bash
npm install
```

## 1. 軽いローカル起動

API、customer、adminをまとめて起動する。

```bash
make
```

正常なら以下のように表示される。

```text
XGuard API prototype listening on http://localhost:4000
```

正常なら以下のURLが表示される。

```text
http://localhost:5173/
http://localhost:5174/
```

ブラウザではcustomerの`http://localhost:5173/`またはadminの`http://localhost:5174/`を開く。両frontendは`/api`と`/health`を`http://localhost:4000`へproxyする。

## 2. API health 確認

```bash
curl -sS http://localhost:4000/health | jq
```

正常目安:

- `ok` が `true`
- `service` が `xguard-api`
- `mode` が `prototype`
- `xOAuthMode` が、環境変数未設定時は `mock`

## 3. Mock OAuth から backup まで

以下は mock OAuth state を取得し、callback、backup run、backup status、proof public 化、proof DTO 取得までを一気に確認する。

```bash
START_JSON=$(curl -sS 'http://localhost:4000/api/x/oauth/start?username=xguard_creator')
STATE=$(printf '%s' "$START_JSON" | jq -r '.state')

CALLBACK_JSON=$(curl -sS "http://localhost:4000/api/x/oauth/callback?code=mock-authorization-code&state=${STATE}")
SESSION_TOKEN=$(printf '%s' "$CALLBACK_JSON" | jq -r '.sessionToken')

BACKUP_JSON=$(curl -sS -X POST http://localhost:4000/api/backup/run \
  -H "Authorization: Bearer ${SESSION_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"tweetLimit":25}')
RUN_ID=$(printf '%s' "$BACKUP_JSON" | jq -r '.backupRun.id')

curl -sS "http://localhost:4000/api/backup/status/${RUN_ID}" \
  -H "Authorization: Bearer ${SESSION_TOKEN}" \
  | jq '{id,status,tweetsCaptured,estimatedCostUsd}'

curl -sS -X PATCH "http://localhost:4000/api/recovery/${RUN_ID}/proof/visibility" \
  -H "Authorization: Bearer ${SESSION_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{"visibility":"public"}' \
  | jq '{runId,visibility,revokedAt}'

curl -sS "http://localhost:4000/api/recovery/${RUN_ID}/proof" \
  -H "Authorization: Bearer ${SESSION_TOKEN}" \
  | jq '{username,displayName,snapshotCounts}'
```

正常目安:

- backup status の `status` が `completed`
- `tweetsCaptured` が `2`
- proof visibility が `public`
- proof DTO の `username` が `xguard_creator`
- token material、secret、raw X API payload が応答に出ない

## 4. Web 画面の確認

`http://localhost:5173/` を開き、以下を確認する。

- username入力後に`Xで本人確認する`を押すと、mock modeでは接続済みになる。
- `プロフィールと投稿を保全する`でbackupが完了し、保全件数が表示される。
- XGuardが投稿、DM、follow操作をしないread-only方針が表示される。

## 5. CI 相当の確認

ローカルで変更前後の安全確認をしたい場合:

```bash
npm run check
```

このコマンドは以下を実行する。

- `npm run build:api`
- `npm run build:web`
- `npm run test`

2026-06-16 の確認時点では `npm run check` は成功し、`9 passed | 1 skipped`、`75 passed | 2 skipped` だった。

## 6. 終了

`make`を起動したterminalで`Ctrl-C`を押すと、API、customer、adminをまとめて停止する。個別起動が必要な場合は`make backend`、`make customer`、`make admin`、frontendだけの場合は`make frontend`を使う。

## トラブルシュート

- `localhost:4000` が使われている場合は、既存プロセスを停止するか `PORT=4001 npm run dev:api` のように別ポートで起動する。別ポートを使う場合は Web 側の proxy 設定または `VITE_XGUARD_API_BASE_URL` も合わせる。
- `X_CLIENT_ID` を設定すると OAuth mode は `configured` に切り替わる。production 相当の検証では `X_CLIENT_SECRET`、HTTPS callback、confirmation env が必要になるため、通常のローカル smoke では未設定の mock mode を使う。
- `GET /api/x/oauth/status` は deployment diagnostic 用で、通常は `404` が正常。使う場合は `X_OAUTH_STATUS_EXPOSURE=deployment_diagnostic` と32 bytes以上の `X_OAUTH_STATUS_DIAGNOSTIC_TOKEN` が必要。
