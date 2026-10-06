# R-0151: 明細同期（access_line_id）の抜本修正・total_amount自動再計算

## 背景

dodai-back（AccessTategu側backpc指揮役）より（2026-10-06、藤田晴樹さん承認済み、`docs/requests.md` §37）。詳細は同ファイル参照。要点:

1. Access「Beaver版採用」でBeaver発伝票を取り込む際、access-linkはヘッダの`access_voucher_id`のみ書き戻し、明細の`access_line_id`は追従しない
2. AccessのPushは常に`lines_mode:"replace"`を送り、Beaverは全DELETE→INSERTするため`voucher_line_costs`/`voucher_line_prices`がCASCADE削除され、Beaver側の明細idも振り直される。`edited_in_beaver`保護も実質無効
3. `recalcVoucher()`（明細からヘッダー合計を再計算）がAccess push受信経路（`syncVoucherUpsert`/`syncVoucherUpdate`）で一切呼ばれておらず、total_amount等が不整合になる不具合も発覚（R-0150後の追加調査）

## 調査結果（重要な設計上の発見）

`recalcVoucher()`は現在`api/routes/vouchers.php`にのみ定義されている。一方`syncVoucherUpsert`/`syncVoucherUpdate`（`api/routes/sync_helpers.php`）は**`api/routes/vouchers.php`からも`api/routes/projects.php`からも呼ばれている**（`POST /vouchers/sync`と`POST /projects/{id}/vouchers/sync`の両方）。`api/index.php`のルーティングはパスプレフィックスで1ファイルのみをrequireするため、`/projects/{id}/vouchers/sync`経由のリクエストでは`vouchers.php`は一切読み込まれない。**`recalcVoucher()`を`sync_helpers.php`に移動しないと、`projects.php`経由の同期で「Call to undefined function」の致命的エラーになる**。

`voucher_lines`には`UNIQUE INDEX idx_voucher_lines_access_line ON voucher_lines(voucher_id, access_line_id)`が既にある（migration 016）。SQLiteはUNIQUE制約でNULL同士を区別するため、`access_line_id IS NULL`の行は複数存在可能。

## 対応方針

### (0) `recalcVoucher()`を`sync_helpers.php`へ移動

`vouchers.php`から関数定義を削除し`sync_helpers.php`へ移す（`vouchers.php`は`sync_helpers.php`を`require_once`済みなので呼び出し側に変更不要）。

### (1) PATCH /vouchers/{id}/access-link に `lines` パラメータを追加

リクエストボディに任意で`lines: [{line_no, access_line_id}]`を追加可能にする。

- ヘッダー更新（`access_voucher_id`/`access_voucher_no`）と同一トランザクションで処理する
- `lines`指定時は、適用前に全行を検証し、1件でも以下に該当すれば**422**で全件ロールバック（ヘッダー更新も含め何も反映しない）:
  - `line_no`が当該伝票の`voucher_lines`に存在しない
  - リクエスト内で`line_no`が重複している
  - リクエスト内で同じ`access_line_id`が複数の`line_no`に指定されている（ユニーク索引抵触）
- 上記を通過した行ごとに、DBの現在値と比較:
  - 既に同じ`access_line_id`が設定済み → その行は冪等に成功扱い
  - 既に**別の**`access_line_id`が設定済み → **409**（ヘッダー側の既存409ロジックと同様、全件ロールバック）
  - 未設定（NULL） → 設定対象
- 実際の更新は`UPDATE voucher_lines SET access_line_id = ? WHERE id = ?`のみ。**`updated_at`・`edited_in_beaver`は変更しない**（次回pullでの誤検知を防ぐため）
- `lines`を指定しないリクエストは現行動作のまま（完全後方互換）

### (2) GET の明細レスポンスにBeaver側の明細idを追加

`GET /vouchers/sync`のレスポンス（`vouchers.php`約146行目のSELECT）に`voucher_lines.id`を追加し、キー名は**`beaver_line_id`**とする（R-0149で導入した`beaver_customer_name`/`beaver_project_name`と同じ命名規則に合わせる）。

### (3) Access→Beaverの明細replaceをaccess_line_idキーのupsertに変更

`lines_mode === 'replace'`の経路（`replaceSyncedLinesFromPayload`、Accessが常に送る経路）を以下に変更する:

1. 当該`voucher_id`の既存`voucher_lines`を`access_line_id`でインデックス化（`access_line_id IS NOT NULL`の行のみ）
2. payloadの各行について、`access_line_id`が既存行と一致すれば**UPDATE**（対象行の`id`はそのまま維持し、`voucher_line_costs`/`voucher_line_prices`の子行は一切触らない）。`line_no`・`line_type`・`item_name`・`quantity`・`price_*`・`line_total`・`tax_category`・`memo`を更新し、`edited_in_beaver = 0`・`updated_at = CURRENT_TIMESTAMP`とする（Access版が正のため、Beaver編集フラグはクリアする）
3. payloadにあってBeaver側に一致する`access_line_id`が無い行は**INSERT**（既存`insertSyncedLines`と同等）
4. Beaver側に存在してpayloadに無い行（`access_line_id`がNULLの行も含む）は**DELETE**（CASCADEで`voucher_line_costs`/`voucher_line_prices`も削除される、想定通り）
5. 既存の`edited_in_beaver`保護チェック（`hasEditedInBeaverLines`で全体をスキップする仕組み）は**この経路では外す**（Access採用＝Access版が正のため）。`syncLinesAutoMode`のもう一方の分岐（`lines_mode`未指定時の自動判定、保護ロジックあり）は変更しない（後方互換・他の呼び出し経路への影響を避けるため）
6. 処理完了後、`recalcVoucher($pdo, $voucherId)`を呼ぶ

### (4) total_amount等の既存データ一括修復スクリプト

`api/manual/`に新規スクリプト（dry-run既定・`--execute`で実行）を作成する。`r0143_purge_seed_cluster_vouchers.php`と同じパターン。

- 対象: `recalcVoucher()`で計算した値と現在のDB値が異なる`voucher_type='sales'`の全伝票（`access_voucher_id IS NOT NULL`に限定する必要はない。計算して差分がある行のみ対象にすれば安全）
- `--execute`時は対象伝票ごとに`recalcVoucher()`相当の計算を行い、`subtotal_taxable`・`subtotal_nontaxable`・`subtotal_discount`・`tax_amount`・`total_amount`を更新する。**`updated_at`は変更しない**（Access側への競合誤検知を防ぐため、`recalcVoucher()`本体とは別に`updated_at`を更新しないUPDATE文を使う）
- 対象件数、各伝票の変更前後の値（特に`total_amount`）を出力する
- Beaver_beta・本番の両方に対して実行可能にする（スクリプト自体は環境非依存、DBパスを引数で渡す）

### (5) 既存17行のaccess_line_id修復スクリプト（Beaver_beta限定）

`api/manual/`に新規スクリプト（dry-run既定・`--execute`で実行）を作成する。dodai-back提供の対応表（本仕様書末尾）をハードコードする。

- 各行について、実行前に`WHERE id=? AND voucher_id=? AND access_line_id IS NULL`で対象を特定
- item_name・line_totalが期待値と一致するか確認してから`--execute`時のみ`UPDATE voucher_lines SET access_line_id = ? WHERE id = ?`を実行（`updated_at`は変更しない）
- 不一致なら該当行の処理を中止しエラー出力（他の行には影響しない）
- 実行後、全17件の`access_line_id`が正しく設定されたか照合する
- **item_name・line_totalの期待値（Access側の値）がまだ無いため、dodai-backに確認して入手する**。それまでは現在のBeaver側の値を出力するdry-run機能のみ実装し、`--execute`は値確認後に対応する

## 対応表（access_line_id修復、Beaver_beta限定）

dodai-backより2026-10-06受領（Access BEをDAO読み取りで取得）。`item_name`は`[]`内が実値（前後の空白含む、区切り空白は全角U+3000）。照合は「Beaverのitem_nameがAccessの値で始まる」で可、`line_total`は数値として一致比較。空のitem_name同士は一致扱い。

| Access伝票 | line_no | Beaver明細id | Access明細id | item_name | line_total |
|---|---|---|---|---|---|
| 12102 | 1 | 25485 | 25760 | （空） | 0 |
| 12102 | 2 | 25486 | 25761 | （空） | 0 |
| 12102 | 3 | 25487 | 25762 | （空） | 0 |
| 12103 | 1 | 25492 | 25771 | 鍵交換 | 2400 |
| 12104 | 1 | 25493 | 25764 | 特注キーホルダー | 79800 |
| 12104 | 2 | 25494 | 25765 | 設計費・諸経費 | 28000 |
| 12104 | 3 | 25495 | 25766 | （空） | 0 |
| 12105 | 1 | 25496 | 25767 | フラッシュ戸3x6　間仕切　中抜き　レバー空錠 | 48000 |
| 12105 | 2 | 25497 | 25768 | 収納建具観音　中 | 30000 |
| 12105 | 3 | 25498 | 25769 | 収納建具観音　小 | 0 |
| 12105 | 4 | 25499 | 25770 | 木建格子戸　アクリル　Vレール | 89500 |
| 12106 | 1 | 25488 | 25772 | どあ | 10716 |
| 12106 | 2 | 25489 | 25773 | わく | 12858 |
| 12107 | 1 | 25490 | 25774 | どあ | 10716 |
| 12107 | 2 | 25491 | 25775 | わく | 12858 |
| 12108 | 1 | 25352 | 25776 | 障子張替え　中　 | 12400 |
| 12108 | 2 | 25353 | 25777 | 運搬・経費 | 11000 |

### (5) 詳細: access_line_id修復スクリプトの照合・実行仕様

- 各行`id=<Beaver明細id>`について、現在のBeaver側`item_name`・`line_total`を取得
- 照合: `line_total`は数値として一致、`item_name`はBeaver側の値がAccess側の値（上表）で始まっていれば一致とみなす（Access側の切り詰めを考慮）。両者とも空文字列/NULLなら一致
- 不一致なら当該行をスキップしエラーとして出力（他の行の処理は継続可、全体を止めない。1行の不一致が全体を止める`access-link`とは別物）
- `--execute`時のみ一致した行に`UPDATE voucher_lines SET access_line_id = ? WHERE id = ? AND voucher_id = ? AND access_line_id IS NULL`を実行。**`updated_at`は変更しない**
- 事前にBeaver_betaのDBバックアップを取得する
- 実行後、17行の`access_line_id`が正しく設定されたか照合して出力する

## TDD

`api/tests/test_sync.php`等に追加（既存のB2-2/B2-3節を参考に）:

1. `recalcVoucher`移動後も既存のvouchers.php経由の呼び出しが正常動作（回帰確認）
2. `PATCH /vouchers/{id}/access-link`に`lines`を付けて呼ぶと、該当`line_no`の`access_line_id`が設定される
3. 同じ値を再送すると冪等に200
4. 別の値で既にリンク済みの行を含むと409、ヘッダーのaccess_voucher_idも更新されない（ロールバック確認）
5. 存在しない`line_no`を含むと422、ロールバック確認
6. `lines`内で`line_no`重複・`access_line_id`重複を送ると422
7. `lines`無しのリクエストは現行動作のまま（回帰確認）
8. `GET /vouchers/sync`のレスポンスに`beaver_line_id`が含まれ、`voucher_lines.id`と一致する
9. `lines_mode=replace`で一致する`access_line_id`を送るとUPDATEされ、Beaver側の明細idが変わらないこと・`voucher_line_costs`/`voucher_line_prices`が消えないこと
10. `lines_mode=replace`でpayloadに無い既存行（`edited_in_beaver=1`含む）が削除されること
11. `lines_mode=replace`で新しい`access_line_id`の行はINSERTされること
12. `lines_mode=replace`処理後、`total_amount`等が明細から正しく再計算されていること
13. `lines_mode`未指定の既存動作（自動判定・edited_in_beaver保護）に回帰がないこと
14. total_amount一括修復スクリプト: 差分がある伝票のみ対象になり、`updated_at`が変化しないこと

## 受け入れ条件

1. `projects.php`経由の同期（`/projects/{id}/vouchers/sync`）でも`recalcVoucher`が正常に呼べる（Fatal errorが起きない）
2. access-linkで明細の`access_line_id`を設定できる（後方互換・部分適用禁止・冪等性・409/422を満たす）
3. `GET /vouchers/sync`に`beaver_line_id`が含まれる
4. Access採用の明細反映が、既存行のid・costs/prices子行を保持したままupsertされる
5. Access push後、total_amount等が明細から正しく再計算される
6. 既存テスト・回帰スイートが通る
7. total_amount一括修復スクリプトがBeaver_beta・本番両方に提供される（dry-run/--execute、updated_at不変更）
8. access_line_id修復スクリプトはdry-run・--executeとも実装し、item_name・line_totalの照合後に実行できる（Access側の期待値はdodai-backより受領済み、本仕様書に記載）
