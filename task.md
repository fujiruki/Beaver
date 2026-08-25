# Beaver タスクキュー

## 進行中
- [ ] R-0118: Beaver-Youkan連携 B2 — 案件詳細のYoukan容量判定表示（2026-08-26着手、Youkan Y1本番検証完了を受けて開始）。仕様: `docs/spec/R-0118_youkan_capacity_check_b2.md`。**B2完了で停止し、B3へは進まない**
  - [ ] A: バックエンドプロキシ `GET /projects/{id}/capacity-check`（TDD、スタブYoukanで成功・縮退・エラーマッピング固定）
  - [ ] B: フロント `CapacityCheckPanel`（結論優先表示・縮退表示、vitest）
  - [ ] 検証: 回帰スイート🔵青 → 本番デプロイ → 本番疎通・実案件判定・Youkan停止縮退・通常業務非影響
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
