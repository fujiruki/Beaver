# 引き継ぎ資料 — Beaver

**最終更新**: 2026-07-06

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

## 本日の作業（2026-07-06）: デプロイ列車完了 + R-071

### デプロイ列車 ✅ 完了
- Access側: 本番BE migration 015-018 適用 + FE deploy + 事後検証
- Beaver側: migration 018・019 を本番適用、020相当は本番に手動追加済みで既存充足と判明。6/24以降の全コード（税計算修正・R-060 Stage2 API・R-066(c)・R-067〜R-071）を本番反映済み
- 本番バックアップ（巻き戻し用）: `api/backups/database_20260706_pre_train.sqlite`

### R-071: 案件の保存ボタンが機能しない ✅ 完了
- 赤 19f9a02 / 緑 1218189
- 真因: R-067とは別種。`projects` テーブルに `order_date`/`owner_name`/`general_contractor_name`/`site_contact` の4カラムが一度も追加されていなかった（migration漏れ、commit af9750d以来）のに、フロントエンド・APIは常時これらを参照してINSERT/UPDATEするため毎回SQLエラー（`no such column: order_date`）で保存が全滅していた。migration 020で追加して修正。
- 本番では該当4カラムが既に手動追加済みだったため、migration 020は本番未適用のまま充足（詳細はR-072-B参照）。

### voucher_lines.updated_at の挙動統一 ✅ 完了
- コミット d02c389
- migration 019からDEFAULT句を除去した際（SQLiteのALTER TABLE ADD COLUMNは非定数DEFAULT不可のため）、「フレッシュDB（DEFAULTが効く）」と「migrate適用DB＝本番/dev実態（DEFAULTなし）」で `updated_at` の初期値挙動が割れ、回帰テストが検出。
- 統一方針: カラムDEFAULTに依存せず、全INSERT経路（明細追加・convert-to-sales・insertSyncedLines）でアプリコードが `updated_at = CURRENT_TIMESTAMP` を明示セットするよう修正。

要望管理: R-071 は `docs/requests.md` から `docs/request_log.md` へ移動済み。

---

## 現在の状態（2026-07-06）

### 実装済み（本番反映済み）

| フェーズ / R番号 | 内容 | 状態 |
|---|---|---|
| Phase 1〜6 | 設計〜UI刷新・原価管理まで全フェーズ | ✅ 完了 |
| R-025 | BA連携 Phase1（案件番号橋渡し） | ✅ 完了 |
| R-027 | 定時バックアップ | ⚠️ 本番で停止疑い（R-027b参照） |
| R-060 | 明細行updated_at配線・sync API拡張（Stage2まで） | ✅ 本番反映済み |
| R-065 | 「引用して売上」機能 | ✅ 本番反映済み |
| R-066 | AccessTategu ↔ Beaver 双方向同期（Phase1〜2まで） | ✅ 本番反映済み |
| R-067 | 得意先詳細の保存ボタンが機能しない | ✅ 本番反映済み |
| R-068 | 得意先検索のIMEインクリメンタルサーチ問題 | ✅ 本番反映済み |
| R-069 | 「＋新規得意先」ダイアログのフル画面化＋即時反映 | ✅ 本番反映済み |
| R-070 | 案件一覧・建具台帳一覧のIMEフォーカス喪失 | ✅ 本番反映済み |
| R-071 | 案件の保存ボタンが機能しない | ✅ 本番反映済み |

### 検証状況（2026-07-06時点）

- `cd frontend && npx vitest run` → 全通過
- `bash .claude/regression-suite.sh`（vitest + PHPテスト5本）→ exit 0
- `cd frontend && npm run build`（tsc -b && vite build）→ exit 0

### migration 適用状況

| 環境 | 最新適用 |
|---|---|
| dev（ローカル） | 020（`projects_owner_contractor_contact`）まで |
| prod（本番） | 019（`voucher_lines_updated_at`）まで。020相当のカラムは本番に手動追加済みで充足（migration自体は未適用、詳細はR-072-B） |

---

## 未対応リクエスト（要着手順）

詳細は `docs/requests.md` 参照。

| R番号 | タイトル | 種別 | 優先 |
|---|---|---|---|
| R-027b | 本番の日次バックアップが停止している疑い（backup.sh不在、api/backups/最新が6/16で停止） | バグ・要調査 | **高** |
| R-072-B | projectsテーブルのdev/prodスキーマ乖離の棚卸し（本番手動追加分がmigration履歴に記録されていなかった） | 品質改善 | 中 |
| R-034 | validation 強化（silent NULL 許容など） | 品質改善 | 低（実運用での顕在化待ち） |
| R-035 | /projects/sync pagination + 重複対策 | 品質改善 | 低（実運用での顕在化待ち） |
| R-038 | 得意先マスタ双方向同期（未設計） | 機能追加 | 低 |

---

## 次タスク候補（優先順）

### 優先1: R-027b（本番日次バックアップ停止の調査・復旧）

backup.sh不在・crontab確認・直近バックアップの動作確認まで実施。障害時のデータ復旧リスクに直結するため優先度高。

### 優先2: R-072-B（projectsスキーマ乖離の棚卸し）

本番`projects`テーブルの`PRAGMA table_info`とdevの`schema.sql`＋全migration適用後のスキーマを突合し、他に記録漏れがないか棚卸し。

### 優先3: R-034/R-035（品質改善、低優先）

実運用で問題が顕在化してから着手する想定。`docs/requests.md` に詳細あり。

### 優先4: R-038（得意先マスタ双方向同期）

未設計。着手前に設計から必要。

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
- 一覧画面のページネーション検索（`useCustomersPaged`/`useProjectsPaged`/`useTateguItemsPaged`）は
  `placeholderData: keepPreviousData` ＋ 検索inputの `onCompositionStart/End` ガードが必須パターン（R-068/R-070）。
  新規に同種の一覧検索を作る場合はこのパターンに揃えること。
- `ALTER TABLE ADD COLUMN` で後付け追加した列（本番/devとも）は非定数DEFAULTを持てないため、
  カラムDEFAULTに依存せず、アプリコードの全INSERT経路で明示的に値をセットすること（voucher_lines.updated_at統一で確定）。
- 本番SQLiteは3.7.17と古く、部分インデックス（WHERE句付きCREATE INDEX）等3.8.0+機能に非対応。
  migrationは単純な`ALTER TABLE ADD COLUMN`等の3.7.17互換構文に限定すること。

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
| `requests.md` | 未対応リクエスト一覧 |
| `request_log.md` | 完了済みリクエストの記録 |
