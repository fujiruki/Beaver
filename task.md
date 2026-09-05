# Beaver タスクキュー

## 進行中
- [ ] R-0140: AccessTategu R-086 連携の Beaver 側対応。仕様: `docs/spec/R-0140_accesstategu_r086_integration.md`（受入条件表と検体 JSON あり）。(1) quantity REAL 化・負数許容、(2) PATCH /customers/{id}/access-link、(5) 見積番号 +10000 変換 SQL とテストは今すぐ着手可。(3) 基準線は Access 側の合図待ち。(4) は確認済みで作業なし。完了報告はテスト名・実行ログ・変更ファイル一覧で
- [ ] R-0141: Beaver ベータ環境（AppID Beaver_beta、別 SQLite、upload.ps1 の配置先切替）。仕様: `docs/spec/R-0141_beaver_beta_environment.md`。完了時に Access 側へ渡す情報を仕様書末尾に追記
- [ ] R-0132: PWAインストール時のアイコン未設定（favicon/apple-touch-icon/manifest.json不足）。/readyoubouで本番id=36を確認。素材（ロゴ画像）待ちのため未着手、次回セッション候補

## 完了（本セッション）
- [x] R-0138: 段取りボードの案件名・得意先名を2列表示＋列幅ドラッグ調整＋幅記憶。/readyoubouで本番id=46を確認、藤田晴樹さん確認済み。仕様: `docs/spec/R-0138_dandori_label_columns.md`。Agent（worktree）にTDD委譲、指揮役が再実行して裏取り（vitest全PASS・build成功）
- [x] R-0139: PC表示時のナビゲーションをサイドバーから上部ヘッダーのタブへ変更＋アイコン追加。/readyoubouで本番id=45を確認、藤田晴樹さん確認済み。仕様: `docs/spec/R-0139_pc_header_tab_nav.md`。実装過程で発見した既存バグ（モバイルヘッダーのインラインstyleがTailwindの`md:hidden`を上書きしPC幅でも表示され続ける）もあわせて修正。指揮役が実ブラウザ（1920px幅）で見た目確認・vitest全PASS・build成功・回帰スイート🔵青を確認
- [x] R-0137: 上部の保存ボタンが隠れる。本番id=44を確認。R-0139の実装過程で真因判明（モバイルヘッダーのインラインstyleがTailwindのレスポンシブ非表示を上書きしPC幅でも表示され続けていた）、R-0139の修正で解消
- [x] R-0135: 得意先検索が半角カタカナ表記の読みがなにヒットしない（本番id=41・43、原因確定・藤田晴樹さん承認済み）。仕様: `docs/spec/R-0135_kana_search_hankaku_katakana.md`。実装はCodex（codex:codex-rescue、worktree隔離）にTDD委譲、指揮役が再実行して裏取り（vitest全PASS・PHPテスト24/24・build成功・回帰スイート🔵青）。コミット`4be2522`→本番デプロイ済み。本番DB直接確認でid=50以外の半角カタカナ表記の得意先（id=62, 199, 403, 707等）も検索ヒットするようになったことを確認済み
- [x] R-0133: 「Youkanで見る」ボタンの表示改善（文言短縮・折り返り解消）。/readyoubouで本番id=39を確認。仕様: `docs/spec/R-0133_R-0134_ui_fixes.md`。Agent（worktree）へ委譲・指揮役が再実行して裏取り（vitest全PASS、build成功）
- [x] R-0134: 改善要望を送るモーダルの表示位置バグ（サイドバーのCSS transformがFeedbackModalのfixedオーバーレイのcontaining blockになっていた）。/readyoubouで本番id=40を確認。`createPortal`でdocument.body直下へ描画する形に修正。仕様: `docs/spec/R-0133_R-0134_ui_fixes.md`。コミット`f56677d`→本番デプロイ済み
- [x] R-0136: 「原価から売値を設定」ボタンの二重丸めバグ。/readyoubouで本番id=42を確認、藤田晴樹さん承認済み。本体原価＋mergeされる労務費を合算後に1回だけ丸める形へ修正（`calcCategorySellPrices()`）。TDD（Red→Green）で固定。仕様: `docs/spec/R-0136_profit_rate_double_rounding.md`。コミット`cb59443`→本番デプロイ済み
- [x] R-0133/R-0134/R-0136 共通: 回帰スイート🔵青（vitest全PASS＋PHPテスト15本）、`upload.ps1`で本番デプロイ、`/api/health`・アプリ本体とも200確認済み（2026-09-01）
- [x] R-0131【緊急】: スマホ表示で上部のボタン・行がヘッダーに隠れる（R-0129リグレッション）。/readyoubouで本番id=37・38を確認、fixerへ委譲・指揮役が再実行して裏取り（vitest 67ファイル354件、build成功、モバイル/デスクトップ双方をChrome DevTools Protocolエミュレーションで目視確認）。コミット`a055a31`→push→本番デプロイ済み（DB事前バックアップ`database_20260831_1612.sqlite`）、`/api/health`・アプリとも200確認済み
- [x] R-0130: 案件編集画面・案件一覧に「Youkanで見る」ボタン。仕様: `docs/spec/R-0130_youkan_link_button.md`。Youkan側新規API（R-0160、Youkanリポジトリ `docs/SPEC/13_Beaver連携プロジェクトURL.md`）と合わせて実装・検証完了（PHPテスト9/9、vitest 66ファイル352件、build成功、回帰スイートexit 0）。未コミット
- [x] R-0129: ダッシュボード・案件一覧・得意先一覧のスマホ最適化（レスポンシブ対応）。仕様: `docs/spec/R-0129_mobile_responsive_ui.md`、設計議事録: `docs/kaigi/2026-08-31-スマホ最適化UI設計.md`。実装・テスト・build・回帰スイート確認済み、コミット`ec1d290`
- [ ] **【緊急・最優先】バグ修正（R-ID未採番）**: R-0119以降の時間入力（`voucher_line_costs`のFACTORY_TIME/SITE_TIME）が`voucher_lines.cost_factory_hours`/`cost_site_hours`固定列に反映されず、B1のbaseline_hours・Youkan容量判定（B2、本番稼働中）・B3のwork_packagesが工数を過小評価する。詳細: `docs/requests.md` -11。次セッションはこれを最優先で仕様化・修正すること
- [x] R-0120: Beaver-Youkan連携 B3 — 見積内訳の作業パッケージ公開（2026-08-27完了・本番デプロイ済み。仕様: `docs/spec/R-0120_youkan_work_packages_b3.md`）。**Y2へは進まない**
  - [x] 調査: 見積明細構造・工数記録単位・identity安定性の調査（2026-08-27）
  - [x] 仕様化: `docs/spec/R-0120_youkan_work_packages_b3.md`＋Youkan向け契約更新 `docs/spec/R-0117_youkan_api_contract.md`（§10 work_packages、2026-08-27）
  - [x] 実装: `list_helpers.php`（`fetchProjectBaselines`拡張＋`fetchWorkPackagesByVoucherIds`新設）＋`integrations_youkan.php`（`work_packages`組み込み）。Codex TDD委譲→指揮役が再実行で裏取り
  - [x] TDD: `test_youkan_integration.php` へB3ケース追加（29 PASS / 0 FAIL）
  - [x] 検証: 回帰スイート exit 0、本番デプロイ（コミット`2748f06`）、manual/none案件の後方互換を実機確認
  - [ ] **保留**: estimate baseline（work_packages非空）の実機検証は上記バグ修正後に再実施
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
- [x] R-0118: Beaver-Youkan連携 B2 — 案件詳細のYoukan容量判定表示（2026-08-27完了。本番トークン設置・実案件検証まで完了。`docs/spec/R-0118_youkan_capacity_check_b2.md`）
- [x] R-0119: 伝票明細の時間入力・保存不具合の一括修正（2026-08-27完了。仕様: `docs/spec/R-0119_voucher_line_fixes.md`。S2〜S6実装＋S1a/S1b/S1c追加実装（catalog-system URL設定化・fallback変換コード整合・集計区分5件シード）→本番デプロイ→新規伝票作成500エラーのホットフィックス（コミット`3878ebf`）→藤田晴樹さん本番実機確認OK。詳細はrequests_log.md）
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
