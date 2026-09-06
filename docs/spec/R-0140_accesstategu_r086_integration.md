# R-0140: AccessTategu R-086 連携の Beaver 側対応（連携契約）

作成日: 2026-09-06　作成: AccessTategu 側指揮役（frontPC）　実装: Beaver 側（backpc）
状態: 仕様化済み・着手可（(1)(2)(4)(5) は Beaver 単独で今すぐ進められる。(3) は AccessTategu の合図待ち）

この文書は AccessTategu（Access/VBA 業務システム）と Beaver の**連携契約**である。Access 側で確定した事実と、Beaver 側に求める変更・受入条件を、backpc の担当者が Access リポジトリを見ずに実装できる粒度で書く。原文は `docs/requests_log.md` R-0140 と、退避ブランチ `backup/local-access-sync-20260905` の `docs/requests.md` §18（R-098）。

参照資料（Access 側から写したもの、`docs/from_access/`）:
- `20260906_R-086_Beaverスキーマ対応表.md`: Beaver の全テーブル定義、Access 列との対応表、同期 API 一覧（§3）、UTC/JST の基準（§4）。**API の入出力はこの §3 が正**
- `20260906_R-086_設計_01_統合テーブル設計.md`: Access 側の `vouchers`/`voucher_lines` 設計（見積番号 +10000、数量 REAL 等）
- `20260906_R-086_設計_03_得意先ID統一と突合.md`: 得意先の Access ID 紐付け（B-01〜B-04）と突合手順

検体（`docs/spec/fixtures/accesstategu_r086/`、ベータ Access の実データから 2026-09-06 に書き出し）:
- `voucher_sales_12962.json`: R-086 後に Access で作った売上 1 件（明細 1 行）。`POST /vouchers/sync` の入力形
- `voucher_estimate_11704_discount.json`: 移行済み旧見積（数量 0 の行、数量 -1・合計 -160 の値引行を含む）
- `customer_755.json`: 得意先 upsert と access-link の入力
- `sales_categories_access.json`: Access の売上種別マスタ全行

---

## 1. Access 側で確定した事実（Beaver はこれを前提にしてよい）

| # | 事実 | 根拠 |
|---|---|---|
| A-1 | 見積と売上は Access でも `vouchers`（`voucher_type` = `estimate`/`sales`）と `voucher_lines` の 2 表に統合済み（ベータ稼働中、本番は未切替） | 設計_01、AccessTategu `f7e5267` 時点 |
| A-2 | **伝票 ID**: 移行済み旧見積は `id = 旧見積伝票№ + 10000`（例 №1704 → 11704、№2092 → 12092）。移行済み旧売上は `id = 旧売上伝票№`（例 4635 → 4635）。R-086 後に新規作成した伝票は見積・売上共通の連番で **12317 以降**（2026-09-06 時点の最大 12962） | ベータ実データ照合 |
| A-3 | Access が push で送る `access_voucher_id` と `access_voucher_no` は **`vouchers.id`** そのもの（見積・売上とも）。`source_estimate_no` は Access の `source_estimate_id`（引用元見積の `vouchers.id`）を文字列化した値。旧見積由来なら +10000 後の値になる | `Df_Beaver連携Push.bas:214,326` |
| A-4 | **数量** `voucher_lines.quantity` は Access 側で小数・負数・0 を許容する型。ベータ実データで負数 916 行（値引行は -1 固定）、0 の行あり、小数は現時点 0 行 | ベータ実データ照合、設計_01 U-16 |
| A-5 | 値引行は `line_type='discount'`、`tax_category='非課税'`、`quantity=-1`、`line_total` が負 | 検体 11704 の 5 行目 |
| A-6 | **売上種別**: Access `tbl売上種別` は 1〜4（1地元建具／2地元組子／3県外組子／4小物）。Beaver `sales_categories`（migration 014）と ID・名称とも**一致を確認済み** | 検体 `sales_categories_access.json` |
| A-7 | 得意先 ID は共通 ID ではない。Access の `得意先№`（1〜89999）を Beaver `customers.access_customer_no` に持つ。Beaver 発の得意先の `code` は 90001〜 | 設計_03、対応表 §2.1 |
| A-8 | 日付の意味: `voucher_date`＝売上日（帳簿上の計上日）、`delivery_date`＝納品日（実際の引渡日）、`billing_date`＝請求日（`Sime_Max(売上日, 締日)`、新伝票は売上日基準。旧伝票は納品日基準のまま） | AccessTategu F-08（2026-09-05） |
| A-9 | Access 側の同期は現在**停止中**。再開は AccessTategu P4。再開時に Access → Beaver へ全件再 push（`lines_mode='replace'`）する | AccessTategu 設計_02 P4 |

---

## 2. Beaver 側に求める変更と受入条件

### (1) `voucher_lines.quantity` を REAL にし、負数拒否を撤廃【Beaver 単独で着手可】

- migration 新規: `voucher_lines.quantity INTEGER NOT NULL DEFAULT 1` → `REAL NOT NULL DEFAULT 1`。SQLite は列型変更を `ALTER TABLE` 単独でできないため、`voucher_line_costs`/`voucher_line_prices` と同じテーブル再作成パターンで行う。`applied.txt` に追記
- `api/routes/sync_helpers.php` の `insertSyncedLines` 系（現行 481〜495 行付近）: `!is_numeric` の 422 は残し、`(float)$quantity < 0` の 422 を削除。`syncVoucherUpdate` 系の同種判定も削除
- フロント `LineItemRow.tsx` の数量入力に `min` があれば撤廃。既定値 `quantity: 1` は維持
- 既存テスト `api/tests/test_sync.php`「quantity 負値 → 422」と `test_lines_merge.php`「bad-quantity」は仕様変更として書き換える

受入条件:

| # | 入力 | 期待 | テスト名（`api/tests/test_sync.php`） |
|---|---|---|---|
| 1-1 | 検体 `voucher_estimate_11704_discount.json` を `POST /vouchers/sync` | 200。`voucher_lines` に 5 行、5 行目 `quantity=-1`、`line_total=-160`、`tax_category='非課税'`、`line_type='discount'`。4 行目 `quantity=0` | `1-1: 検体voucher_estimate_11704_discount.jsonをsync→200・5行・4行目quantity=0・5行目quantity=-1(値引/非課税)` |
| 1-2 | 同検体の 1 行目 `quantity` を `2.5`、`line_total` を `9000` にして送る | 200。`quantity` が `2.5` で保存され、`GET /vouchers/sync` で `2.5` が返る（整数に丸まらない） | `1-2: 1行目quantityを2.5・line_totalを9000にして送ると小数のまま保存される`（DB確認）＋ `1-2: GET /vouchers/sync の lines[].quantity も 2.5 のまま返る（整数に丸まらない）`（HTTP確認） |
| 1-3 | `quantity` を `"abc"` にして送る | 422、`field='quantity'`（`is_numeric` 判定は残す） | `1-3: quantity="abc" → 422・field=quantity（is_numeric判定は残る）` |
| 1-4 | 既存の全 PHP テスト・vitest | 緑（負数 422 を期待していたテストは書き換え後に緑） | `R-0140 (1): quantity 負値 → 200（負数拒否は撤廃、値引行として保存される）`（旧「quantity 負値 → 422」を書き換え）＋ `.claude/regression-suite.sh` 全体 |

### (2) `PATCH /customers/{id}/access-link` の新設【Beaver 単独で着手可】

`PATCH /vouchers/{id}/access-link`（`sync_helpers.php` `syncVoucherAccessLink`）と同型。現状 `api/routes/customers.php` にこの経路は無い（`carry-forward` のみ）。

- B-01: Body `{"access_customer_no":"755"}` → `UPDATE customers SET access_customer_no=:n, code=:n, updated_at=CURRENT_TIMESTAMP, last_synced_at=CURRENT_TIMESTAMP WHERE id=:id`。応答 200 `{customer_id, access_customer_no, code, last_synced_at, status:"linked"}`。同じ値の再送も 200（冪等）
- B-02: Body `{"access_customer_no":null}` → 紐付け解除。`access_customer_no=NULL`、`code` は `nextCustomerCode()`（90001〜）で仮コードに戻す。応答 200 `status:"unlinked"`
- B-03: `nextCustomerCode` の 90001〜域は変更不要（Access は 1〜89999 のみ発行）
- B-04: `PUT /customers/{id}` の更新対象から `access_customer_no` を外す（誤操作防止。紐付けは access-link だけが変える）
- 退避ブランチ `backup/local-access-sync-20260905` のコミット `a1027fe`「得意先同期エンドポイントを追加」に 7 月の別実装がある。**そのまま取り込まず**、この契約に合わせて新規実装し、参考にとどめる

受入条件（`api/tests/test_customers.php` に追加）:

| # | 入力 | 期待 | テスト名（`api/tests/test_customers.php`） |
|---|---|---|---|
| 2-1 | 検体 `customer_755.json` から `access_customer_no` を抜いて `POST /customers` で作成 → その id に `PATCH .../access-link {"access_customer_no":"755"}` | 200、`access_customer_no="755"`、`code="755"`、`last_synced_at` が非 NULL、`status="linked"` | T-24 |
| 2-2 | 2-1 をもう一度送る | 200（冪等、409 にならない） | T-25 |
| 2-3 | 別の得意先に同じ `"755"` を送る | 409、違反列名（`access_customer_no` または `code`）を含む | T-26 |
| 2-4 | 存在しない id | 404 | T-27 |
| 2-5 | 2-1 の得意先に `{"access_customer_no":null}` | 200、`access_customer_no` が NULL、`code` が 90001 以上の仮コード、`status="unlinked"` | T-28 |
| 2-6 | `PUT /customers/{id}` で `access_customer_no` を変えようとする | **無視される（値が変わらない、200を返す）に決定。** `customers.php` の PUT 更新対象フィールド配列から `access_customer_no` を除外することで実現（B-04 と同じ変更）。 | T-03（書き換え）・T-29 |

### (3) 同期再開前の基準線の記録【AccessTategu の合図待ち。用意だけ先に】

Access 側の本番切替ゲート（設計_02 G-14）で使う。Beaver 側で次を取る SQL（または管理用スクリプト）を用意し、Access 側から「今取ってほしい」と依頼があった時点の値を記録する。

| # | 項目 | 取り方 |
|---|---|---|
| G-14 | `vouchers` の `access_voucher_id IS NULL` 件数（Beaver 発で Access 未取込） | SQLite 直接 |
| G-15 | `voucher_lines.edited_in_beaver=1` の件数 | 同上 |
| G-16 | `access_voucher_id` の重複組数（旧仕様で見積番号と売上番号が別採番だった影響） | `GROUP BY access_voucher_id HAVING COUNT(*)>1` |
| G-17 | `customers.access_customer_no IS NULL` の件数 | 同上 |
| G-18 | `customers.code <> access_customer_no` の件数（両方非 NULL のもの） | 同上 |

`GET /vouchers/sync`・`GET /customers/sync` のレスポンス形（ページング、件数上限、JST 変換）を変える場合は、この契約書を更新して Access 側へ知らせること（Access 側 `Df_Beaver連携.bas` が依存）。

### (4) `sales_categories` の ID 突合【確認済み、作業なし】

検体 `sales_categories_access.json` と Beaver の seed（1〜4）は ID・名称とも一致。マッピング表は不要。Access 側で売上種別を追加した場合は Beaver にも同じ ID で追加する運用とし、その旨を `02_機能仕様.md` の該当箇所に一行追記する。

注意: Access 側 R-086 で新設の集計区分（`aggregation_categories`、`code` は `MAIN`/`HARDWARE`/`GLASS`/`FACTORY_TIME`/`SITE_TIME`）は catalog-system と同じ体系で、`sales_categories` とは別物。混同しない。

### (5) 見積番号 +10000 への追従【Beaver 単独で SQL とテストを用意。実行は両側同時】

Access の旧見積は `id = 旧№ + 10000`（A-2）になったので、Beaver に残っている旧仕様の値を一度だけ変換する。実行は AccessTategu P4 の全件再 push 直前（Beaver 停止・Access 同期停止の窓で）。Beaver 側はこの変換を管理用スクリプトまたは migration として**用意し、テストで検証しておく**。

```sql
UPDATE vouchers SET source_estimate_no = CAST(CAST(source_estimate_no AS INTEGER) + 10000 AS TEXT)
 WHERE voucher_type = 'sales' AND source_estimate_no IS NOT NULL
   AND CAST(source_estimate_no AS INTEGER) < 10000;
UPDATE vouchers SET access_voucher_id = access_voucher_id + 10000,
                    access_voucher_no = CAST(access_voucher_id + 10000 AS TEXT)
 WHERE voucher_type = 'estimate' AND access_voucher_id IS NOT NULL
   AND access_voucher_id < 10000;
```

`< 10000` の条件で二重実行を防ぐ（Access の新規伝票は 12317 以降なので旧見積番号の域 1〜9999 と重ならない）。

受入条件:

SQL 本体は `api/manual/r0140_5_estimate_no_plus10000.sql` に用意した（`api/migrations/` には置かない。自動テストのスキーマ構築 glob に巻き込まれ、他テストの `access_voucher_id < 10000` のデータを誤って変換してしまうため）。

| # | 入力 | 期待 | テスト名（`api/tests/test_r0140_estimate_no_conversion.php`） |
|---|---|---|---|
| 5-1 | 見積 `access_voucher_id=1704`、売上 `source_estimate_no="1704"` を持つテスト DB で変換を実行 | 見積 `access_voucher_id=11704`、`access_voucher_no="11704"`、売上 `source_estimate_no="11704"` | `5-1: 見積 access_voucher_id=1704・売上 source_estimate_no="1704" を持つテストDBで変換を実行` |
| 5-2 | 5-1 をもう一度実行 | 変化なし（冪等） | `5-2: もう一度実行しても変化なし（冪等）` |
| 5-3 | 変換前後で `source_estimate_no` が指す見積が実在する件数 | 減らない（`vouchers.php` の `WHERE source_estimate_no = ? AND voucher_type = 'sales'` 相当で孤児が増えない） | `5-3: 変換前後で source_estimate_no が指す見積が実在する件数は減らない` |
| 5-4 | 変換後に検体 `voucher_sales_12962.json` を `POST /vouchers/sync` | 200。`access_voucher_id=12962`、`billing_date='2026-12-25'`、`delivery_date='2026-11-25'` がそのまま保存される（Beaver 側で日付を再計算しない） | `5-4: 変換後に検体voucher_sales_12962.jsonをsyncすると200・値をそのまま保存` |

---

## 3. 完了報告の規律

- 変更ファイル一覧、追加・変更したテスト名、実行コマンドと生ログの所在を報告する。「テスト通過」の主張だけは受け付けない
- 回帰スイート（vitest ＋ PHP テスト）が青であること
- この契約書の受入条件表に、対応するテスト名を書き足す（表の右に列を追加してよい）
- 未確定事項（2-6 の選択など）は決めた内容をこの文書に追記する

## 4. 依存関係

| 項目 | 先行条件 | 担当 |
|---|---|---|
| (1)(2)(4)(5) の実装とテスト | なし。今すぐ | Beaver（backpc） |
| R-0141 Beaver ベータ環境 | なし。今すぐ | Beaver（backpc） |
| (3) の値の記録 | Access 側の合図（本番切替ゲート時） | Beaver、依頼は Access 側 |
| (5) の本番実行 | Access P4 全件再 push の直前、両側同時 | 両側で日程調整 |
| Access ベータの同期先を Beaver ベータへ向ける（AccessTategu R-108） | R-0141 完了 | Access（frontPC） |
