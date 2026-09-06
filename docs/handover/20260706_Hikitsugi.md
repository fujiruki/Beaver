## 現在の状態（2026-07-06）

### 実装済み（本番反映済み）

| フェーズ / R番号 | 内容 | 状態 |
|---|---|---|
| Phase 1〜6 | 設計〜UI刷新・原価管理まで全フェーズ | ✅ 完了 |
| R-025 | BA連携 Phase1（案件番号橋渡し） | ✅ 完了 |
| R-027 / R-027b | 定時バックアップ（2026-06-09〜停止していたが復旧・恒久化済み） | ✅ 本番反映済み |
| R-060 | 明細行updated_at配線・sync API拡張（Stage2まで） | ✅ 本番反映済み |
| R-065 | 「引用して売上」機能 | ✅ 本番反映済み |
| R-066 | AccessTategu ↔ Beaver 双方向同期（Phase1〜2まで） | ✅ 本番反映済み |
| R-067 | 得意先詳細の保存ボタンが機能しない | ✅ 本番反映済み |
| R-068 | 得意先検索のIMEインクリメンタルサーチ問題 | ✅ 本番反映済み |
| R-069 | 「＋新規得意先」ダイアログのフル画面化＋即時反映 | ✅ 本番反映済み |
| R-070 | 案件一覧・建具台帳一覧のIMEフォーカス喪失 | ✅ 本番反映済み |
| R-071 | 案件の保存ボタンが機能しない | ✅ 本番反映済み |
| R-076 | AccessTategu ↔ Beaver 統合同期（P1・P2） | ✅ 本番反映済み |
| ADR-003 P0 | 建具台帳 原価行明細テーブル（cost_lines/labor_lines）＋API | ✅ 本番反映済み |
| ADR-003 P0 フロントUI | 材料費明細・労務費明細の行編集パネル | ✅ 本番反映済み（`acb3f20`） |

### 検証状況（2026-07-14時点）

- `cd frontend && npx vitest run` → 全通過
- `bash .claude/regression-suite.sh`（vitest + PHPテスト7本）→ exit 0
- `cd frontend && npm run build`（tsc -b && vite build）→ exit 0

### migration 適用状況

| 環境 | 最新適用 |
|---|---|
| dev（ローカル） | 021（`tategu_cost_lines`）まで |
| prod（本番） | 021（`tategu_cost_lines`）まで適用済み（2026-07-14、FTPS経由。バックアップ: `api/backups/database_20260714_145125_pre_r076_tategu_cost_lines.sqlite`）。020相当のカラムは本番に手動追加済みで充足（migration自体は未適用、詳細はR-072-B） |

---

## 未対応リクエスト（要着手順）

詳細は `docs/requests.md` 参照。

| R番号 | タイトル | 種別 | 優先 |
|---|---|---|---|
| ADR-003 P1 | 木材原価サブドメイン（`wood_species_master`/`tategu_item_wood_lines`、立米計算） | 機能追加 | 中 |
| ADR-003 P2 | 集計区分の合算設定画面（`aggregation_category_master`の`merge_into_price_code`をUIから編集） | 機能追加 | 中 |
| R-072-B | projectsテーブルのdev/prodスキーマ乖離の棚卸し（本番手動追加分がmigration履歴に記録されていなかった） | 品質改善 | 中 |
| R-034 | validation 強化（silent NULL 許容など） | 品質改善 | 低（実運用での顕在化待ち） |
| R-035 | /projects/sync pagination + 重複対策 | 品質改善 | 低（実運用での顕在化待ち） |
| R-038 | 得意先マスタ双方向同期（未設計） | 機能追加 | 低 |

---

## 次タスク候補（優先順）

### 優先1: R-072-B（projectsスキーマ乖離の棚卸し）

本番`projects`テーブルの`PRAGMA table_info`とdevの`schema.sql`＋全migration適用後のスキーマを突合し、他に記録漏れがないか棚卸し。

### 優先2: ADR-003 P1/P2（木材原価サブドメイン・合算設定画面）

詳細はADR-003参照。

### 優先3: R-034/R-035（品質改善、低優先）

実運用で問題が顕在化してから着手する想定。`docs/requests.md` に詳細あり。

### 優先4: R-038（得意先マスタ双方向同期）

未設計。着手前に設計から必要。

---

