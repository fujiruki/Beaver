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

## Phase1 再設計（藤田晴樹さんの回答を受けて、2026-08-06）

藤田晴樹さんの実際の困りごと（得意先の誤上書き・入金/請求の誤削除、何段階も遡りたい）に合わせ、当初のPhase1案（伝票明細の画面内Undo）を差し替え。**伝票明細はスコープ外で確定**、対象は`customers`（更新）・`payments`（削除）・`invoices`（削除）の3テーブルに限定。

### 方式
単一の履歴テーブル`record_history`（entity汎用スキーマ、運用は3テーブル限定）＋復元API1本＋エンティティ別の復元ハンドラ3つ。

```sql
CREATE TABLE record_history (
    id            INTEGER PRIMARY KEY,
    entity        TEXT NOT NULL,      -- 'customers' | 'payments' | 'invoices'
    entity_id     INTEGER NOT NULL,
    action        TEXT NOT NULL,      -- 'update' | 'delete' | 'restore'
    before_json   TEXT NOT NULL,
    after_json    TEXT,
    changed_by    INTEGER,            -- NULL許容、認証基盤導入後にcurrentUser()で埋める
    changed_by_name TEXT,             -- 表示名スナップショット（認証基盤のcreated_by規約と統一）
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- `restore`操作自体も履歴に積む→戻しすぎの回復（実質Redo）が同じ仕組みで成立
- 削除には副作用の連鎖があるため（payments削除→invoices.payment_received/customers.carry_forward_balance更新、invoices削除→伝票をbilled→approvedに戻す等）、復元は汎用の逆適用ではなく**エンティティ別の復元ハンドラ（既存ビジネスロジックの再実行）**として実装する
- `POST /history/{id}/restore`（1エンドポイント）＋`GET /history?entity=...`（履歴一覧・削除済み一覧）
- UI: 得意先詳細に「変更履歴」ドロワー（差分表示）、入金・請求は削除直後のトースト「元に戻す」＋一覧の「削除履歴」導線。共通コンポーネント`HistoryDrawer`を3画面で使い回す
- 規模感: M（バックエンドS〜M＋フロントS〜M）

### 「Ctrl+Z連打」の解釈
文字通りのキーボードショートカットではなく、「履歴一覧から日時・差分を見て戻す」方式を推奨（どの画面で何が戻るか曖昧になる事故を防ぐため）。

### 藤田晴樹さんへの追加論点（4点、未回答）
- A. 上記「履歴一覧から戻す」の解釈でよいか
- B. 得意先の繰越残高（`carry_forward_balance`）は履歴復元の対象外とする（入金・請求から自動計算されるため）でよいか
- C. 請求書削除後に同じ伝票で新しい請求書を作り直していた場合、古い請求書の復元は拒否（二重請求防止）でよいか
- D. 入金復元時に紐づく請求書が既に消えていた場合、復元を拒否して「先に請求書を復元してください」と案内する方式でよいか

## 参照
主要参照ファイル: `api/schema.sql` / `api/routes/vouchers.php`（明細=物理削除・伝票=void） / `api/routes/customers.php`（論理削除） / `api/routes/project_delete_helpers.php`（R-0095完全削除） / `api/routes/payments.php`・`invoices.php`（物理削除） / `frontend/src/components/voucher/LineItemRow.tsx`（blur即時保存）
