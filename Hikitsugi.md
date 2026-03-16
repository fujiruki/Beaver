# 引き継ぎ資料 — Beaver

**最終更新**: 2026-03-17

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

## 現在の状態（2026-03-17時点）

### 完了済み

| Phase | 内容 | 状態 |
|---|---|---|
| Phase 1 | 設計ドキュメント確定 | ✅ 完了 |
| Phase 2 | プロジェクト作成・DBスキーマ・API基盤 | ✅ 完了 |

**Phase 2 で作成したもの:**
- `api/schema.sql` — 全テーブル定義（company_settings, customers, projects, tategu_items, tategu_item_additions, vouchers, voucher_lines, invoices, invoice_vouchers, payments, sequences）
- `api/Database.php` — SQLite/MySQL切替可能なDBラッパー
- `api/index.php` — ルーター
- `api/routes/customers.php` — CRUD実装済み
- `api/routes/projects.php` — CRUD + 業務時間集計
- `api/routes/tategu_items.php` — CRUD + 追加工程 + 使用履歴
- `api/routes/vouchers.php` — CRUD + 明細管理 + 見積→売上変換 + スナップショット
- `api/routes/invoices.php` — 請求書管理
- `api/routes/payments.php` — 入金管理（繰越残高自動更新）
- `api/routes/settings.php` — 自社情報
- `frontend/` — Vite + React + TypeScript 雛形（`npm install` 済み）

### 次にやること（Phase 3 開始）

**フロントエンド実装**（`docs/20260317_Beaver_05_フロントエンド設計.md` を参照）

1. パッケージインストール:
   ```
   npm install @tanstack/react-query zustand react-hook-form react-router-dom
   npm install -D tailwindcss @types/node
   ```
2. `api/client.ts`, `types/` — APIクライアントと型定義
3. `api/*.ts` — TanStack Query フック群
4. `AppLayout` + ルーティング（App.tsx）
5. 得意先一覧・詳細（CRUDパターン確立）
6. 建具台帳一覧・詳細
7. **VoucherEdit**（見積・売上編集。リアクティブの中核）
8. 案件詳細
9. 請求管理・入金
10. ダッシュボード

---

## 開発サーバー起動方法

### バックエンド（PHP）
```bash
cd C:\Fujiruki\Projects\Beaver\api
php -S localhost:8003 index.php
```

### フロントエンド（Vite）
```bash
cd C:\Fujiruki\Projects\Beaver\frontend
npm run dev
```
→ `http://localhost:5178/contents/Beaver/` でアクセス

---

## アーキテクチャ概要

### 3層データ構造
```
catalog-system（別プロジェクト）
    ↓ base_catalog_item_id で参照（Phase 6以降）
tategu_items（建具台帳）
    ↓ tategu_item_id で参照
voucher_lines（見積・売上明細）
```

### 重要な設計決定
- 見積と売上は `vouchers` テーブルに統合（`voucher_type='estimate'|'sales'`）
- 見積→売上は完全ディープコピー（`POST /vouchers/{id}/convert-to-sales`）
- 税計算は伝票単位（`tax_input_type='exclusive'|'inclusive'`）
- 指定請求日: `vouchers.override_billing_date`（NULLなら通常締め日）
- 原価スナップショット: 建具台帳選択時に自動ロード、`reload-snapshots`で一括再取得

---

## 設計ドキュメント一覧

すべて `docs/` フォルダに格納。日付は作成日。

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

---

## 未決事項

- catalog-system との API連携（Phase 6）: `tategu_items.base_catalog_item_id` で連携予定
- Access 印刷連携（Phase 6）: Beaver→Access へのデータ push 方式は未設計
- 既存 Access データの移行: `docs/20260316_Beaver_04_Accessデータ移行マッピング.md` に方針あり
- 本番デプロイ設定（`api/config.php` の DB_TYPE 切替、.htaccess）: Phase 3 完了後に設計
