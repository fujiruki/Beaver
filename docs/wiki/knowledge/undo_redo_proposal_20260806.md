# R-0098 データ操作Undo/Redo（元に戻す）設計提案（Fable、2026-08-06）

R-0096「戻るナビゲーション」（ページ遷移・履歴）とは独立の設計。こちらはデータ操作の取り消しに限定。

## 現状
- 変更履歴・監査ログの仕組みは無い（`updated_at`はあるが変更前の値は残らない）
- 削除の性質はエンティティ別に異なる: customers/projects/vouchersは論理削除・void系、**voucher_lines（伝票明細）・invoices・paymentsは物理削除**
- 保存タイミングもエンティティ別: **voucher_linesはセルのblur毎に即時PUT**、他は画面の保存ボタン押下でまとめて保存

## 最も痛いシナリオ
伝票明細行の誤削除・誤入力（blur即時保存×物理削除×操作頻度最多）が業務上の核心課題。次点で入金・請求の誤削除（会計データが痕跡なく消える）。

## 推奨方式（組み合わせ）
1. **Phase 1: 伝票編集画面の画面内Undo**（Ctrl+Z、行削除の「元に戻す」トースト。Undo時は必ずサーバーへ書き戻す設計でDB乖離を防ぐ）— 規模S〜M
2. **Phase 2: audit_logテーブル＋記録ヘルパーを全書き込み箇所に差し込み＋簡易閲覧ビューアー**（取り消し実行はまだ作らない、まず前後値を貯める）— 規模M
3. **Phase 3: 履歴からの限定的な取り消し実行**（update系のみ、請求書紐づけ済み伝票は不可等、条件を絞る。汎用Undoを目指さない）— 規模M〜L

## 認証基盤との関係
audit_logの`changed_by`をNULL許容で先に作っておけば、認証導入時にセッションのuser_idを詰めるだけで「誰が・いつ・何を」が完成する。認証を待つ必要はない。

## 藤田晴樹さんに判断してもらうべき論点
1. 期待する「元に戻す」の深さ（直前1操作かCtrl+Z連打か、日単位の巻き戻しか）
2. 一番困っている事故はどれか（明細誤削除／セル誤確定／得意先上書き／入金誤削除）
3. 請求書発行済み伝票のUndo禁止でよいか
4. 履歴の保持期間（無期限 or 決算期区切り）
5. Phase 1だけで当面十分か
6. Redo（Ctrl+Y）の要否
7. AccessTategu同期の上書きはUndo対象外（記録のみ）でよいか

## 参照
主要参照ファイル: `api/schema.sql` / `api/routes/vouchers.php`（明細=物理削除・伝票=void） / `api/routes/customers.php`（論理削除） / `api/routes/project_delete_helpers.php`（R-0095完全削除） / `api/routes/payments.php`・`invoices.php`（物理削除） / `frontend/src/components/voucher/LineItemRow.tsx`（blur即時保存）
