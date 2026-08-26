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

### S1: time型集計区分の導入

**2026-08-27更新（藤田晴樹さん確認）**: catalog-systemの集計区分には既にtime型が存在する。新規追加は不要で、Beaver側への同期と対応付けが本作業となる。

現行の集計区分（catalog-system、正）:

| コード | 名称 | 単位タイプ | 表示順 |
|:--|:--|:--|:--|
| MAIN | 本体 | money | 1 |
| HARDWARE | 金物 | money | 2 |
| GLASS | ガラス | money | 3 |
| FACTORY_TIME | 工場時間 | time | 4 |
| SITE_TIME | 現場時間 | time | 5 |

対応付け（藤田晴樹さん決定）: **製作時間（cost_factory_hours）＝工場時間（FACTORY_TIME）、施工時間（cost_site_hours）＝現場時間（SITE_TIME）**。

#### S1a: 同期先URLの環境別設定化（コード変更）

`api/routes/aggregation_categories.php:18` と `api/routes/catalog_proxy.php:7` のcatalog-systemベースURLが `http://localhost:8002/contents/catalog-system/api` 固定で、本番サーバーでは疎通しない。R-0118の`YOUKAN_CAPACITY_URL`と同じパターンで、`config.local.php` の定数（例: `CATALOG_API_BASE`、未定義時は現行のlocalhost:8002デフォルト）に一本化する。本番値は疎通確認の上で設定（候補: `https://door-fujita.com/contents/catalog-system/api`。catalog-system側の認証ゲートで401になる場合は対応方針を別途判断）。

#### S1b: 旧固定列→動的形式変換のコード整合（コード変更・バグ修正）

`api/routes/vouchers.php` の `fallbackCosts`/`fallbackPrices` が独自の小文字コード（`body`/`hardware`/`glass`/`factory_hours`/`site_hours`）で変換しているが、フロントは `getCostValue(cat.code)` の完全一致でセル表示するため、実マスタコード（MAIN/HARDWARE/GLASS/FACTORY_TIME/SITE_TIME）と不一致だと (1) 旧伝票の金額・時間がセルに表示されない、(2) 労務原価合計には乗る（time型は合算のため）ので「セル空欄なのに労務費あり」の混乱、(3) セルを編集すると実コードで別エントリが追加され**二重計上**になる。変換コードを実マスタコードへ修正する（名称・sort_orderもマスタに合わせる: 本体/金物/ガラス/工場時間/現場時間、1〜5）。

#### S1c: マスタ投入は migration 027 によるシードで行う（2026-08-27変更）

本番実測（2026-08-27）の結果:
- 本番 `aggregation_category_master` は **0件**（本番は旧UI=LegacyRowが表示されていた。ヘッダーと入力セルの列ずれが症状の正体）
- 本番サーバーから catalog-system API への疎通は **401**（auth-hub認証ゲート）。URL設定化（S1a）だけでは同期は通らない

このため、同期実行ではなく **migration 027 で上記5区分を `INSERT OR REPLACE` シード**する（dev・本番とも空のため安全、SQLite 3.7.17互換）。catalog-system側の認証例外（サーバー間トークン等）による同期経路の復旧は別要望としてバックログへ記録（`docs/requests.md`）。

- 本番 `voucher_lines.tax_category` 分布（2026-08-27実測): 課税 24,348 / 非課税 1,133 / taxable 3。想定外の値なし → **migration 026 の適用条件クリア**
- 本番 `voucher_line_costs` は0行（全データ固定列方式）→ S1bの変換修正がそのまま効く

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
