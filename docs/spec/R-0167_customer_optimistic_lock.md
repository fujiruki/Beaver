# R-0167: 得意先の楽観的ロック（開きっぱなしの古い画面で黙って上書きしない）

- 受付: 2026-10-10 dodai-backの同期パターン表（K9）の確認で判明
- 判断: 2026-10-13 藤田晴樹さん（dodai-back経由）「本番切替（A-X-02）の前に入れる」。R-0166と同じ仕組み
- 状態: 仕様確定

## 背景

`PUT /customers/{id}`は`updated_at`を比べない。得意先画面を開いたまま、AccessのpushやほかのタブでBeaverの得意先が更新されると、開きっぱなしの画面で保存したときに古い内容で黙って上書きする。その後Accessのpullで「Beaverが新しい」となり、Accessも古い内容に戻るおそれがある（伝票のR-0166と同じ問題）。

## API（api/routes/customers.php）

対象（画面からの書き込み）:

- `PUT /customers/{id}`（得意先詳細画面の保存。`is_active`の変更を含む）
- `DELETE /customers/{id}`（得意先一覧の削除＝論理削除）

規則:

1. 本文（DELETEはJSON本文またはクエリ）に省略可能な`expected_updated_at`（JST、`Y-m-d H:i:s`の厳密形式。R-0157の`jstToUtc`で検査）を受け取る。形式不正は400
2. `expected_updated_at`があり、`customers.updated_at > expected_updated_at`（UTCにそろえて秒単位）なら、何も書かずに409:
   `{"error":"stale_customer","customer":{ GET /customers/{id} と同じ形（時刻はJST） }}`
3. `expected_updated_at`が無ければ今と同じ（後方互換）
4. `PUT`の成功応答は`GET /customers/{id}`と同じ形にそろえ、`updated_at`・`last_synced_at`をJSTで返す（今はUTCのまま返している）
5. 判定と書き込みは同じトランザクションで行う。UNIQUE違反の409（既存）はそのまま
6. 対象外: Access同期のAPI（`/customers/sync`系、R-0157の`base_synced_at`で別に守られている）、`PATCH /customers/{id}/access-link`、`PATCH /customers/{id}/carry-forward`（繰越残高はAccess正本でBeaverでは編集しない約束（K8）。経路の扱いはdodai-backへ報告して別途決める）

## 得意先詳細画面（frontend/src/pages/CustomerDetail.tsx、frontend/src/api/customers.ts）

1. フォームに値を入れるのは開いたとき1回だけにする（裏で取り直しても入力中のフォームを入れ替えない）。そのときの`updated_at`を持ち、保存時に`expected_updated_at`として付ける
2. 409 `stale_customer`を受けたら:
   - 画面を離れず、入力中の値は残す
   - 目立つ表示を出す:「ほかで更新されています（最終更新: {応答のupdated_at}）。再読み込みすると、この画面で保存されていない入力は失われます。」と「再読み込み」ボタン
   - 「再読み込み」でサーバーの最新の内容をフォームに入れ直し、持っている`updated_at`も入れ替え、表示を消す
3. 新規作成（POST）は対象外

## 得意先一覧（frontend/src/pages/CustomerList.tsx）

1. 削除時に一覧の行の`updated_at`を`expected_updated_at`として送る
2. 409 `stale_customer`なら削除せず、「ほかで更新されています。一覧を読み込み直しました。もう一度確認してから削除してください。」を出し、一覧を取り直す

## 受け入れ条件（テスト）

PHP（api/tests/test_r0167_customer_optimistic_lock.php）:

1. `PUT`で`expected_updated_at`が古い → 409 `stale_customer`、応答に最新の得意先（JST）、DBは変わらない
2. `expected_updated_at`が同じ → 200、応答の`updated_at`がJSTの最新値
3. `expected_updated_at`なし → 今と同じく200
4. `DELETE`で古い → 409、`is_active`は変わらない。同じなら削除される
5. 形式不正 → 400

vitest:

6. 得意先詳細の保存で`expected_updated_at`が送られる
7. 409を受けると「ほかで更新されています」と「再読み込み」が表示され、画面を離れず入力値が残る
8. 「再読み込み」でサーバーの値がフォームに入り、表示が消え、次の保存は新しい`updated_at`で送られる
9. 一覧の削除で`expected_updated_at`が送られ、409なら案内が出る
10. 既存のテストと回帰スイートが通る
