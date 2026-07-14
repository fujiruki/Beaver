# 引き継ぎ資料 — Beaver

**最終更新**: 2026-07-14

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

## 本日の作業（2026-07-14）: R-076完結 + 建具台帳原価モデル設計・P0実装・本番デプロイ

### R-076「Beaverと同期」統合 P2 ✅ 完了（AccessTategu側と合わせて完結）
- B2-2（`lines_mode==='replace'`でvoucher_lines全置換）: コミット`dd6e1fb`
- B2-3（`PATCH /vouchers/{id}/access-link`新設）: コミット`944e674`
- AccessTategu側（A2-1〜A2-4）も全て完了・検証済み。詳細はAccessTategu `docs/handover/20260714_セッション引き継ぎ.md` 参照

### 建具台帳の原価モデル設計・ADR化 ✅ 完了
- Access建具台帳（本体/金物/ガラス/労務費の行明細＋木材立米計算）とBeaver `tategu_items`（固定集計列）のギャップをCodexに静的調査させ、AccessTategu wiki `docs/wiki/integration/tategu_daicho_gap.md` にまとめた
- 設計をADR化: AccessTategu wiki `docs/wiki/adr/ADR-003_tategu_cost_model.md`。核心は「労務費をどこに合算するか」をハードコードせず、既存の`aggregation_category_master.merge_into_price_code`（現状は伝票行でのみ使用）を建具台帳側にも流用する設計にしたこと

### ADR-003 P0実装 ✅ 完了・本番デプロイ済み
- migration 021: `tategu_item_cost_lines`（本体/金物/ガラス統合、`category_code`参照）・`tategu_item_labor_lines`（労務費）を新設
- `PUT /tategu-items/{id}/cost-lines` / `/labor-lines`（全件入れ替え）＋`recalcTateguCost`拡張で`tategu_items`の固定集計列を明細から再計算するキャッシュに
- コミット `55b1e92`。regression-suite.sh（vitest+PHP7本）全緑
- **フロントUIは未実装**（今回はバックエンドのみ、次の作業候補の筆頭）

### 本番デプロイ ✅ 完了（SSH遮断のためFTPS代替手順を新規確立）
- `upload.ps1`前提のSSH/SCPがConoHa側でブロックされていたため、FTPS（明示的AUTH TLS）での代替デプロイを実施
- 手順・ハマりどころ（curl+Windows Schannelの451エラー対策等）は `docs/wiki/knowledge/deploy_ftps_fallback.md` に記録。次回SSHが使えない時はこれを参照
- migration 021は「本番でPHPスクリプトを一回限り実行してその場で適用」方式（ダウンロード→再アップロードのレース回避）。バックアップ: `api/backups/database_20260714_145125_pre_r076_tategu_cost_lines.sqlite`
- デプロイ範囲: 自分のP0実装 + 別作業でマージされていたDataTableソート機能（VoucherList/InvoiceList）等も含めmaster全体を本番同期

### 副次的発見
- 本番`aggregation_category_master`は現状0件（動的原価内訳の同期実績が無いため）。migration 021のseed（`merge_into_price_code`初期値）は無害な空振り。今後この機能を使い始めた時点で改めて設定が必要

### R-027b（本番日次バックアップ停止） ✅ 解決済み（同日中に追加着手）
- SSHは引き続き遮断中だったため、FTPS＋一回限りPHPスクリプト（`shell_exec`経由）で調査・復旧
- 根本原因: `backup.sh`がBeaverルート直下・git管理外に置かれており、`upload.ps1`のデプロイコマンド（ルート直下でapi/と*.sqlite以外を全削除）が2026-06-09以降の最初のデプロイで消していた。crontab自体は生きていた
- 復旧: `api/backup.sh`としてgit管理下に再構築（デプロイで保護される）、crontabを`/bin/bash`経由起動に変更（chmodリセットに強くする）、30日ローテーションを自動生成ファイルのみに限定（手動退避分を保護）。本番テスト実行で動作確認済み
- 詳細: `docs/requests.md` の R-027b（解決済みセクション）参照

### ADR-003 P0 フロントUI ✅ 完了（コミット `acb3f20`、本番未デプロイ）
- `TateguItemDetail.tsx`に材料費明細（`TateguCostLinesPanel`）・労務費明細（`TateguLaborLinesPanel`）の行編集パネルを新設。既存の「集計区分別内訳」セクションはそのまま維持
- 明細が存在する区分の固定集計列（本体材料費等）は読み取り専用表示に切替え、「明細から自動計算されます」と注記
- Codexに実装委譲→指揮役が`/code-review`（medium）を実施し、**明細を全削除して保存すると固定列が無警告で0円に上書きされる重大バグ（CONFIRMED）を検出**。原因はバックエンド`recalcTateguCost(forceLineRecalc=true)`が明細0件でも強制上書きする一方、フロントの保存順序が「本体更新→明細保存」だったため、ユーザーが再入力した固定列の値も明細保存側の強制ゼロ化で消えてしまう構造だった
- 修正をCodexに再委譲: 保存順序を「明細保存→本体更新」に変更し、本体更新のpayloadから明細が存在する区分の固定列キーを除外する方式で解消（バックエンドは無変更）。回帰テスト2本（明細あり/明細を全削除の両ケース）で固定
- 指揮役がテスト99件・ビルドを再実行して裏取り済み。**本番デプロイはまだ実施していない**（次回セッションで実施するかは要判断）

---

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
| ADR-003 P0 フロントUI | 材料費明細・労務費明細の行編集パネル | ⚠️ コミット済み（`acb3f20`）・**本番未デプロイ** |

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
| ADR-003 P0デプロイ | フロントUIはコミット済み（`acb3f20`）だが本番未デプロイ。次回セッションで実施 | デプロイ作業 | 高 |
| ADR-003 P1 | 木材原価サブドメイン（`wood_species_master`/`tategu_item_wood_lines`、立米計算） | 機能追加 | 中 |
| ADR-003 P2 | 集計区分の合算設定画面（`aggregation_category_master`の`merge_into_price_code`をUIから編集） | 機能追加 | 中 |
| R-072-B | projectsテーブルのdev/prodスキーマ乖離の棚卸し（本番手動追加分がmigration履歴に記録されていなかった） | 品質改善 | 中 |
| R-034 | validation 強化（silent NULL 許容など） | 品質改善 | 低（実運用での顕在化待ち） |
| R-035 | /projects/sync pagination + 重複対策 | 品質改善 | 低（実運用での顕在化待ち） |
| R-038 | 得意先マスタ双方向同期（未設計） | 機能追加 | 低 |

---

## 次タスク候補（優先順）

### 優先1: ADR-003 P0フロントUIの本番デプロイ

フロントUI（材料費明細・労務費明細の行編集パネル）は実装・テスト・レビュー・コミット済み（`acb3f20`）。バックエンドは既に本番稼働中で互換性あり。本番バックアップ→デプロイ→疎通確認の手順で反映する。

### 優先2: R-072-B（projectsスキーマ乖離の棚卸し）

本番`projects`テーブルの`PRAGMA table_info`とdevの`schema.sql`＋全migration適用後のスキーマを突合し、他に記録漏れがないか棚卸し。

### 優先3: ADR-003 P1/P2（木材原価サブドメイン・合算設定画面）

フロントUIの後。詳細はADR-003参照。

### 優先4: R-034/R-035（品質改善、低優先）

実運用で問題が顕在化してから着手する想定。`docs/requests.md` に詳細あり。

### 優先5: R-038（得意先マスタ双方向同期）

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
