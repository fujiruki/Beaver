# R-0163: 伝票画面の時刻を日本時間で表示し、最終更新日時とAccessの伝票番号を出す

- 受付: 2026-10-10 dodai-back（AccessTategu側backpc指揮役）経由、藤田晴樹さんの要望と不具合報告
- 状態: 仕様確定（表示の不具合修正と、表示項目の追加）

## 背景

藤田晴樹さんの言葉（dodai-back経由）: 伝票画面の「最終同期」を見て「時間ちがうやん」。

- 伝票編集画面（`frontend/src/pages/VoucherEdit.tsx`）の左上の「最終同期」は、`GET /vouchers/{id}`の`last_synced_at`をそのまま表示している
- `GET /vouchers/{id}`は時刻列をDBのUTCのまま返している（`GET /vouchers/sync`はJSTに変換済み）。そのためBeaver_betaの伝票5810で「最終同期: 2026-10-10 07:09:12」と出た（実際はJSTの16:09:12）。同期の判定には影響しない

要望（dodai-back経由）:

- (a) 伝票画面に最終更新日時（`updated_at`、JST）を表示してほしい
- (b) 伝票画面にAccessの伝票番号を表示してほしい（Access側はR-0156でBeaverの伝票番号を表示し、ダブルクリックでBeaverの伝票を開けるようにした。その逆向き）

## 変更

1. `GET /vouchers/{id}`の応答で、`created_at`・`updated_at`・`last_synced_at`をJST（`Y-m-d H:i:s`）で返す。変換は既存の`utcToJst`を使う。`PUT`の応答など、伝票1件を返すほかの応答も同じ形にそろえる（そろえる対象は実装時に洗い出し、報告する）
2. 伝票編集画面の左上（「Access由来／Beaver作成」の表示の並び）に、次の3つを表示する
   - `Access№ {access_voucher_id}`: `access_voucher_id`があるときだけ
   - `最終同期: {last_synced_at}`: 今と同じ条件（JSTで表示される）
   - `最終更新: {updated_at}`: 既存の伝票のとき
3. 新規作成中の伝票では何も追加表示しない

## 受け入れ条件（テスト）

1. `GET /vouchers/{id}`の`updated_at`・`last_synced_at`・`created_at`が、DBのUTC値に9時間足したJSTで返る（PHPテスト）
2. `last_synced_at`がNULLの伝票ではNULLのまま返る
3. 伝票編集画面で、`access_voucher_id`がある伝票に「Access№ 12102」のように表示され、無い伝票には表示されない（vitest）
4. 伝票編集画面に「最終更新: 」とJSTの`updated_at`が表示される（vitest）
5. 既存のテストと回帰スイートが通る
