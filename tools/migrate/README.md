# Access → Beaver データ移行手順

## 概要

```
Access (tate202403_be.accdb)
  ↓ Step 1: VBScript で JSON エクスポート
export/*.json
  ↓ Step 2: PHP で SQLite にインポート
Beaver (api/database.sqlite)
```

## 前提条件

- Microsoft Access / ACE OLEDBドライバ がインストール済み
- PHP 8.0 以上
- Beaver DB が初期化済み（一度でも `php -S localhost:8003 -t api/` で起動していること）
  - 未初期化の場合はインポートスクリプトが自動でスキーマを適用します

## 移行対象テーブル

| Access | Beaver | 備考 |
|---|---|---|
| tbl得意先M | customers | |
| tbl建具台帳（+ _本体/_金物/_硝子/_労務費） | tategu_items | 原価は各サブテーブルを集計 |
| tbl見積 + tbl見積明細 | vouchers + voucher_lines | voucher_type='estimate' |
| tbl売上 + tbl売上明細 | vouchers + voucher_lines | voucher_type='sales' |
| tbl入金 | — | Phase 2 以降（対象外） |
| tbl請求書 | — | Phase 2 以降（対象外） |

## 実行手順

### Step 1: Access から JSON エクスポート

Accessを閉じてから実行すること（ロックファイルが存在すると接続エラーになる）。

```cmd
cd C:\Fujiruki\Projects\Beaver\tools\migrate
cscript 01_export_from_access.vbs
```

成功すると `export\` ディレクトリに以下のファイルが生成される：

```
export/
  tokuisaki.json       ← tbl得意先M
  tategu.json          ← tbl建具台帳
  tategu_honbai.json   ← tbl建具台帳_本体
  tategu_kanamono.json ← tbl建具台帳_金物
  tategu_garasu.json   ← tbl建具台帳_硝子
  tategu_romuhi.json   ← tbl建具台帳_労務費
  mitsumori.json       ← tbl見積
  mitsumori_meisai.json← tbl見積明細
  uriage.json          ← tbl売上
  uriage_meisai.json   ← tbl売上明細
```

### Step 2: ドライラン（件数確認）

```cmd
php 02_import_to_beaver.php --dry-run
```

件数が期待通りであることを確認する。

### Step 3: 本番インポート

```cmd
php 02_import_to_beaver.php
```

## 伝票番号の形式

| 種別 | 形式 | 例 |
|---|---|---|
| 見積 | `M{NNNNN}` | M00123 |
| 売上 | `U{NNNNN}` | U00456 |

NNNNN は Access の `見積伝票№` / `売上伝票№`（整数）をゼロ埋め5桁にしたもの。

## 注意事項

### 冪等性

- `INSERT OR IGNORE` を使用しているため、2回実行しても重複挿入されない
- ただし既存レコードは更新されない（変更があった場合は手動で対応）

### 消費税集計

- `tax_amount` は 0 のままインポートされる
- `subtotal_taxable` / `subtotal_nontaxable` / `total_amount` は明細の合計から自動計算
- 消費税額は Beaver アプリ上で伝票を開いた際に再計算される

### 案件（projects）

- `vouchers.project_id` は全件 NULL でインポートされる
- 移行後に案件を手動作成し、伝票に紐づけること

### 建具原価

- `cost_labor_rate` は `company_settings.default_labor_rate`（デフォルト 5000円/h）を一律適用
- `cost_site_hours` は 0 で初期化。必要に応じて個別修正すること

### 得意先の請求設定

- `billing_offset_days = 10`（締日から10日後）を全件に一律適用
- `payment_due_days = 30` を全件に一律適用
- 必要に応じて個別修正すること

## 動作確認チェックリスト

- [ ] Beaver の得意先一覧に旧データが表示される
- [ ] 建具台帳に旧データが表示される
- [ ] 見積・売上伝票の件数が Access と概ね一致する
- [ ] 2回実行しても件数が増えない（冪等性確認）
