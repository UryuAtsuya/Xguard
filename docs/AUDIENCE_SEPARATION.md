# 画面独立化と保全データ設計

## 概要

Issue #21 / #22 の最初の対応として、XGuard の frontend はお客様画面と管理画面を URL レベルで分離する。

directory、state、API、CSS、test の target boundary は [frontend の画面境界とディレクトリ構造](./FRONTEND_DIRECTORY_STRUCTURE.md) を正本とする。

- お客様画面: `/`
- 管理画面: `/admin`

お客様画面は、入力、状況確認、復旧の3動作だけを見せる。管理画面は内部DB、レビュー、保全状況、proof page の状態を扱う。

## 設計・方針

- お客様画面から管理用DB snapshot、compliance events、内部レビューキューを見せない。
- 管理画面は AdminLTE に近い sidebar + KPI + table summary の情報密度に寄せる。
- お客様画面の入力は `@username` と read-only OAuth 接続を起点にする。
- 復旧用に使う public proof page は redacted DTO のみを表示し、raw X API payload は公開しない。
- backend / repository 境界の外へ token material を出さない。

## DBに保管する候補

必須候補:

- X account: `x_user_id`, `username`, `display_name`, `profile_image_url`, `captured_at`
- Posts: `tweet_id`, `text`, `created_at`, `captured_at`, `reply_count`, `retweet_count`, `like_count`
- Media: `media_key`, `tweet_id`, `type`, `url_or_storage_key`, `width`, `height`, `duration_ms`, `captured_at`
- Backup runs: `id`, `x_user_id`, `status`, `tweets_captured`, `started_at`, `completed_at`, `error_code`
- Proof pages: `id`, `backup_run_id`, `public_slug`, `revoked_at`, `expires_at`, `created_at`
- Recovery cases: `id`, `x_user_id`, `status`, `reason`, `opened_at`, `closed_at`
- Compliance events: `id`, `event_type`, `subject_type`, `subject_id`, `created_at`, `metadata`

注意点:

- 投稿本文、画像、動画、日時は復旧証拠として必要だが、公開画面には redaction 済みの最小情報だけを出す。
- 画像・動画は raw URL をそのまま公開せず、保存先 key と公開可否を分ける。
- `offline.access` を使う場合でも refresh token は backend repository 境界の外に出さない。

## 未解決

- 実 DB schema への `media` / `recovery_cases` 追加は別 slice。
- 管理画面の認証・権限分離は別 slice。現時点の `/admin` は frontend route 分離であり、production の access control ではない。
- お客様が `@username` のみで始める場合と OAuth 接続まで必須にする場合の product decision が必要。
