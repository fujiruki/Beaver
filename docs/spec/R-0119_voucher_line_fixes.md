# R-0119: 伝票明細の時間入力・保存不具合の一括修正

## 背景（要望原文）

藤田晴樹さんの発言（2026-08-26、ローマ字入力のまま）:

> beaver no mitumori denpyouwotukurugamen de roumutanka(jikannataritanka)wonyukusurutokorohaarunoni jikannsuuwoirerutokoroganai. seizougenka no teigitoka siyousyoniarutoomooretoomou soreto hensyuuhozonsitemo koumokumeiga hozonsareteinakattarihuguaigaaru. rebyu-site. codexde

日本語転記: 見積伝票を作る画面で労務単価はあるのに時間数を入れるところがない。編集保存しても項目名が保存されない不具合がある。

Codexレビュー＋指揮役の裏取りで、症状の原因と関連バグを特定（詳細は `docs/requests_log.md` R-0119 行）。藤田晴樹さんの仕様判断（2026-08-26）:

1. 時間数は「time型の集計区分を本番マスタに追加する」方向
2. LegacyRow（旧固定列UI）は廃止する
3. 課税/非課税フラグの内部値は英語コード（`taxable`/`non_taxable`）に統一する

## スコープ

### S1: time型集計区分の導入（コード変更なし・データ作業＋検証）

- catalog-system の集計区分設定画面（`AggregationCategorySettingsPage`、measureType=time対応済み）でtime型区分（例: 製作時間・施工時間）を追加し、Beaver側で `POST /aggregation-categories/sync` を実行する
- 動的UI側は `measure_type='time'` の区分があれば時間入力列を描画する実装済み（`LineItemRow.tsx:287`）のため、Beaverのコード変更は不要
- **検証項目**: 本番の同期先URLが `http://localhost:8002/...` 固定（`api/routes/aggregation_categories.php:18`）で本番サーバー上で疎通するか確認。不通なら環境別URL対応を本Rの追加タスクとする
- **検証項目**: 本番 `aggregation_category_master` の現状（件数・measure_type分布）を確認する

### S2: LegacyRow廃止

- `categories.length === 0` のとき、明細行編集UI（LegacyRow）を出す代わりに「集計区分が未同期のため明細を編集できません。設定画面から同期してください」等の警告を表示する（保存されない編集UIを見せない）
- `LineItemRow.tsx` の `LegacyRow` と関連分岐（`VoucherEdit.tsx` のヘッダー分岐含む）を削除する
- 明細の閲覧（読み取り表示）は可能な範囲で維持してよいが、必須ではない（警告のみでも可）

### S3: 新規伝票作成時に明細も保存する

- 現状: 新規作成の保存はヘッダーのみPOSTし、画面上で追加した明細行は破棄される（`VoucherEdit.tsx:243-245`、`saveLineToDb` は `isNew` で早期return）
- 修正: �ッダー作成成功後、フォーム上の各明細行を `POST /vouchers/{id}/lines` で順次保存してから遷移する。1行でも失敗したらエラーを表示し、成功済み分と併せて状態が分かるようにする

### S4: 売上種別（sales_category_id）の保存

- `api/routes/vouchers.php` の新規INSERT（791行付近）とヘッダー更新許可リスト（882行付近）に `sales_category_id` を追加する

### S5: 課税/非課税フラグの英語コード統一

DB・アプリ内部の正準値を `taxable` / `non_taxable` に統一する。Access同期の外部契約は日本語のまま維持し、境界で相互変換する。

- `recalcVoucher` の比較を `'taxable'` 基準に変更（`vouchers.php:204`）
- 明細POSTのデフォルト `'課税'` → `'taxable'`（`vouchers.php:766`）
- Access同期の受信（`sync_helpers.php` insert/replace/merge全経路）: 日本語ホワイトリスト検証（R-034(c)）は維持し、保存時に `課税→taxable` / `非課税→non_taxable` へ変換
- Access向け応答（`GET /vouchers/sync` 等、tax_categoryを返す全箇所）: `taxable→課税` へ逆変換して返す（AccessTategu VBA側の改修なしで互換維持。`Df_Beaver連携.bas` の読み方を読み取り専用で確認すること）
- マイグレーション: 既存 `voucher_lines.tax_category` の `課税→taxable` / `非課税→non_taxable` を単純UPDATEで変換（SQLite 3.7.17互換構文のみ）。**適用前に本番の実データ分布（`SELECT tax_category, COUNT(*)`）を確認し、想定外の値があれば報告して止まる**
- 既存PHPテスト（test_sync等）は外部契約（日本語での送受信）を検証しているため、契約は変えずにDB保存値のアサーションのみ英語へ更新する

### S6: 動的原価/売価の空配列クリア

- 現状: フロントは値0の要素を配列から除外するが、APIは `costs`/`prices` が空配列だと保存処理をスキップし、DBの既存サブテーブル行が残る（`vouchers.php:865` の `!empty`）
- 修正: PUT明細で `costs`（`prices` も同様）の**キーが存在**していれば、空配列でも既存行を削除して置換する（キー自体が無い場合は従来どおり触らない）

## 受け入れ条件

1. time型区分を同期した状態の伝票画面に時間入力列が表示され、時間×労務単価×数量が労務原価に反映される（S1、実機確認）
2. 集計区分0件の環境で伝票を開くと、保存されない編集UIではなく警告が表示される（S2、vitest）
3. 新規伝票で明細を入力して保存すると、再表示後も明細（品名含む）が残っている（S3、vitest）
4. 売上種別を設定して保存→再取得で `sales_category_id` が保持される（S4、PHPテスト）
5. Beaver画面で作成した課税明細の税額が正しく計算される（S5、PHPテスト: `taxable` 行がrecalcで課税扱い）
6. Access同期の送受信契約は日本語のまま互換維持（S5、test_sync既存ケース全通過＋DB保存値が英語であるアサーション追加）
7. 明細の原価/売価を全て0にして保存すると、DBのサブテーブル行も消える（S6、PHPテスト）
8. 回帰スイート（vitest + PHPテスト）全通過（🔵青）

## 実装メモ

- TDD必須。S3〜S6は先に失敗テストを書く
- マイグレーション適用は本番データ分布確認後（S5の止まり条件を厳守）
