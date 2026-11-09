# R-0252（その1）製品台帳のお気に入り・カタログ・選ぶ画面のタブ ／ R-0250 引用

晴樹さんの原文と答えは requests_log の R-0250・R-0252。比較画面（その2）は別の仕様で、デザインの手順（good-design v1.6）に沿って作る。

## 1. お気に入り（全員共通、Beaver だけ）
- `tategu_items.is_favorite INTEGER NOT NULL DEFAULT 0` を migration 044 で足す。
- `PUT /tategu-items/{id}/favorite` 本文 `{ "is_favorite": true|false }`。**台帳の `updated_at` は進めない**（Access との同期に出さないため。同期の返り値・受け口にも入れない）。
- 製品台帳の一覧（`TateguItemList.tsx`）: 各行の先頭に ☆／★ の切り替え。一覧の上に「お気に入りだけ」の切り替え。

## 2. カタログ（台帳のまとまりと順番。Beaver だけ）
晴樹さん「障子カタログを作ってそのまとまりと順番を記録できるような」。
- 表 `ledger_catalogs (id, name, sort_order, created_at, updated_at)`、`ledger_catalog_items (catalog_id, tategu_item_id, sort_order, UNIQUE(catalog_id, tategu_item_id))`。migration 044 に入れる。台帳が消えたら（archived も含め）カタログからは外れて見えない。
- API: `GET /ledger-catalogs`（各カタログと件数）、`POST /ledger-catalogs {name}`、`PUT /ledger-catalogs/{id} {name, sort_order}`、`DELETE /ledger-catalogs/{id}`、`GET /ledger-catalogs/{id}/items`（台帳を順番どおり）、`PUT /ledger-catalogs/{id}/items {tategu_item_ids: [順番どおり]}`（全件入れ替え）。どれも台帳の `updated_at` は進めない。
- 画面: 製品台帳の一覧の各行に「カタログに追加▼」（既存のカタログを選ぶ／新しいカタログを作る）。カタログの編集画面 `/tategu/catalogs`（カタログの追加・名前変更・削除、中の台帳の並べ替え ▲▼・外す）。一覧の上からその画面へ行ける。
- 名前: 画面の文字は「カタログ」。ただし製品台帳の画面には既存の「カタログから取り込み」（catalog-system 連携）があるので、ボタンの文言で区別がつくようにする（例: 「カタログに追加」「カタログを編集」はこのまとまり、「カタログから取り込み」は今のまま）。

## 3. 伝票から台帳を選ぶ画面（`components/voucher/TateguSelector.tsx`）と、伝票から開く製品台帳の「既存の台帳から引用」（R-0250）
- タブ: 「最近」「お気に入り」、カタログごとのタブ（カタログの順）、「すべて」。開いたときは「最近」。
- 並び: カタログのタブはカタログの順。それ以外は、**最近更新した順**（`updated_at` の新しい順）。「最近」は上位10件。
- 検索欄に打つと、今のタブの中を探す。「すべて」のタブでは全部の台帳から探す（使用不可の台帳は出さない）。
- 各行に ☆ の切り替えを出し、その場でお気に入りにできる。

## 4. R-0250 引用（`docs/spec/R-0250_ledger_create_from_existing.md`）
- 一覧の各行に「引用」。伝票から開く製品台帳で新しく作るときは、上の3の選ぶ画面で台帳を選んで引用する。

## 受け入れ条件（PHP テストは本物の SQLite、フロントは vitest）
- お気に入りの切り替えで `is_favorite` が変わり、`updated_at` は変わらない。同期の返り値に出ない。
- カタログの作成・名前変更・削除・中身の順番の保存ができ、台帳の `updated_at` は変わらない。
- 選ぶ画面のタブと並び（最近は updated_at の新しい順に10件、お気に入り、カタログの順、すべて）と検索。
- 引用（R-0250 の受け入れ条件）。
- 本番の DB に migration 044 を当てるときは晴樹さんに確かめる。同期の窓口は変えないので dodai-back との日合わせは要らない。
