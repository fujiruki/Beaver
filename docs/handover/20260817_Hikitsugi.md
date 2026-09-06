## 直近の作業（2026-08-17〜18）: auth-hub連携ログイン基盤 + 番頭AI向けAPIトークン認証

### 本番の認証状態（重要・次セッションで必ず把握すること）
- Beaver全体が **auth-hub（`https://door-fujita.com/contents/auth/`）経由のログイン必須** になった（`api/config.local.php`の`AUTH_DRIVER='shared'`）
- `.htaccess`のBasic認証（R-0099、staff共有パスワード）は**撤去済み**
- `api/config.local.php`に`BANTO_API_TOKEN`設定済み（番頭AI専用の固定トークン、値は藤田晴樹さんへ会話内で直接申し送り済み、Git管理外）
- **AccessTategu連携用の同期API（`/projects/sync`, `/vouchers/sync`等）は引き続き無認証のまま**（`requests.md` -9として未着手・要リスク認識）

### R-0109: auth-hub連携によるログイン基盤の導入 ✅ 完了・本番デプロイ済み
- `requests.md` -7（社内共通認証基盤への移行）に着手。auth-hub本体は2026-08-14に本番稼働済み（Youkan・DotLogは連携済み）と判明したため、DotLog `docs/spec/08_auth-hub連携.md` を参考に仕様化
- 藤田晴樹さんの回答: (1) 全画面ログイン必須化、(2) 今回のスコープはログイン基盤のみ（`created_by`記録は別要望）、(3) AccessTategu同期API群は対象外（人間のログインと性質が違うため、従来のBasic認証のまま）
- 実装: `api/auth_client.php`（auth-hub正本コピー配布）・`api/auth_gate.php`（対象外パス判定）・`api/index.php`（認証ゲート＋`GET /me`新設）・フロント401ハンドリング・サイドバーのユーザー名表示/ログアウトボタン
- 実装はCodex（TDD）に委譲、指揮役が回帰スイート（vitest+PHPテスト）・`npm run build`を再実行して検証（1回目は`npm run build`のtscエラーを見落として指摘・再修正させた）
- 本番デプロイ前に本番DB・コード一式をバックアップ（`~/beaver_pre_r0109_backup/`、本番サーバー上のホームディレクトリ）
- デプロイ後、SSH経由でPHP CLIから認証ゲートの動作を直接検証、藤田晴樹さんが実機でログイン→操作→ログアウトを確認完了
- 二重保護だった`.htaccess`Basic認証（R-0099）を撤去（コミット `492565a`, `0bd4ba4`）
- 仕様: `docs/spec/R-0109_auth_hub_integration.md`

### R-0110: 番頭AI向けAPIトークン認証の追加 ✅ 完了・本番デプロイ済み
- `requests.md` -8（AI(番頭)がBeaverへ直接登録できるように）に着手。R-0109で全画面ログイン必須化した結果、ブラウザを持たない番頭AI（`C:\claude-workspace`）が通せなくなっていた問題への対応
- 既存の`ADMIN_FEEDBACK_TOKEN`と同じ単一固定トークン方式（`BANTO_API_TOKEN`、`Authorization: Bearer <token>`）を採用。DotLogの`dl_api_keys`（複数ユーザー管理・発行UI付き）は過剰と判断し採用しなかった
- claude-workspace側への申し送りドキュメント: `docs/wiki/knowledge/banto_ai_beaver_integration.md`（トークン実値は含まない、ベースURL・エンドポイント一覧・curl例のみ）
- 本番デプロイ・トークン発行（`openssl rand -hex 32`）・実HTTPS疎通確認（有効トークン=200、なし=401、`getallheaders()`フォールバックは不要と判明）まで完了（コミット `4f5d61e`）
- 発行したトークンは会話内で藤田晴樹さんへ直接申し送り済み。claude-workspace側`.env`の変数名は既存パターン（`YOUKAN_API_BASE`, `DOTLOG_API_KEY`）に揃えて `BEAVER_API_BASE` / `BEAVER_API_TOKEN` を提案した（**claude-workspace側の`.env`追記・APIクライアント実装は未対応、Beaverリポジトリの範囲外のため別セッションでの作業が必要**）
- 仕様: `docs/spec/R-0110_banto_api_token.md`

### `docs/requests.md` の整理
- `-1`〜`-6`（既に`requests_log.md`で完了記録済みだった項目）を削除
- `-7` → R-0109として仕様化・削除
- `-8` → R-0110として仕様化・削除
- `-9`（AccessTategu連携用の同期APIに認証を追加）を新規起票。**AccessTateguのVBAコードがこのマシン（backPC）に存在しない**ため着手を保留中。着手にはAccessTategu側へのアクセス手段の確保が必要

### ロールバック用バックアップ（本番サーバー上、次に問題が起きたら使う）
- `~/beaver_pre_r0109_backup/`（本番サーバーのホームディレクトリ）配下に複数世代のコード一式tar.gz、撤去前`.htaccess`のバックアップあり
- `api/backups/`配下に`database_*_pre_r0109_auth_hub.sqlite`, `database_*_pre_r0110_banto_token.sqlite`等のDBバックアップあり

### 次回セッションでやること
1. claude-workspace側（`C:\claude-workspace`をルートにした別セッション）で `.env` に `BEAVER_API_BASE` / `BEAVER_API_TOKEN` を追加し、APIクライアントを実装する
2. `-9`（AccessTategu同期APIへの認証追加）: AccessTateguのVBAコードへのアクセス手段を確保してから着手を検討する
3. その他バックログ: R-038（得意先マスタ双方向同期、未設計）、R-078（建具台帳の型定義とDBカラムの不整合）、TateguDesignStudio連携（未着手）

---

