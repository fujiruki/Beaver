# R-0175: 繰越残高をBeaverで編集する経路を削除する

- 受付: 2026-10-13 R-0167の作業中に指揮役が発見し、dodai-backへ報告（同期パターン表K8「繰越残高はAccess正本、Beaverでは編集しない」に反する経路が残っていた）
- 判断: 2026-10-14 藤田晴樹さん（dodai-back経由）「消す」。R-0167とは別番号
- 状態: 仕様確定

## 背景

繰越残高（`customers.carry_forward_balance`）はAccessが正本で、Access→Beaverの同期でだけ入る約束（K8）。ところがBeaverには「繰越残高例外修正」として、画面から繰越残高を書き換える経路が残っていた。この約束をコードで守るため、経路を削除する。

## API（api/routes/customers.php）

1. `PATCH /customers/{id}/carry-forward`は何も書かずに403を返す:
   `{"error":"carry_forward_is_access_owned"}`
2. Accessの`/customers/sync`系での繰越残高の受け取りは今のまま変えない
3. `POST /customers`の`carry_forward_balance`（作成時の初期値）と`PUT /customers/{id}`で変更できないこと（既存）も今のまま

## 画面

1. `frontend/src/pages/CarryForwardEdit.tsx`と、そのルート（`App.tsx`の`customers/:id/carry-forward`）を削除する
2. `frontend/src/api/customers.ts`の`useUpdateCarryForward`を削除する
3. 得意先詳細から繰越残高修正画面への導線（`CustomerDetail.tsx`の`carryForwardEditLink`と、それを受け取る`CustomerFormFields`側の表示・prop）を削除する。繰越残高の表示自体は残す

## 既存テストの扱い

この仕様変更で前提が無くなるテストは、新しい仕様に合わせて書き換える（削除ではなく403の確認に置き換える）:

- `api/tests/test_billing_edit_disabled.php`のcarry-forwardの2件 → 請求編集の設定にかかわらず403、繰越残高は変わらない
- `api/tests/test_r0157_customer_push_conflict.php`の受入条件10 → 403で、`carry_forward_balance`も`updated_at`も変わらない
- `frontend/src/pages/__tests__/CarryForwardEdit.smartBack.test.tsx` → 画面ごと削除するので、このファイルも削除する

## 受け入れ条件（テスト）

PHP:

1. `PATCH /customers/{id}/carry-forward`は403 `carry_forward_is_access_owned`、`carry_forward_balance`と`updated_at`は変わらない
2. `/customers/sync`系で繰越残高を受け取る既存テストが通る

vitest:

3. 得意先詳細に繰越残高修正への導線（リンク）が出ない（請求編集が有効な設定でも）
4. 既存のテストと回帰スイートが通る
