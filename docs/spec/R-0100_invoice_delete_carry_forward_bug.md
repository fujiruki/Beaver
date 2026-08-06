# R-0100: 請求書削除が得意先の繰越残高を戻さないバグ修正

## 背景
R-0098（Undo/Redo）設計のCodex独立レビューで発覚。`api/routes/invoices.php`のPOST（116〜119行目）は請求書作成時に`next_carry_forward`を受け取り`customers.carry_forward_balance`を更新するが、DELETE（127〜147行目）には対応する巻き戻し処理が無い。請求書を作成→削除しただけで、得意先の繰越残高が古いまま残り続ける。

## 修正方針
`DELETE /invoices/{id}`処理に、繰越残高の巻き戻しを追加する。

- 削除対象の請求書自身が持つ`carry_forward`列（この請求書が作られる**前**の繰越残高）を使う
- ただし、**同一得意先に、削除対象より後に作られた請求書が存在する場合は、繰越残高を触らない**（新しい請求書のほうがより正しい最新残高を持っているため、古い請求書の削除で上書きしてはいけない）。判定は`invoices`テーブルの`customer_id`が同じで`id`が削除対象より大きい行の有無で行う
- 判定して問題なければ: `UPDATE customers SET carry_forward_balance = (削除対象invoiceのcarry_forward列の値) WHERE id = (customer_id)`

## TDD必須
`api/tests/test_invoices.php`（無ければ新規作成、既存のテストファイル命名規則に合わせる）に以下を追加:
1. 請求書を1件作成→削除すると、customers.carry_forward_balanceが作成前の値に戻ること
2. 同一得意先に請求書A→請求書Bの順で作成した後、請求書A（古い方）を削除しても、customers.carry_forward_balanceはBが設定した値のまま変わらないこと（新しい請求書を壊さない）
3. 既存のテストが壊れないこと

## 検証
- 新規/既存のテストファイルで全PASSを確認
- `bash .claude/regression-suite.sh` で exit 0を確認（回帰スイートへの新規テストファイル追加も検討）

## 制約
- 対象は`api/routes/invoices.php`と対応するテストファイルのみ
- git commit / push / デプロイは行わないこと（指揮役が別途行う）
