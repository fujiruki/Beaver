# Beaver 設計書 04 — Accessデータ移行マッピング

**作成日**: 2026-03-16
**対象プロジェクト**: `C:\Fujiruki\Projects\Beaver\`

移行元: `tate202403_be.accdb`（現行Accessバックエンド）
移行先: `Beaver` SQLite / MySQL

---

## 1. テーブル対応一覧

| 現Access テーブル | Beaver テーブル | 備考 |
|---|---|---|
| `tbl得意先M` | `customers` | 構造ほぼ対応。請求設定フィールドを追加 |
| `tbl当社M` | `company_settings` + `sequences` | 自社情報と伝票番号管理を分離 |
| `tbl見積` | `vouchers` (voucher_type='estimate') | 統合テーブル。statusマッピング要 |
| `tbl売上` | `vouchers` (voucher_type='sales') | 同上 |
| `tbl見積明細` | `voucher_lines` (voucher経由) | 原価フィールド追加、作業時間を分割 |
| `tbl売上明細` | `voucher_lines` (voucher経由) | 同上 |
| `tbl建具台帳` | `tategu_items` | catalog連携・追加明細テーブルを新設 |
| `tbl売掛` | `invoices` + `invoice_vouchers` | 正規化して分離 |
| `tbl請求書` | `invoices` | 統合 |
| `tbl入金` / `tbl入金明細` | `payments` | 簡略化 |
| （なし） | `projects` | 案件管理を新規追加（移行データなし） |
| （なし） | `tategu_item_additions` | 追加工程テーブル（移行データなし） |
| （なし） | `tax_rates` | 消費税率マスター（固定値で初期投入） |

---

## 2. tbl得意先M → customers マッピング

| Access フィールド | 型 | Beaver フィールド | 型 | 変換ルール |
|---|---|---|---|---|
| `得意先コード` | TEXT | `code` | VARCHAR(20) | そのまま |
| `得意先名` | TEXT | `name` | VARCHAR(100) | そのまま |
| `敬称区分` | TEXT | `honorific_type` | VARCHAR(20) | '株式会社'/'有限会社'/'個人'等 |
| `請求先名` | TEXT | `billing_name` | VARCHAR(100) | 空の場合は name をコピー |
| `郵便番号` | TEXT | `postal_code` | VARCHAR(10) | そのまま |
| `住所1` | TEXT | `address1` | VARCHAR(200) | そのまま |
| `住所2` | TEXT | `address2` | VARCHAR(200) | そのまま |
| `TEL` | TEXT | `tel` | VARCHAR(20) | そのまま |
| `FAX` | TEXT | `fax` | VARCHAR(20) | そのまま |
| `Email` | TEXT | `email` | VARCHAR(100) | そのまま |
| `締日` | INTEGER | `cutoff_day` | INTEGER | 0=月末のまま |
| （なし） | — | `billing_offset_days` | INTEGER | デフォルト 10（翌月10日払い）で一律投入 |
| （なし） | — | `payment_due_days` | INTEGER | デフォルト 30 で一律投入 |
| `繰越残高` | CURRENCY | `carry_forward_balance` | DECIMAL(12,0) | 移行時点の残高を手動確認して投入 |
| `備考` | MEMO | `memo` | TEXT | そのまま |

> **注意**: `billing_offset_days`（請求書発行の締日からの日数）と `payment_due_days`（入金期限）は Accessに対応フィールドがない。移行時は全得意先に同一のデフォルト値を投入し、後から個別修正する。

---

## 3. tbl当社M → company_settings / sequences マッピング

### company_settings

| Access フィールド | Beaver フィールド | 変換ルール |
|---|---|---|
| `会社名` | `company_name` | そのまま |
| `代表者名` | `representative_name` | そのまま |
| `郵便番号` | `postal_code` | そのまま |
| `住所` | `address` | そのまま |
| `TEL` | `tel` | そのまま |
| `FAX` | `fax` | そのまま |
| `振込先` | `bank_info` | そのまま |
| （なし）| `invoice_registration_no` | インボイス登録番号。手動入力 |
| （なし）| `default_labor_rate` | 労務単価。現行VBAの定数値から転記 |

### sequences

| Access フィールド | Beaver フィールド | 変換ルール |
|---|---|---|
| `最終見積伝票№` | `sequences` WHERE name='estimate_voucher' | 現在の最大番号をそのまま投入 |
| `最終売上伝票№` | `sequences` WHERE name='sales_voucher' | 同上 |
| `最終入金伝票№` | `sequences` WHERE name='payment' | 同上 |

---

## 4. tbl建具台帳 → tategu_items マッピング

| Access フィールド | 型 | Beaver フィールド | 型 | 変換ルール |
|---|---|---|---|---|
| `建具No` | TEXT | `code` | VARCHAR(20) | そのまま（例: '00878'） |
| `建具名` | TEXT | `name` | VARCHAR(200) | そのまま |
| `備考` | MEMO | `description` | TEXT | そのまま |
| （なし） | — | `base_catalog_item_id` | INTEGER | NULL（移行後に手動でcatalog連携） |
| （なし） | — | `status` | VARCHAR(20) | 'active' で一律投入 |
| `本体原価` | CURRENCY | `cost_body` | DECIMAL(12,0) | そのまま |
| `金物原価` | CURRENCY | `cost_hardware` | DECIMAL(12,0) | そのまま |
| `ガラス原価` | CURRENCY | `cost_glass` | DECIMAL(12,0) | そのまま |
| `作業時間` | DOUBLE | `cost_factory_hours` | DECIMAL(6,2) | Accessの「作業時間」をそのまま工場時間として移行 |
| （なし） | — | `cost_site_hours` | DECIMAL(6,2) | 0.0 で一律投入（後から修正） |
| （なし） | — | `cost_labor_rate` | DECIMAL(8,0) | company_settings.default_labor_rate をコピー |
| （なし） | — | `cost_snapshot_at` | DATETIME | 移行日時を投入 |

> **注意**: Accessの `作業時間` は工場と現場の区別がなかった。移行時は全て `cost_factory_hours` に入れ、`cost_site_hours=0` として、後から必要なレコードのみ修正する。

> **注意**: `tategu_item_additions`（追加工程）は Accessに対応テーブルがないため移行データなし。

---

## 5. tbl見積 / tbl売上 → vouchers マッピング

| Access フィールド | Beaver フィールド | 変換ルール |
|---|---|---|
| （テーブル区別） | `voucher_type` | tbl見積='estimate', tbl売上='sales' |
| `見積No` / `売上No` | `voucher_no` | そのまま（例: 'M-2026-01', 'U-2026-01'） |
| `得意先コード` | `customer_id` | customers.code でルックアップして id に変換 |
| （なし） | `project_id` | NULL（移行後に案件を手動作成して紐づけ） |
| `見積日` / `売上日` | `voucher_date` | そのまま |
| `納期` | `delivery_date` | そのまま |
| `備考` | `memo` | そのまま |
| `消費税区分` | `tax_input_type` | '内税'→'inclusive', '外税'→'exclusive', NULL→'exclusive' |
| （なし） | `status` | 見積: 'submitted' 固定, 売上: 'billed' or 'approved'（売掛状況で判定） |
| `小計` | `subtotal_taxable` | そのまま（税抜小計）|
| `消費税` | `tax_amount` | そのまま |
| `合計` | `total_amount` | そのまま |
| （なし） | `profit_rate` | NULL（移行時は設定しない） |
| （なし） | `override_billing_date` | NULL（移行時は全件NULL） |
| （なし） | `source_voucher_id` | NULL（移行時は対応関係を追跡しない） |

---

## 6. tbl見積明細 / tbl売上明細 → voucher_lines マッピング

| Access フィールド | Beaver フィールド | 変換ルール |
|---|---|---|
| `見積No` / `売上No` | `voucher_id` | vouchers.voucher_no でルックアップ |
| `行No` | `line_no` | そのまま |
| `区分` | `line_type` | '小計'→'subtotal', '値引'→'discount', その他→'normal' |
| `取付場所No` | `location_no` | そのまま |
| `取付場所名` | `location_name` | そのまま |
| `取付建具№` | `tategu_item_id` | tategu_items.code でルックアップ（NULLの場合はNULL） |
| `建具名` | `item_name` | そのまま（スナップショットテキスト） |
| `数量` | `quantity` | そのまま |
| `本体金額` | `price_body` | そのまま |
| `金物金額` | `price_hardware` | そのまま |
| `ガラス金額` | `price_glass` | そのまま |
| `行計` | `line_total` | そのまま |
| `消費税区分` | `tax_category` | '課税' / '非課税' そのまま |
| `備考` | `memo` | そのまま |
| `本体原価`（あれば） | `cost_body` | あればそのまま、なければ tategu_items から取得 |
| `金物原価`（あれば） | `cost_hardware` | 同上 |
| `ガラス原価`（あれば） | `cost_glass` | 同上 |
| `作業時間`（あれば） | `cost_factory_hours` | あればそのまま工場時間へ。現場時間は0 |
| （なし） | `cost_site_hours` | 0.0 |
| （なし） | `cost_labor_rate` | company_settings.default_labor_rate |
| （なし） | `snapshot_loaded_at` | 移行日時 |

---

## 7. tbl売掛 / tbl請求書 → invoices マッピング

| Access フィールド | Beaver フィールド | 変換ルール |
|---|---|---|
| `得意先コード` | `customer_id` | ルックアップ |
| `請求日` | `invoice_date` | そのまま |
| `締日` | `cutoff_date` | そのまま |
| `前回繰越` | `carry_forward` | そのまま |
| `当月売上` | `sales_total` | そのまま |
| `消費税` | `tax_total` | そのまま |
| `入金` | `payment_received` | そのまま |
| `請求金額` | `invoice_total` | そのまま |
| `次回繰越` | `next_carry_forward` | そのまま |

### invoice_vouchers（紐づけテーブル）

Accessには請求書と売上伝票の明示的な紐づけテーブルがないため、移行時は **請求日の前後の締日ルール** で自動推定して紐づける。
紐づけが不確かな場合は NULL 許容で移行し、後から手動確認。

---

## 8. tbl入金 → payments マッピング

| Access フィールド | Beaver フィールド | 変換ルール |
|---|---|---|
| `得意先コード` | `customer_id` | ルックアップ |
| `入金日` | `payment_date` | そのまま |
| `入金額` | `amount` | そのまま |
| `摘要` | `memo` | そのまま |
| `請求No`（あれば） | `invoice_id` | invoices でルックアップ（なければNULL） |

---

## 9. 移行手順（案）

### Step 1: 新システム初期セットアップ
1. `C:\Fujiruki\Projects\Beaver\` プロジェクト作成
2. `api/schema.sql` でDBを初期化
3. tax_rates テーブルに消費税率（8%/10%）を投入

### Step 2: マスターデータ移行
```
tbl当社M → company_settings, sequences
tbl得意先M → customers
tbl建具台帳 → tategu_items
```

### Step 3: 伝票データ移行
```
tbl見積, tbl売上 → vouchers
tbl見積明細, tbl売上明細 → voucher_lines
```

### Step 4: 会計データ移行
```
tbl請求書, tbl売掛 → invoices
tbl入金 → payments
```

### Step 5: 手動作業（移行後）
- 案件（projects）作成: 各得意先の現場名をもとに手動登録
- 案件と伝票の紐づけ: vouchers.project_id を手動更新
- 得意先の billing_offset_days / payment_due_days 個別調整
- catalog-system との連携: tategu_items.base_catalog_item_id を設定

### Step 6: 動作確認
- 売掛残高が Accessと一致するか確認
- 建具台帳の原価計算が正しいか確認
- テスト伝票で見積→売上→請求フローを通しテスト

---

## 10. 移行スクリプト設計方針

- 移行スクリプトは `C:\Fujiruki\Projects\Beaver\tools\migrate_access.php` として実装
- Accessの `.accdb` を `COM`（ADODB）または ODBC でクエリし、PDOで Beaver DB に挿入
- ログを `tools\migrate_log_YYYYMMDD.txt` に出力
- 外部キー制約はマスターデータ移行完了後に有効化

> **移行は1回限り**。本番移行前に必ず開発環境でドライラン実施。
