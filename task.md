# Beaver タスクキュー

## 進行中
- [ ] R-0110: 番頭AI向けAPIトークン認証の追加（`docs/spec/R-0110_banto_api_token.md`）

## 次のステップ（オプション）
- [ ] 実データでの動作確認（dev_start → npm run dev → ブラウザ確認）
- [ ] バリデーション強化（zod スキーマ）
- [ ] 請求書プレビュー・印刷（PDF出力）
- [ ] 権限管理（ユーザー認証）

## 完了
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
