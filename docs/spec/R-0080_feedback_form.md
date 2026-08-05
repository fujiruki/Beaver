# R-0080: 改善要望を伝えるフィードバックフォーム

## 背景・目的

藤田建具店のBeaver利用者（社内スタッフ）が、システムの不具合・改善要望をスクリーンショット（複数枚）付きでその場で送信できるようにする。送信内容は本番DBに蓄積され、開発側（backPCで動作するClaude Code）が管理者用APIを直接叩いて読み取り、改善のインプットとして使う。SSHが遮断されている状況でも読み取れることを前提にする。

## スコープ

### フロントエンド

- `AppLayout` など全画面共通のレイアウトに「改善要望を送る」ボタンを設置し、どの画面からでも開けるようにする
- ボタン押下でモーダルを開き、以下を入力する
  - 本文（必須、複数行テキスト）
  - 画像（任意、複数選択可、最大5枚、プレビュー表示、個別に削除可能）
- 送信時、現在の画面パス（`location.pathname`）を `page_path` として自動的に併せて送信する
- 送信成功後はモーダルを閉じ、完了メッセージを表示する
- 送信失敗時はエラーメッセージを表示し、入力内容を保持する（再送信できるようにする）

### バックエンド

#### DBスキーマ（migration追加）

```sql
CREATE TABLE IF NOT EXISTS feedback (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    message    TEXT NOT NULL,
    page_path  TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS feedback_images (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    feedback_id   INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    file_name     TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_images_feedback ON feedback_images(feedback_id);
```

`project_images`（`api/migrations/003_project_images.sql`、`api/routes/projects.php` の画像アップロード実装）と同じパターンを踏襲する。本番SQLiteは3.7.17のため、3.8.0+機能（部分インデックス等）は使わない。

#### API

- `POST /feedback`（multipart/form-data、認証不要・社内利用前提）
  - `message`（必須）、`page_path`（任意）、`images[]`（任意・複数、最大5枚）
  - 画像は `uploads/feedback/{feedback_id}/{ファイル名}` に保存し、`feedback_images` にレコードを作る（`projects.php` の画像アップロード処理を参考にする）
  - 画像0枚でも本文があれば成功として扱う
  - 5枚を超える場合、または個々のファイルが極端に大きい場合はエラーを返す（画像形式チェックも行う）
- `GET /admin/feedback`（管理者用、Claudeが直接読みに行く用）
  - リクエストヘッダ `X-Admin-Token` が `ADMIN_FEEDBACK_TOKEN`（`api/config.local.php` で定義）と一致しない場合は `401` を返す
  - 一致する場合、`feedback` を新しい順に返却し、各要望に紐づく `feedback_images` の `file_path` 配列を含める
  - クエリパラメータ `unread_only` 等は今回不要（一覧管理UIは作らないため既読管理は持たない）

#### 設定・秘密情報

- `api/config.php` に、`api/config.local.php` が存在すれば読み込む処理を追加する（`config.local.php` は `.gitignore` 済み・Gitに含めない）
- `api/config.local.php` で `ADMIN_FEEDBACK_TOKEN` を定義する。ローカル開発用に `config.php` 側でこの定数が未定義の場合のみ、開発用のわかりやすいダミー値（例: `'dev-local-token-change-me'`）にフォールバックする（本番では必ず `config.local.php` で上書きする運用とする）
- `upload.ps1` のデプロイ処理は、ローカルの `api/` を丸ごと本番へコピーするため、**ローカルに `config.local.php` があると本番の秘密トークンを上書きしてしまう**。`*.sqlite`/`*.db` と同様に、ステージング時に `config.local.php` を除外する一行を追加すること
- 本番の `api/config.local.php` は、既存のバックアップ運用などを参考に、デプロイ後に手動（FTPS/SSH）で設置する。値は藤田晴樹さんまたは指揮役が管理する

## 受け入れ条件

1. Beaver内のどの画面からも「改善要望を送る」ボタンからモーダルを開ける
2. 本文必須、画像0〜5枚を添付・プレビュー・個別削除できる
3. 送信すると `feedback` / `feedback_images` にレコードが作られ、画像ファイルが `uploads/feedback/{id}/` に保存される
4. `GET /admin/feedback` は正しい `X-Admin-Token` でのみ200・要望一覧＋画像パスを返し、トークン不一致/なしでは401を返す
5. `upload.ps1` のデプロイを実行しても本番の `api/config.local.php` が上書き・削除されない
6. PHPテストで正常系（画像あり/なし）・異常系（画像5枚超過、トークン不一致）を検証する
7. `frontend`側はvitestで送信フォームのバリデーション（本文必須、画像削除操作）を検証する

## 非スコープ（今回やらないこと）

- 要望の一覧・既読管理を行う管理画面UIは作らない（Claudeが `GET /admin/feedback` を直接叩いて読む運用に留める）
- 送信者の認証・個人特定は行わない（社内利用前提の匿名フィードバック）
- 通知（メール・Slack等）は行わない

## 関連

- 画像アップロードの実装パターン: `api/routes/projects.php`（`project_images`）
- デプロイ手順: `upload.ps1`、SSH遮断時は `docs/wiki/knowledge/deploy_ftps_fallback.md`
