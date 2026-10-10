# R-0166: 伝票の楽観的ロック（開きっぱなしの古い画面で黙って上書きしない）

- 受付: 2026-10-10 藤田晴樹さんの質問（dodai-back経由）
- 判断: 2026-10-10 藤田晴樹さん（dodai-back経由）「本番切替（A-X-02）の前に入れる」、指揮役の案のとおり
- 状態: 仕様確定

## 背景

藤田晴樹さんの質問（dodai-back経由）: 「Beaver の伝票画面をブラウザで開いたまま、Access で同期が走って Beaver の伝票が書き換わったとする。そのあと、開きっぱなしの画面から編集して保存したらどうなるか？」

- `PUT /vouchers/{id}`も明細の書き込みも`updated_at`を比べず、後から保存したほうが黙って勝つ
- 伝票画面のフォームは開いたときに1度だけ値を入れ、裏で伝票を取り直しても入れ替わらない
- R-0164の自動保存はヘッダー全体を送るので、1項目を直すだけでAccessから反映されたほかの項目も古い値に戻る。その後Accessのpullで「Beaverが新しい」となり、承認するとAccessも古い内容に戻るおそれがある
- 別タブ・別端末での同時編集も同じ

## API

対象（伝票画面からの書き込み）:

- `PUT /vouchers/{id}`（ヘッダー）
- `POST /vouchers/{id}/lines`（明細の追加。複製・挿入を含む）
- `PUT /vouchers/{id}/lines/{lineId}`（明細の更新。並べ替えを含む）
- `DELETE /vouchers/{id}/lines/{lineId}`（明細の削除）
- `POST /vouchers/{id}/reload-snapshots`（原価再取得）
- `DELETE /vouchers/{id}`（R-0154の取消）

規則:

1. 本文（DELETEはJSON本文またはクエリ）に省略可能な`expected_updated_at`（JST、`Y-m-d H:i:s`の厳密形式。R-0157の`jstToUtc`で検査）を受け取る。形式不正は400
2. `expected_updated_at`があり、`vouchers.updated_at > expected_updated_at`（UTCにそろえて秒単位）なら、何も書かずに409:
   `{"error":"stale_voucher","voucher":{ GET /vouchers/{id} と同じ形（時刻はJST） }}`
3. `expected_updated_at`が無ければ今と同じ（後方互換。伝票画面以外の呼び出し元のため）
4. 書き込みが成功したら、応答に伝票の最新の`updated_at`（JST）を`voucher_updated_at`として含める（ヘッダーの応答は伝票全体を返すので`updated_at`でもよい。明細の応答に追加する）
5. Access同期のAPI（`/vouchers/sync`、`/projects/{id}/vouchers/sync`、access-link、sync-state、shipped）は対象外（R-0157・R-0158で別に守られている）
6. 判定と書き込みは同じトランザクションで行う

## 伝票画面（frontend/src/pages/VoucherEdit.tsx ほか）

1. 伝票を読み込んだときの`updated_at`を持ち、上の対象への書き込みすべてに`expected_updated_at`として付ける
2. 書き込みが成功するたびに、応答の最新の`updated_at`で持ち直す（自分の保存で進んだ分を自分の競合にしない）
3. 同じ伝票への書き込み（ヘッダーの自動保存・明細の保存・追加・削除・並べ替え・原価再取得・取消）は、画面の中で1つずつ順番に送る（同じ古い`updated_at`で並行して送らない）
4. 409 `stale_voucher`を受けたら:
   - 自動保存とほかの書き込みを止める
   - 画面の上に目立つ表示を出す:「ほかで更新されています（最終更新: {応答のupdated_at}）。再読み込みすると、この画面で保存されていない入力は失われます。」と「再読み込み」ボタン
   - 入力中の値は画面に残す（消さない）。R-0164の「未保存の変更」として扱い、離れるときの警告も出す
   - 「再読み込み」でサーバーの最新の内容をフォームと明細に入れ直し、表示を消して自動保存を再開する
5. R-0154の取消ボタン、R-0164の保存状態表示との関係は、上の規則に合わせる（取消が409なら取消せずに同じ表示を出す）

## 受け入れ条件（テスト）

PHP:

1. `PUT /vouchers/{id}`で`expected_updated_at`が古い → 409 `stale_voucher`、DBは変わらない
2. `expected_updated_at`が同じ → 200、応答の`updated_at`がJSTの最新値
3. `expected_updated_at`なし → 今と同じく200
4. 明細の追加・更新・削除で`expected_updated_at`が古い → 409、明細も伝票も変わらない。同じなら200で、応答に`voucher_updated_at`が入る
5. `DELETE /vouchers/{id}`（取消）・`reload-snapshots`も、古ければ409
6. 形式不正 → 400

vitest:

7. 自分でヘッダーを2回続けて自動保存しても、2回目が409にならない（応答の`updated_at`で持ち直している）
8. ヘッダーの自動保存と明細の保存を続けて行っても409にならない（順番に送っている）
9. 409を受けると「ほかで更新されています」と「再読み込み」が表示され、以後の自動保存が送られない。入力値は残る
10. 「再読み込み」でサーバーの値がフォームに入り、表示が消え、自動保存が再開する
11. 既存のテスト（R-0154・R-0163・R-0164を含む）と回帰スイートが通る
