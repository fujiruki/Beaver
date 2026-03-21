# Beaver CLAUDE.md

建具店向け 見積・売上・請求・案件管理 Web システム。

## 最初に読むべきファイル

作業開始前に以下を確認すること：

1. **このファイル（CLAUDE.md）** — 環境・ルール
2. **`Hikitsugi.md`** — 直前の作業内容・現在地・次のタスク
3. **`docs/`** — 設計ドキュメント（DB設計・画面設計・フロー解説）

## システム概要

```
得意先 → 案件 → 伝票（見積/売上）→ 請求書 → 入金
                  ↑
              建具台帳（品番マスタ・原価）
```

- フロントエンド: React + TypeScript (Vite) — `frontend/`
- バックエンド: PHP + SQLite — `api/`
- DB: `api/database.sqlite`（1ファイル、バックアップ不要）

## 開発サーバー起動

```powershell
# バックエンド（別ターミナル）
cd C:\Fujiruki\Projects\Beaver\api
php -S localhost:8003 index.php

# フロントエンド
cd C:\Fujiruki\Projects\Beaver\frontend
npm run dev
```

アクセス: http://localhost:5178/contents/Beaver/

## 実装済み機能（2026-03-17時点）

- 得意先 CRUD
- 案件 CRUD
- 伝票（見積・売上）作成・編集・明細行管理・行操作（複製/挿入/移動）
- 建具台帳 CRUD・カタログ連携（catalog-system プロキシ）
- 請求書
- 入金管理
- 売上種別マスタ（設定画面あり）
- 粗利・純利益率・日割り粗利サマリー

## DB スキーマ概要

主要テーブル:

| テーブル | 役割 |
|---|---|
| `customers` | 得意先マスタ |
| `projects` | 案件 |
| `vouchers` | 伝票ヘッダー（見積/売上） |
| `voucher_lines` | 伝票明細行 |
| `tategu_items` | 建具台帳（品番マスタ・原価） |
| `tategu_item_additions` | 建具の追加工程 |
| `invoices` | 請求書 |
| `payments` | 入金 |
| `sales_categories` | 売上種別マスタ |

マイグレーション管理: `api/migrations/` — 適用済みは `applied.txt` に記録。

## 主要ファイルマップ

```
api/
├── index.php                  # ルーティング（全エンドポイント一覧はここ）
├── routes/                    # 各リソースのCRUD実装
└── migrations/                # DBスキーマ変更履歴

frontend/src/
├── App.tsx                    # ルーター定義（全画面一覧はここ）
├── api/client.ts              # fetchラッパー（BASE = /contents/Beaver/api）
├── api/*.ts                   # TanStack Query フック（customers.ts を見本に）
├── components/voucher/        # 伝票の核心コンポーネント群
│   ├── VoucherHeader.tsx      # 伝票ヘッダーフォーム
│   ├── LineItemRow.tsx        # 明細行（16列）
│   └── TotalSummary.tsx       # 合計・粗利サマリー
├── lib/voucherCalc.ts         # 計算ロジック（税計算・粗利計算）
├── pages/VoucherEdit.tsx      # 伝票編集画面（最大・最複雑なコンポーネント）
└── types/                     # 型定義
```

## コーディングルール

- ページは `src/pages/` に配置
- APIフックは `src/api/{リソース名}.ts` に配置（`customers.ts` を見本にする）
- 型定義は `src/types/{リソース名}.ts` に配置
- APIは `api.get/post/put/delete` 経由（`api/client.ts`）
- Vite proxy: `/contents/Beaver/api/*` → `localhost:8003/*`
- 全コメント・ドキュメント・コミットメッセージは日本語

## 技術スタック

- React 19 + TypeScript + Vite
- TanStack Query（サーバー状態）
- React Hook Form（フォーム）
- Tailwind CSS + インラインスタイル混在（既存コードに合わせる）
- React Router v6

## テスト

```bash
cd frontend && npx vitest run
```

`frontend/src/lib/__tests__/voucherCalc.test.ts` に計算ロジックのテストあり。新しい計算関数を追加したら必ずテストを書くこと。

## 引き継ぎ

セッション開始時: `Hikitsugi.md` を確認する。
セッション終了時: `Hikitsugi.md` を更新する（何をした・何が残っているか）。
