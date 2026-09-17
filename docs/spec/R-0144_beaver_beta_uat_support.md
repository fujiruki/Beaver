# R-0144: Dodaikun v1受入テスト自動化のためのBeaver_beta向け機能追加

作成日: 2026-09-17　実装: Beaver 側（backpc）　状態: 仕様化済み・着手可

## 目的

AccessTategu（Dodaikun v1）の本番切替前受入テスト（U-1〜U-10）を「同期を有効にした状態」で機械実行できるようにするため、frontpc側の受入テストハーネスがBeaver_betaに対して行う操作（B-1〜B-4）をBeaver側で提供する。原文はfrontpc・AccessTateguセッションからGoogle Drive「AI共有庫 カンガルー」経由で受領（`docs/requests.md` 旧§33、`2026-09-17_01_Beaver_Dodaikun受入テスト_Beaver_beta_スナップショット復元_API依頼_引き継ぎ.md`）。

## 前提

- Beaver_betaはR-0141で構築済み（AppID `Beaver_beta`、本番と別SQLite、同一コードベース）
- 本番Beaverを絶対に巻き込まないことが最優先。歯止めは「1つ外れても止まる」多重構成にする

## 対象範囲

| # | 依頼内容 | 対応 |
|---|---|---|
| B-1 | Beaver_betaのDB名前付き保存・復元 | 新規実装（本仕様の主眼） |
| B-2 | 環境名を返す読み取りAPI | 既存の`GET /sync/status`（`app_id`フィールド）が該当。ただし認証ゲート漏れ（後述）の修正が必要 |
| B-3 | 伝票・得意先操作APIのリクエスト/応答例 | 新規実装なし。既存APIの仕様をまとめて返信する |
| B-4 | 請求・入金の写しを読むAPI | 新規実装（`GET /invoices/sync`・`GET /payments/sync`） |
| B-5 | B-1代替の物理削除手段 | 対応不要（B-1で代替） |
| B-6 | 予約番号（29901〜29907、29980〜29999）の連絡 | 対応不要（連絡事項のみ、記録として残す） |

## B-2: 環境名判定APIの現状と修正

`GET /sync/status`（`api/routes/sync.php:23-31`）は既に`app_id`（`APP_ID`定数の値、Beaver_betaでは`"Beaver_beta"`）を返しており、追加実装は不要。

ただし調査の結果、`/sync/status`は`AUTH_GATE_SYNC_EXEMPT_PATHS`（`api/auth_gate.php:12-19`）に含まれておらず、SYNC_API_TOKEN（Authorization: Bearer）では呼べない状態と判明した（df_sessionログイン or BANTO_API_TOKENが必要になってしまう）。B-2の要望「同期トークンで読めること」を満たすため、`/sync/status`を`AUTH_GATE_SYNC_EXEMPT_PATHS`に追加する。

Dodaikun側には、期待するフィールド名が`env`ではなく`app_id`であること、値は`"Beaver_beta"`/`"Beaver"`であることを返信で伝える。

## B-3: 既存APIのリクエスト/応答例（新規実装なし）

frontpc側の受入テストハーネスが「Beaver管理画面からの操作」をシミュレートする用途のため、認証は画面系ログイン（df_session）ではなく既存の`BANTO_API_TOKEN`（`Authorization: Bearer <BANTO_API_TOKEN>`、`api/auth_gate.php:48-54`）を使う。カンガルーへの返信時に、以下のエンドポイントのcurl例をまとめて記載する。

- 伝票新規作成: `POST /vouchers`（`access_voucher_id`を指定しない）
- 摘要変更: `PUT /vouchers/{id}` または `PATCH /vouchers/{id}`
- void: `DELETE /vouchers/{id}`（論理削除、`status='void'`に更新。物理DELETEではない）
- 得意先名変更: `PATCH /customers/{id}`
- 請求済み伝票への409: `assertVoucherEditable`（`api/routes/vouchers.php:402-417`、`status==='billed'`で拒否）の実際の応答本文

## B-4: 請求・入金の写しを読むAPI（新規実装）

現状`GET /invoices`・`GET /payments`はBeaver内部ID・画面向けフィルタ（customer_id/year/month/q）のみで、Access側キー（`access_receivable_id`・`access_payment_no`）や`updated_after`での絞り込みができない。ミラー差分に使える専用エンドポイントを新設する。

### `GET /invoices/sync`

- クエリ: `updated_after`（ISO8601）、`customer_access_no`（`customers.access_customer_no`）
- レスポンス項目: `access_receivable_id`・`access_cancelled_at`・`amount`（合計金額）・`voucher_access_ids`（紐づく伝票の`access_voucher_id`配列）・`updated_at`
- 既存の`AUTH_GATE_SYNC_EXEMPT_PATHS`パターンに合わせ完全一致パスとして追加、SYNC_API_TOKEN必須

### `GET /payments/sync`

- クエリ: `updated_after`、`customer_access_no`
- レスポンス項目: `access_payment_no`・`amount`・`access_receivable_id`（紐づく請求）・`updated_at`

両APIとも既存の`GET /vouchers/sync`（`api/routes/vouchers.php`）のページング契約（R-0143 A-B-11: `next_cursor`/`next_cursor_at`）に揃える。

## B-1: Beaver_betaスナップショット保存・復元（新規実装、本仕様の中心）

### エンドポイント

| メソッド・パス | 用途 |
|---|---|
| `POST /admin/snapshot/save` | 現在のDBを名前付きで保存（body: `{"name": "after_ax01"}`） |
| `POST /admin/snapshot/restore` | 保存済みDBで現在のDBを置換（body: `{"name": "after_ax01"}`） |
| `GET /admin/snapshot/list` | 保存済みスナップショット一覧（名前・サイズ・作成日時） |

保存先: `api/beta_snapshots/{name}.sqlite`（`api/backups/`とは別ディレクトリ、Git管理外）。保存は`VACUUM INTO :path`（一貫性のあるコピーを1操作で取得、PHPバンドルSQLite 3.45.2で対応済み）。

### 歯止め（1つ外れても止まる多重構成）

以下の**3つ全て**を満たさない限り403で拒否する。本番の`config.local.php`には`BETA_SNAPSHOT_ENABLED`を絶対に設定しないこと（デフォルト未設定=無効）。

1. 環境変数`BETA_SNAPSHOT_ENABLED=1`が設定されている
2. `APP_ID === 'Beaver_beta'`（`api/config.php`の定数、環境変数`BEAVER_APP_ID`由来）
3. DB接続先のファイルパスに`Beaver_beta`という文字列が含まれる（`Database::connect()`が使う実際のパスを検査。設定ミスで本番DBパスを指してしまうケースへの保険）

いずれか1つでも欠ければ`403 {"error": "beta_snapshot_disabled"}`を返す。

認証は既存のSYNC_API_TOKEN（`authGateHasValidSyncToken()`）を流用し、パスは`AUTH_GATE_SYNC_EXEMPT_PATHS`に追加する。

### 復元中の排他制御

SQLiteファイルを丸ごと差し替える`restore`実行中に他のリクエストが書き込むと不整合が起きうる。`api/beta_snapshots/.restoring`のようなロックファイルを使い、存在する間は他の全リクエストに`503 {"error": "restoring"}`を返す簡易メンテナンスモードを`index.php`冒頭に追加する（`/health`のみ例外扱いにするかは実装時に判断）。restore処理: ロックファイル作成 → 既存PDO接続をこのリクエスト内で閉じる → `copy()`でファイル差し替え → ロックファイル削除。

## 受入条件

| # | 確認 | 期待 |
|---|---|---|
| 1 | Beaver_betaで`GET /sync/status`をSYNC_API_TOKENで呼ぶ | 200、`app_id: "Beaver_beta"` |
| 2 | 本番Beaverで`POST /admin/snapshot/save`を呼ぶ（`BETA_SNAPSHOT_ENABLED`未設定） | 403 `beta_snapshot_disabled` |
| 3 | Beaver_betaで`POST /admin/snapshot/save {"name":"after_ax01"}` | 200、`api/beta_snapshots/after_ax01.sqlite`が作成される |
| 4 | Beaver_betaのDBに変更を加えた後`POST /admin/snapshot/restore {"name":"after_ax01"}` | 200、保存時点の状態に戻る |
| 5 | `GET /invoices/sync?customer_access_no=29901`・`GET /payments/sync?customer_access_no=29901` | 200、該当得意先の請求・入金の写しが返る |
| 6 | `POST /vouchers`・`PATCH /vouchers/{id}`・`DELETE /vouchers/{id}`・`PATCH /customers/{id}`をBANTO_API_TOKENで呼ぶ | いずれも200（画面ログイン不要で動作） |

## カンガルーへの返信（着手後にfrontpc側へ返す内容）

1. B-1〜B-4それぞれの可否・呼び出し方（本仕様の各節を要約）
2. B-1の歯止め実装内容と、本番に対して呼んだ場合の実際の拒否レスポンス
3. `api/schema.sql`・migrationへの追加有無（本エンドポイント群はテーブル追加不要の見込み、`reset_beta_db.ps1`への影響なし）
