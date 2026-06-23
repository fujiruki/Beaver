# 引き継ぎ資料 — Beaver

**最終更新**: 2026-06-23（R-065「引用して売上」実装完了）

---

## プロジェクト概要

**Beaver** — 藤田建具店向け 製造業見積・請求・案件管理 Webシステム。
既存の MS Access システムと並行稼働し、約1年後に Access を廃止する計画。

- **配置**: `C:\Fujiruki\Projects\Beaver\`
- **URL（本番）**: `https://door-fujita.com/contents/Beaver/`
- **URL（開発）**: `http://localhost:5178/contents/Beaver/`
- **API（開発）**: `http://localhost:8003`
- **Git**: `C:\Fujiruki\Projects\Beaver\.git`（masterブランチ）

---

## 現在の状態（2026-03-18時点）

### 完了済み

| Phase | 内容 | 状態 |
|---|---|---|
| Phase 1 | 設計ドキュメント確定 | ✅ 完了 |
| Phase 2 | プロジェクト作成・DBスキーマ・API基盤 | ✅ 完了 |
| Phase 3 | フロントエンド全画面実装 | ✅ 完了 |
| Phase 4 | 伝票改修・売上種別マスタ・カタログ連携UI | ✅ 完了 |
| Phase 5 | 集計区分マスター同期 + CostBreakdownPanel | ✅ 完了 |
| Phase 6 | 伝票明細行 — 集計区分動的対応 + 入力画面刷新 | ✅ 完了 |
| Phase 7 | AccessTategu連携（Beaver見積→Access取込） | 🔲 未着手（設計済み）|
| R-065  | 「引用して売上」機能 | ✅ 完了（dev のみ）|

**R-065 で実装したもの（2026-06-23, dev）:**
- `api/migrations/017_vouchers_quoted_at.sql` — vouchers に `quoted_at DATE` カラム追加
- `api/routes/vouchers.php` — convert-to-sales に `quoted_at` 付加 + 明細コピーを `source="beaver"/edited_in_beaver=1` に修正 + 見積詳細GET時に `converted_sales[]` 逆引きを付加
- `frontend/src/types/voucher.ts` — `source_voucher_id`, `source_estimate_no`, `quoted_at`, `converted_sales` フィールドを Voucher 型に追加
- `frontend/src/pages/VoucherEdit.tsx` — 「引用して売上」ボタン実装（void以外の見積で有効）、双方向トレースバナー追加
- `frontend/src/pages/VoucherList.tsx` — 一覧に「引用」列追加（売上の引用元見積番号バッジ表示）

**Phase 6 で実装したもの（commit: fe5052b）:**
- `voucher_line_costs` / `voucher_line_prices` テーブル追加（008マイグレーション適用済み）
- `voucher_lines` に `source_catalog_item_id` 列追加
- `aggregation_category_master` に `merge_into_price_code` 列追加（time型原価のmerge先指定）
- バックエンド: costs[]/prices[] サブテーブルの読み書き・固定列フォールバック
- フロント: `LineCategoryValue` 型、動的計算関数群（voucherCalc.ts）
- フロント: `LineItemRow` 全面刷新（動的列・備考2段目・引用アイコン・旧UI フォールバック）
- フロント: `VoucherEdit` 動的列ヘッダー生成
- フロント: `TotalSummary` に粗利率・日割粗利追加
- フロント: `ProfitRateBar` AppSettingsプリセット参照・time型原価のmerge対応
- フロント: `AppSettings` 利益率プリセット設定UI・旧データ移行マッピングUI
- テスト: 動的計算関数テスト追加（25件全通過）

---

## 残タスク

### Phase 7: AccessTategu連携（設計済み・未着手）🔲

**概要**: BeaverのVBA（AccessTategu）から見積伝票を取り込む機能。
Accessの`frm見積`に「Beaver見積取込」ボタンを置き、HTTP GETでBeaverの本番APIから
見積データを取得して`tbl見積`/`tbl見積明細`に書き込む。

**Beaver側の変更（3ファイル）:**

1. **`api/migrations/009_customer_access_no.sql`** — 新規作成
   ```sql
   ALTER TABLE customers ADD COLUMN access_customer_no INTEGER DEFAULT NULL;
   ```
   適用方法: PHP PDOでSQLite実行（`php -r "..."`）、または開発サーバー起動後に自動適用。

2. **`api/routes/customers.php`** — 修正
   - `PUT /customers/{id}` の更新フィールド配列（`$fields`）に `access_customer_no` を追加するだけ。
   - 該当箇所: `$fields = ['code','name','name_kana',...,'is_active'];` の末尾に追記。

3. **`frontend/src/types/customer.ts`** — 修正
   - `Customer` インターフェースに `access_customer_no?: number | null;` を追加。

4. **`frontend/src/pages/CustomerDetail.tsx`** — 修正
   - 「AccessTategu得意先№」ラベルで数値入力欄を追加（セクション: 基本情報の末尾）。
   - `useUpdateCustomer`フックで保存。

**接続設定:**
- 本番API: `https://door-fujita.com/contents/Beaver/api`
- 使用エンドポイント: `GET /vouchers/{id}` と `GET /customers/{id}`

**フィールドマッピング（VBA側参照用）:**

| Beaver フィールド | Access `tbl見積` / `tbl見積明細` |
|---|---|
| `voucher.voucher_date` | `見積日` |
| `customer.access_customer_no` | `得意先№` |
| `voucher.memo` | `摘要` |
| `voucher.voucher_no` | `Beaver伝票No`（新列） |
| `line.item_name` | `取付建具` |
| `line.location_name` | `取付場所` |
| `line.quantity` | `数量` |
| `prices[code="MAIN"].value` | `本体金額` |
| `prices[code="HARDWARE"].value` | `金物金額` |
| `prices[code="GLASS"].value` | `ガラス金額` |
| `line.line_total` | `明細金額` |
| `costs[code="MAIN"].value` | `原価_本体材料` |
| `costs[code="HARDWARE"].value` | `原価_金物` |
| `costs[code="GLASS"].value` | `原価_ガラス` |
| `costs[measure_type="time"]` 合計 | `作業時間` |
| `line.cost_labor_rate` | `原価_労務単価` |

※ カテゴリコードはcatalog-systemから同期したもの（`CatalogApiClient.bas`の定数と同じ: MAIN/HARDWARE/GLASS/FACTORY_TIME/SITE_TIME）

**完了後の検証:**
1. Beaverの得意先詳細画面で `access_customer_no` を設定できること
2. AccessTategu の `frm見積` 上の「Beaver見積取込」ボタンをクリック → ID入力 → レコード挿入
3. `tbl見積.Beaver伝票No` にBeaverの伝票番号が入ること

---

### その他の残タスク（設計不要）

| タスク | 概要 |
|---|---|
| **本番デプロイ設定** | `api/config.php` の DB_TYPE 切替、`.htaccess` 作成、本番サーバー配置手順 |
| **ダッシュボード充実** | 現状は空。月次売上・未請求伝票数などのKPIカード追加 |
| **catalog-system 本格連携** | catalog-proxy は実装済み。catalog-system 側の API が整備されたら連携 |

---

## アーキテクチャ概要

### データフロー
```
得意先 → 案件 → 伝票（見積/売上）→ 請求書 → 入金
                  ↑
              建具台帳（品番マスタ・原価スナップショット）
                  ↑
            catalog-system（別プロジェクト、Phase 6以降）
```

### 重要な設計決定
- 見積と売上は `vouchers` テーブルに統合（`voucher_type='estimate'|'sales'`）
- 見積→売上は完全ディープコピー（`POST /vouchers/{id}/convert-to-sales`）
- 税計算は伝票単位（`tax_input_type='exclusive'|'inclusive'`）
- 原価スナップショット: 建具台帳選択時に自動ロード、`reload-snapshots` で一括再取得
- 伝票ステータス: `draft` → `submitted` → `approved` → `billed` / `void`
  - `billed` と `void` は編集不可（readonly時に「編集できません」表示）

---

## 設計ドキュメント一覧

すべて `docs/` フォルダに格納。

| ファイル | 内容 |
|---|---|
| `20260316_依頼文.md` | ユーザー要件（原点） |
| `20260316_Beaver_01_概要とアーキテクチャ.md` | システム概要・技術スタック |
| `20260316_Beaver_02_DBスキーマ設計.md` | 全テーブル定義・税計算・原価→売価仕様 |
| `20260316_Beaver_03_画面設計_ワイヤー.md` | 全画面ワイヤーフレーム・UI構成表 |
| `20260316_Beaver_04_Accessデータ移行マッピング.md` | Access→Beaverフィールドマッピング |
| `20260317_Beaver_05_フロントエンド設計.md` | React設計・ディレクトリ構成・リアクティブ設計 |

---

## ユーザー情報

- 藤田建具店代表・藤田晴樹
- 日本語でのやり取りを希望
- 建具製造業の実務知識が豊富
- 開発の技術的判断は Claude に委任するスタイル
