# Beaver タスクキュー

## 進行中
- [ ] R-0119: 伝票明細の時間入力・保存不具合の一括修正（2026-08-26仕様確定）。仕様: `docs/spec/R-0119_voucher_line_fixes.md`
  - [x] S3: 新規伝票作成時に明細も保存（2026-08-26、二重作成ガード含む。Codex TDD、差し戻し1回で修正）
  - [x] S4: sales_category_id をAPIのINSERT/UPDATE許可リストへ（2026-08-26）
  - [x] S5: 課税フラグ英語コード統一（2026-08-26。recalc比較・同期境界の相互変換・migration 026をdev適用。**本番適用は実データ分布確認後**）
  - [x] S6: costs/prices空配列クリア（2026-08-26）
  - [x] S2: LegacyRow廃止＋未同期時警告（2026-08-26、差し戻しで死コード完全削除を確認）
  - [x] 検証（ローカル）: 回帰スイート🔵青（vitest 323件・PHPテスト17ファイル）・R-0119 PHPテスト8/8・npm run build成功。指揮役が再実行して裏取り済み（2026-08-26）
  - [ ] S1: catalog-systemでtime型区分追加→Beaver同期（データ作業）。本番同期URL `localhost:8002` 固定の疎通検証、本番マスタの現状確認
  - [x] S1a/S1b/S1c追加実装（2026-08-27、Codex TDD）: CATALOG_API_BASE設定化・fallback変換コードの実マスタコード整合（建具原価再計算・列マッピング・localStorage正規化含む）・migration 027（5区分シード）。コミット`50032fb`
  - [x] デプロイ（2026-08-27、事前承認済み）: 本番DBバックアップ（`database_20260827_0034_pre_r0119.sqlite`）→ upload.ps1 → migration 026/027本番適用（taxable 24,351/non_taxable 1,133へクリーン変換・5区分シード確認）→ health/アプリ200確認
  - [ ] 本番実機確認（**藤田晴樹さんの目視待ち**）: 伝票画面に工場時間(h)・現場時間(h)の入力列が出る／旧伝票の金額・時間がセルに表示される／品名編集が保存される／税額計算が正しい → OKなら台帳を完了へ
- [ ] R-0118: Beaver-Youkan連携 B2 — 案件詳細のYoukan容量判定表示（2026-08-26着手、Youkan Y1本番検証完了を受けて開始）。仕様: `docs/spec/R-0118_youkan_capacity_check_b2.md`。**B2完了で停止し、B3へは進まない**
  - [x] A: バックエンドプロキシ `GET /projects/{id}/capacity-check`（TDD、スタブYoukanでPHPテスト10件、2026-08-26）
  - [x] B: フロント `CapacityCheckPanel`（結論優先表示・縮退表示、vitest 6件、2026-08-26）
  - [x] 検証（前半）: 回帰スイート🔵青（exit 0、新テスト2本をスイートへ登録）→ コミットe9abc34 → 本番デプロイ → Youkan未接続時の縮退表示・通常業務非影響を本番実機確認（2026-08-26）
  - [ ] 検証（後半・**藤田晴樹さんのトークン設置待ち**）: Youkan側でBEAVER_CAPACITY_TOKEN発行 → Beaver本番 `api/config.local.php` に `BEAVER_CAPACITY_TOKEN`（Youkan発行値）と `YOUKAN_CAPACITY_URL`（`https://door-fujita.com/contents/Youkan/api/integrations/beaver/capacity-check`）を設置 → 本番疎通・実案件でのcapacity-check確認 → 台帳を完了へ
- [x] R-0117: Beaver-Youkan連携 B1 — 完了（2026-08-25、本番デプロイ・疎通確認済み）。契約引き渡し物: `docs/spec/R-0117_youkan_api_contract.md` ＋ トークン（`.claude/secrets/youkan_api_token`）
- [ ] R-0111: 段取りボード（案件ガントチャート）— 検証中（藤田晴樹さんの実機確認待ち）。仕様: `docs/spec/R-0111_dandori_board.md`、モック: `docs/spec/R-0111_mockup.html`
  - [x] A: `frontend/src/lib/dandoriCalc.ts` 純粋関数＋vitestテスト20件（TDD、2026-08-24）
  - [x] B: 1日あたり作業時間 → 既存`AppSettingsContext.hoursPerDay`を使用に方針変更（DB追加は撤回、バックエンド変更なし、2026-08-24）
  - [x] C: `/dandori` 画面本体＋ルート＋ナビ（2026-08-24）
  - [x] 検証: vitest 293件＋PHPテスト14本＋npm run build＋ブラウザ目視（バー描画・超過赤斜線・⚠バッジ・稼働帯・空きマーカー・折り返しモード・6ヶ月ビュー・バー/納期線ドラッグのDB即保存を確認、2026-08-24）
  - [x] 実機フィードバック対応: F1ページ横スクロール禁止・F2開始日未設定リスト（2026-08-24デプロイ済み）
  - [x] F3「次の空きに置く」・F4開始日未設定のDataTable化（2026-08-24デプロイ済み）
  - [x] F5バー外ラベル表示（横スクロールモードのみ、2026-08-24）
  - [x] 藤田晴樹さんの最終確認OK → 完了（2026-08-25）
- [x] /readyoubou: 本番フィードバックid=22〜27対応（R-0112〜R-0116＋R-0111 F5、2026-08-24、詳細はrequests_log.md）

## 次のステップ（オプション）
- [ ] 実データでの動作確認（dev_start → npm run dev → ブラウザ確認）
- [ ] バリデーション強化（zod スキーマ）
- [ ] 請求書プレビュー・印刷（PDF出力）
- [ ] 権限管理（ユーザー認証）

## 完了
- [x] R-0110: 番頭AI向けAPIトークン認証の追加（2026-08-18、本番デプロイ・トークン発行・HTTPS疎通確認済み、`docs/spec/R-0110_banto_api_token.md`）
- [x] R-0109: auth-hub連携によるログイン基盤の導入（2026-08-17、本番デプロイ・実機確認・Basic認証撤去済み、`docs/spec/R-0109_auth_hub_integration.md`）
- [x] Step 2: パッケージインストール + 基盤ファイル作成（2026-03-17）
  - TanStack Query, Zustand, React Hook Form, Zod, React Router インストール済み
  - `src/api/client.ts`, 全 types/, `src/App.tsx`, `AppLayout.tsx` 作成済み
- [x] Step 3: 得意先 CRUD（パターンファイル確立）（2026-03-17）
  - `src/api/customers.ts`, `CustomerList.tsx`, `CustomerDetail.tsx` 作成済み
- [x] Tailwind CSS セットアップ（--legacy-peer-deps で @tailwindcss/vite インストール済み）（2026-03-17）
- [x] 建具台帳 CRUD（2026-03-17）
  - `src/api/tateguItems.ts`, `TateguItemList.tsx`, `TateguItemDetail.tsx` 作成済み（原価リアルタイム計算付き）
- [x] 案件 CRUD（2026-03-17）
  - `src/api/projects.ts`, `ProjectList.tsx`, `ProjectDetail.tsx` 作成済み
- [x] 伝票編集（2026-03-17）
  - vitest セットアップ、`src/lib/voucherCalc.ts`（純粋関数 + 14テスト全パス）
  - `src/hooks/useTaxCalc.ts`, `useCostCalc.ts`（useMemoラップ）
  - `src/stores/voucherStore.ts`（Zustand: 利益率・isDirty）
  - `src/api/vouchers.ts`（楽観的更新付き9フック）
  - `src/components/voucher/`（TotalSummary, VoucherHeader, TateguSelector, LineItemRow, ProfitRateBar）
  - `src/pages/VoucherList.tsx`, `VoucherEdit.tsx`
- [x] 請求・入金・ダッシュボード（2026-03-17）
  - `src/types/invoice.ts`（バックエンド実態に合わせて更新）
  - `src/api/invoices.ts`, `src/api/payments.ts`
  - `src/pages/InvoiceList.tsx`（年月・得意先フィルタ、サマリーカード）
  - `src/pages/InvoiceDetail.tsx`（詳細表示、入金登録・取消）
  - `src/pages/Dashboard.tsx`（KPIカード、クイックアクション、最近の伝票）

---

## ルール
- 「進行中」は常に1つだけ
- 完了したら `[ ]` → `[x]` にして次を「進行中」に移す
- 1タスク = 1ファイル or 1まとまり（15〜30分単位）
