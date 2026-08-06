# R-0098: データ操作のUndo/Redo（元に戻す） — customers/payments/invoices限定

Fable設計提案（`docs/wiki/knowledge/undo_redo_proposal_20260806.md`）とCodex独立レビューを経た最終仕様。

## 背景
R-0080フィードバックとは別に、藤田晴樹さんより「重大で慎重に進めるべき要望」として提示。R-0096（戻るナビゲーション）とは独立した、データ操作の取り消し機能。

対象を`customers`（更新のみ）・`payments`（削除）・`invoices`（削除）の3エンティティに限定する。伝票明細（voucher_lines）は今回スコープ外（実際の困りごとが得意先の誤上書き・入金/請求の誤削除だったため）。

## 前提条件（実装順序の依存関係）
**R-0100（`invoices.php`のDELETEが`customers.carry_forward_balance`を戻さない既存バグの修正）を、本仕様の実装より先にマージすること。** invoices復元は「正しく繰越残高を巻き戻すDELETE」とペアで成立する設計であるため。

## データ設計

```sql
CREATE TABLE record_history (
    id              INTEGER PRIMARY KEY,
    entity          TEXT NOT NULL,      -- 'customers' | 'payments' | 'invoices'
    entity_id       INTEGER NOT NULL,
    action          TEXT NOT NULL,      -- 'update' | 'delete' | 'restore'
    before_json     TEXT NOT NULL,
    after_json      TEXT,               -- updateのみ。差分表示用
    clamped         INTEGER NOT NULL DEFAULT 0,  -- payments削除時にmax(0,...)クランプが発動したか
    changed_by      INTEGER,            -- NULL許容。認証基盤導入後にcurrentUser()で埋める
    changed_by_name TEXT,               -- 表示名スナップショット
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_record_history_entity ON record_history(entity, entity_id, id DESC);
```

`before_json`はエンベロープ構造（全エンティティ共通）:
```json
{
  "row": { "...テーブル行全体..." },
  "related": { "voucher_ids": [12, 15, 18] }
}
```
`related`はinvoices×deleteのみ`voucher_ids`（紐づく伝票id一覧）を持つ。customers/paymentsは空オブジェクト。**invoicesの記録は`invoice_vouchers`をDELETEする前にSELECTしてvoucher_idsを確保すること**（現行`invoices.php`の削除順に注意）。

- `restore`操作自体も履歴に積む（戻しすぎの回復＝実質Redoが同じ仕組みで成立する）
- customersの記録対象は**PUT（更新）のみ**。DELETE（`is_active=0`の論理削除）はPhase1では記録・復元とも対象外（将来拡張の余地は残す）

## 記録の差し込み箇所（3箇所）
- `api/routes/customers.php` のPUT: 更新前にSELECTしbefore保存。差分ゼロなら記録しない
- `api/routes/payments.php` のDELETE: 削除前にSELECT。`max(0, payment_received - amount)`のクランプが発動した場合（`payment_received - amount < 0`）は`clamped=1`で記録する
- `api/routes/invoices.php` のDELETE（R-0100適用後）: 削除前にSELECT、`invoice_vouchers`削除前にvoucher_idsを確保

## 復元API・ハンドラ

`POST /history/{id}/restore` ＋ `GET /history?entity=...&entity_id=...`（履歴一覧）

復元ハンドラは「POSTハンドラの呼び直し」ではなく、**採番をスキップした専用の復元関数**として実装する（副作用の再計算ロジックのみ登録時と共有する）。

| entity×action | 復元処理 | ガード |
|---|---|---|
| customers × update | before_jsonの`row`の値でUPDATE。**復元カラムはホワイトリスト化**し、`carry_forward_balance`・`access_customer_no`は除外する（前者は入金/請求の副作用でのみ変わる値、後者はAccessTategu同期が所有するキー列＋UNIQUE制約があるため） | 対象行が存在しない場合のみ404 |
| payments × delete | `nextPaymentNo()`を**呼ばずに**、before_jsonの`row`が持つ`payment_no`でINSERT。金額は「削除時点のスナップショットへの巻き戻し」ではなく**「復元時点の現在値からの再計算」**: `新payment_received = 現在のinvoices.payment_received + 復元する入金額`（`payments.php`の登録時ロジックと同じ式）。同様にcustomers.carry_forward_balanceも連動更新される | 紐づくinvoiceが既に削除されている場合は復元拒否（「先に請求書を復元してください」と案内） |
| invoices × delete | `nextInvoiceNo()`を**呼ばずに**、`row`が持つ`invoice_no`でINSERT。`related.voucher_ids`から`invoice_vouchers`を再作成し、対象伝票を`billed`に戻す。`customers.carry_forward_balance`は`row.next_carry_forward`で更新 | 同一得意先に**削除対象より後に作られた請求書が既に存在する場合は、繰越残高の更新をスキップ**（請求書自体は復元するが、繰越上書きは行わない）。紐づく伝票のいずれかが既に**別の請求書に紐づけ済み**（二重請求防止）、またはvoid化されている場合は復元自体を拒否 |

採番スキップでpayment_no/invoice_noを維持しても、`sequences.last_no`は単調増加のみで巻き戻らないため番号衝突は構造的に発生しない（Codexレビューで確認済み）。

`access_customer_no`はホワイトリスト除外により409ケースは構造的に発生しないが、防御として復元UPDATE実行時のPDO例外を捕捉し、汎用の409「復元できませんでした（データ競合）」を返す。

## 保証範囲の明記（重要）
復元の金額整合は、対象請求書/入金に対する操作が「削除とその復元」のみ、または間に挟まる操作が正常な登録・削除である場合に保証される。`clamped=1`で記録された削除（`payment_received < amount`の状態での削除）を含む履歴の復元は厳密な逆変換にならない。

## UI設計
- **customers詳細画面**: 「変更履歴」ボタン→ドロワーで履歴一覧。変わったカラムだけ差分表示、「この時点に戻す」ボタン
- **入金一覧・請求一覧**: (1) 削除直後のトースト「〇〇を削除しました［元に戻す］」（直近の事故を最短で救う） (2) 一覧画面に「削除履歴」導線→削除済み一覧＋「復元」ボタン
- 共通コンポーネント`HistoryDrawer`を3画面で使い回す。カラム名→日本語ラベルの対応表はエンティティ別に持つ
- 復元ダイアログの警告表示: (a) 対象より新しい履歴が存在する場合、(b) `clamped=1`の場合、のいずれかに該当したら「この復元より後に関連する変更があります。復元後、内容をご確認ください」と警告し、**復元完了後に対象の現在の金額（invoice_total/payment_received/next_carry_forward等）を表示**して目視確認を促す
- 「Ctrl+Z」は文字通りのキーボードショートカットではなく、**履歴一覧から日時・差分を見て戻す**方式とする（どの画面で何が戻るか曖昧になる事故を防ぐため）

## TDD必須（PHPテスト）
- 削除→復元の往復で、invoices/payments/customersの金額・繰越残高が元通りになること（R-0100適用後の状態が前提）
- 間に別の入金/請求を挟んだ状態からの復元で、正しい合計になること（スナップショット書き戻しではなく現在値からの再計算であることの検証）
- クランプ発動ケースの削除→復元で、`clamped=1`が記録され、復元時に警告フラグが立つこと
- 同一得意先に新しい請求書がある状態での古い請求書の復元で、繰越残高の更新がスキップされること
- 二重請求防止ガード（既に別の請求書に紐づいた伝票を含む請求書の復元拒否）
- payment_no/invoice_noが復元後も維持され、以降の新規採番と衝突しないこと
- customers更新の復元で、`carry_forward_balance`・`access_customer_no`が変化しないこと

## 受け入れ条件
1. customers詳細画面から変更履歴を閲覧し、任意の過去の状態に復元できる
2. payments/invoicesの削除直後、トーストから即座に復元できる。一覧画面から過去の削除も復元できる
3. 二重請求・繰越残高の不整合を防ぐガードが機能する
4. 整合性が保証できないケース（クランプ発動・間に新しい変更あり）では復元前に警告し、復元後に現在値を表示する
5. 既存のPHPテスト・vitestが壊れないこと

## 非スコープ
- 伝票明細（voucher_lines）のUndo（別途検討）
- customersの論理削除の記録・復元
- 全テーブル・全書き込み箇所を対象とするaudit_log（Phase2、必要になったら別途）
