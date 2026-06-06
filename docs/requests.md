# 要望・リクエスト

## 1. R-025: BA連携 Phase 1（案件番号橋渡し、2026-06-05 確定）

藤田晴樹確定。AccessTategu との双方向同期基盤を構築する。**旧 Phase 7（AccessTategu 連携）はこの R-025 に統合・拡張。**

### 確定方針
| 項目 | 決定 |
|:--|:--|
| 案件マスタ権威 | Beaver 一本（projects テーブル） |
| Access キャッシュ更新 | Access 起動時に自動 + 手動「Beaver 案件取込」ボタン |
| Access 側 新規見積作成 | 残す（→ push back 必要） |
| 着手範囲 | Step A〜E 全部 |

### Beaver 側のスコープ
- **Step A**: `GET /projects/sync` API 追加（Access 用軽量フォーマット、案件番号 / 案件名 / 得意先番号 / ステータス / 更新日時）
- **Step E**: Access→Beaver push back 受信エンドポイント（伝票・発送済ステータス等の同期）

### AccessTategu 側のスコープ
- Step B: `tbl案件_cache` 追加 + 「Beaver 案件取込」ボタン + 起動時自動同期
- Step C: `tbl見積` / `tbl売上` / `tbl請求書` に `案件番号` 列追加（migration 010-012）
- Step D: 見積入力フォームに案件番号コンボボックス追加

### 旧 Phase 7（統合済み、参考）
- `api/migrations/009_customer_access_no.sql` — customers に access_customer_no 列追加（R-025 で再評価）
- `api/routes/customers.php` — 更新フィールド配列に追加
- `frontend/src/types/customer.ts` + `pages/CustomerDetail.tsx` — 入力 UI 追加

詳細仕様: `Projects/AccessTategu/docs/R-025_BA連携_詳細設計.md`（grill 反映済み）。

### 着手タイミング
AccessTategu の R-022（請求書発送済管理）完了済み（2026-06-06、HEAD: fe479fe）。R-025 設計確定（grill 反映済み）→ Step A から実装開始可能。

---

## 2. R-027: Beaver の定時バックアップ機能（2026-06-06 R-025 grill で発案）

R-025 BA連携で AccessTategu からのデータ流入が増えるため、エラー時のリカバリ手段として定時バックアップを整備する。

### 仕様
- Windows タスクスケジューラで毎日定時に `api/database.sqlite` をコピー
- 保存先: `api/backups/database_yyyymmdd.sqlite`
- 30 日ローテーション（古いものを自動削除）
- 起動時の異常検出（前日比でサイズ激減等）でアラート

### 優先順位
R-025 完了後に着手。Beaver は SQLite 単一ファイルで運用しているため、cron 的なバックアップで十分。

---

## 3. TateguDesignStudioとの連携

TateguDesignStudio（建具設計・積算ツール）で設計・積算した建具データを、Beaverの伝票明細に取り込めるようにする。

### 想定フロー
1. TDSで建具を設計→積算完了
2. Beaverの伝票編集画面で「TDSから取込」ボタン
3. TDSのAPIから建具データ（名前、原価内訳、数量）を取得
4. 伝票明細行に自動挿入（原価スナップショットとして）

### 優先順位
Phase 7（Access連携）完了後に着手。
