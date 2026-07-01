# 引き継ぎ資料 — Beaver

**最終更新**: 2026-07-01

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

## 現在の状態（2026-07-01）

### 実装済み

| フェーズ / R番号 | 内容 | 状態 |
|---|---|---|
| Phase 1〜6 | 設計〜UI刷新・原価管理まで全フェーズ | ✅ 完了 |
| R-025 | BA連携 Phase1（案件番号橋渡し） | ✅ 完了 |
| R-027 | 定時バックアップ | ✅ 完了 |
| R-065 | 「引用して売上」機能 | ✅ dev 実装済み（本番未デプロイ） |
| R-066 | AccessTategu ↔ Beaver 双方向同期（Phase1まで） | ✅ dev 実装済み |

### migration 適用状況

| 環境 | 最新適用 |
|---|---|
| dev（ローカル） | 018（`last_synced_at`）まで |
| prod（本番） | 017（`quoted_at`）まで ← **018 が未適用** |

---

## 未対応リクエスト（要着手順）

詳細は `docs/requests.md` 参照。

| R番号 | タイトル | 種別 | 優先 |
|---|---|---|---|
| R-067 | 得意先詳細の保存ボタンが機能しない | バグ修正 | 高 |
| R-068 | 得意先検索のIMEインクリメンタルサーチ問題 | バグ修正 | 高 |
| R-069 | 「＋新規得意先」ダイアログをフル画面化 + 登録後の候補即時更新 | 機能改善 | 中 |
| R-034 | validation 強化（silent NULL 許容など） | 品質改善 | 低 |
| R-035 | /projects/sync pagination + 重複対策 | 品質改善 | 低 |
| R-038 | 得意先マスタ双方向同期（未設計） | 機能追加 | 低 |

---

## 次タスク（優先順）

### 優先1: prod に migration 018 を適用

AccessTategu との同期で `last_synced_at` カラムが必要。

```bash
# ConoHa サーバーで実行
php -r "
\$db = new PDO('sqlite:api/database.sqlite');
\$db->exec(file_get_contents('api/migrations/018_vouchers_last_synced_at.sql'));
echo 'done';
"
```

### 優先2: R-067 得意先詳細の保存バグを修正

`frontend/src/pages/CustomerDetail.tsx` の PUT /customers/:id 保存処理を確認。
TanStack Query の `invalidateQueries(['customers', id])` が保存後に呼ばれているか確認・修正。

### 優先3: R-068 IMEインクリメンタルサーチ修正

得意先検索テキストボックスで `onCompositionStart/End` イベントを使い、
変換中フラグを立てて `onChange` は変換確定後のみ検索発火させる。

### 優先4: Beaver 本番デプロイ（R-065）

dev に実装済みの「引用して売上」を本番へ。migration 018 適用後に実施。

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
  - `billed` と `void` は編集不可（readonly 時に「編集できません」表示）

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
| `requests.md` | 未対応リクエスト一覧（R-034〜R-069） |
