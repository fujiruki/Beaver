# R-0150: 伝票見出しの消費税区分(consumption_tax_type)初期値バグ修正

## 背景

dodai-back（AccessTategu側backpc指揮役）より（2026-10-06、藤田晴樹さん了承済み、`docs/requests.md` §36）:

> frontend/src/pages/VoucherEdit.tsx:103 で、伝票見出しの consumption_tax_type の初期値が '課税' になっている。'課税' は明細の tax_category 用の値で、見出しの値は '外税/伝票計' / '外税/請求計' 等。DBの既定値（api/schema.sql:154）は '外税/伝票計'。Beaverで新規作成した伝票が '課税' になり、AccessのBeaver版採用でそのまま混入した。

## 調査結果

- `frontend/src/pages/VoucherEdit.tsx:103`（`defaultValues`）で`consumption_tax_type: '課税'`になっている。これは新規伝票作成フォームが常にこの値を含めて送信するため、バックエンド側の正しいデフォルト（`api/schema.sql:154`の`DEFAULT '外税/伝票計'`、`api/routes/vouchers.php:874`の`?? '外税/伝票計'`フォールバック）を上書きしてしまう
- 伝票見出しの`consumption_tax_type`に許容される値は4種類: `外税/伝票計`・`外税/請求計`・`内税/伝票計`・`内税/請求計`（`tools/migrate/02_import_to_beaver.php`の`mapTaxType()`に列挙あり。明細行の`tax_category`列が使う`課税`/`非課税`とは別の値域）
- バックエンドには値域チェックが無く、`POST /vouchers`・`PUT /vouchers/{id}`・`sync_helpers.php`の`syncVoucherUpsert`/`syncVoucherUpdate`のいずれも任意の文字列をそのまま保存する
- 本番Beaver・Beaver_betaとも同じ6件（id 5805〜5810、`E02041`,`E02044`〜`E02047`,`S04600`）が`consumption_tax_type='課税'`。いずれも`status='draft'`の最近のテストデータで、Beaver_betaでは`access_voucher_id`12102〜12107としてAccess側に同期済み（Access側は既に`外税/伝票計`へ修正済みとの報告あり）

## 対応方針

### (1) フロントエンド初期値修正
`VoucherEdit.tsx`の`defaultValues.consumption_tax_type`を`'課税'`から`'外税/伝票計'`に修正する。

### (2) バックエンドの値域バリデーション
`api/routes/sync_helpers.php`に許容値の定数・チェック関数を追加し、以下の4箇所で`consumption_tax_type`が明示的に指定された場合に許容値（`外税/伝票計`・`外税/請求計`・`内税/伝票計`・`内税/請求計`）以外なら400エラーを返す:
- `api/routes/vouchers.php`の`POST /vouchers`（新規伝票作成）
- `api/routes/vouchers.php`の`PUT /vouchers/{id}`（ヘッダー更新）
- `api/routes/sync_helpers.php`の`syncVoucherUpsert`
- `api/routes/sync_helpers.php`の`syncVoucherUpdate`

値が未指定（キー自体が無い）場合は従来通りデフォルト補完・既存値保持の挙動を維持し、バリデーションは発動しない。

### (3) 既存データ修正手順（読み取り専用スクリプト＋実行は藤田晴樹さんが担当）
`api/manual/`に、`consumption_tax_type='課税'`の件数・該当行を確認するdry-runモードと、`--execute`で修正する一括UPDATEスクリプトを用意する。**`updated_at`は更新しない**（更新するとAccess側で再度「競合」として検出されてしまうため、`consumption_tax_type`列のみをUPDATEする）。このスクリプトの`--execute`実行は、サーバー書き込みの運用方針に従い藤田晴樹さん本人が行う。

### (4) 本番・Beaver_betaの件数確認
読み取り調査実施済み（このドキュメント作成時点）。本番・Beaver_betaとも6件、同一のid（5805〜5810）。対応状況はdocs/requests_log.mdに記録する。

## TDD

- フロントエンド: `VoucherEdit`の新規作成時のデフォルト値テストで`consumption_tax_type`が`'外税/伝票計'`であることを確認するテストを追加
- バックエンド: `api/tests/test_sync.php`等に以下を追加
  1. `POST /vouchers`で不正な`consumption_tax_type`（例: `'課税'`）を送ると400
  2. `PUT /vouchers/{id}`で不正な値を送ると400
  3. `syncVoucherUpsert`（過去伝票モード・案件付きモードとも）で不正な値を送ると400
  4. `syncVoucherUpdate`で不正な値を送ると400
  5. 許容値4種類はいずれも正常に保存できる（回帰確認）
  6. 値を送らない場合は従来通りデフォルト補完・既存値保持が働く（回帰確認）

## 受け入れ条件

1. 新規伝票作成時、`consumption_tax_type`の初期値が`'外税/伝票計'`になる
2. バックエンドが許容値以外の`consumption_tax_type`を拒否する（4エンドポイント）
3. 値未指定時の既存の挙動（デフォルト補完・既存値保持）に回帰がない
4. 既存テスト・回帰スイートが通る
5. 既存データ修正用のdry-run/--executeスクリプトを用意する（実行はしない）
