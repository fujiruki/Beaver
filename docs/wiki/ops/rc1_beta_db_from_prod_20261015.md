# rc1リハーサル: Beaver_betaのDBを本番Beaverの写しに入れ替え（2026-10-15）

- 依頼: 藤田晴樹さん（会話内）「rc1 リハーサルのため、Beaver_beta の DB を本番 Beaver の現在のデータの写しに入れ替えて」
- コード: Beaver_betaは入れ替え前と同じ版のまま（2026-10-15 13:08デプロイ、R-0178まで）
- 本番Beaver: 書き込みなし（下の「本番への影響」参照）

## 手順と所要時間

サーバー: `c6924945@www1045.conoha.ne.jp:8022`（鍵は`upload.ps1`と同じ）。sqlite3 CLIは使えないため、PHP PDOで行う。スクリプトは`api/manual/rc1_copy_prod_db_to_beta.php`（ホームに置いて`php rc1_copy_prod_db_to_beta.php <YYYYMMDD_HHMM>`で実行）。

| # | 内容 | 時刻 | 所要 |
|:--|:--|:--|:--|
| 1 | Beaver_betaの現DBを読み取り専用で開き、`VACUUM INTO`で退避: `Beaver_beta/api/backups/database_beta_20261015_1930_pre_rc1_prod_copy.sqlite`（7,401,472 bytes） | 19:30 | 0.06秒 |
| 2 | 本番DBを読み取り専用（`PDO::SQLITE_OPEN_READONLY`）で開き、`VACUUM INTO`で写しを作る: `Beaver_beta/api/database_rc1_work.sqlite`（7,168,000 bytes）。前後で本番DBのmd5・サイズ・更新時刻が同じことを確認 | 19:30 | 0.05秒 |
| 3 | 退避したbetaのDBと本番の写しのスキーマ（全テーブルの列定義・索引・トリガー）を比べる → **差分なし。migrationは不要** | 19:30 | 1秒未満 |
| 4 | 設定データを比べる: `company_settings`は同じ（`default_labor_rate`=5000、`default_profit_rate`=0.3）。`sales_categories`4件・`aggregation_category_master`5件・`project_statuses`8件・`tax_rates`4件も件数が同じ | 19:30 | — |
| 5 | `chmod 666`のうえ`mv database_rc1_work.sqlite database.sqlite`で入れ替え | 19:31:01 | 一瞬 |
| 6 | 確認: `PRAGMA integrity_check`=ok、journal_mode=wal、件数が本番と同じ、betaのトップ画面は200 | 19:31 | — |

全体の作業時間は約1分（手入力を除けば数秒）。本番切替のときにDBの写しを作る場合も、同じやり方なら止めている時間は数秒で済む。

## 入れ替え後の件数（＝本番の件数）

| 表 | 入れ替え後 | 入れ替え前のbeta |
|:--|--:|--:|
| customers | 823 | 829 |
| projects | 61 | 62 |
| vouchers | 5,802（見積1,895・売上3,907） | 5,897 |
| voucher_lines | 25,496 | 25,777 |
| voucher_line_prices | 19 | 24 |
| voucher_line_costs | 40 | 47 |
| record_history | 4 | 19 |
| invoices / payments | 0 / 0 | 0 / 0 |

## 本番への影響

- 本番の`database.sqlite`本体は変わっていない（md5・サイズ・更新時刻2026-10-05 15:00のまま）
- 読み取り専用で開いたとき、本番のフォルダにSQLiteの補助ファイル`database.sqlite-wal`（0 bytes）と`database.sqlite-shm`（32 KB）ができた（19:30:19）。WALモードのDBを開くと必ずできるファイルで、本番のアプリがDBを開くたびにも作られる。データは入っていない。消さずにそのままにしてある

## 元に戻すとき

`Beaver_beta/api/backups/database_beta_20261015_1930_pre_rc1_prod_copy.sqlite`を`database.sqlite`へ`cp`して`chmod 666`する（`-wal`が0 bytesであることを確認してから）。

# rc1 R7: R-0140(3) 基準線記録と R-0140(5) 見積 +10000 変換（2026-10-15 22:12、Beaver_beta＝本番写し）

dodai-backの依頼（晴樹さん了承済み）。本番当日と同じ手順で、`api/manual/rc1_r7_baseline_and_plus10000.php`をサーバーのホームに置き、`php rc1_r7.php <YYYYMMDD_HHMM> Beaver_beta`で実行した（今回は晴樹さんが`!`で実行）。本番当日は第2引数を`Beaver`にする。ログ: `Beaver_beta/api/backups/rc1_r7_log_20261015_2212.json`

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 0 | 退避（VACUUM INTO） | 22:12:34 | 0.054秒 | `backups/database_beaver_beta_20261015_2212_pre_rc1_r7.sqlite` |
| 1 | 基準線（`manual/r0143_baseline_snapshot.php`） | 22:12:35 | 0.062秒 | `backups/rc1_r7_baseline_20261015_2212.json` |
| 2 | 変換前の確認 | 22:12:35 | — | 下表 |
| 3 | `manual/r0140_5_estimate_no_plus10000.sql`（1トランザクション、2文） | 22:12:35 | 0.001秒 | 売上の`source_estimate_no` 6行、見積の`access_voucher_id` 13行を変換 |
| 4 | 変換後の確認 | 22:12:35 | — | 下表、integrity ok |

基準線: G-14-1（access_voucher_idなし）5,778／G-14-2 見積13・売上11／G-14-3 最大4,618／G-14-4（edited_in_beaver=1の明細）13行、G-14-5 6伝票（5805 E02041・5806 E02044・5807 S04600・5808 E02045・5809 E02046・5810 E02047、すべてaccess_voucher_idなし）／G-14-6 7／G-19 823／G-20 800／G-21 22／G-22 同名19組

| 確認 | 変換前 | 変換後 |
|:--|--:|--:|
| 見積で access_voucher_id ≤ 10000 | 13 | 0 |
| access_voucher_id < 10000（種別） | 見積13・売上11 | 売上11 |
| access_voucher_id ≥ 10000（種別） | なし | 見積13 |
| access_voucher_id の重複 | 0 | 0 |
| +10000後に既存番号と衝突 | 0 | — |
| 売上の数値の source_estimate_no < 10000 | 6 | 0 |
| 売上の source_estimate_no が指す見積が無い | 0 | 0 |
| 得意先／案件／伝票／明細 | 823／61／5,802／25,496 | 同じ |

# rc1 R7追加: 手順4.5 シード伝票の削除（2026-10-15 22:16〜22:17、Beaver_beta＝本番写し）

R7の基準線で、access_voucher_idを持たない伝票が5,778件あると判明（dodai-backから「全件再pushで二重になる恐れ」）。うち5,772件は2026-03-17 20:04台の単発シード（見積M00001〜M02027、売上U00011〜U04588、Access未同期）で、A-X-01でも手順4.5で消していたもの。Access側の手順書から抜けていた（rc1の発見事項）。dodai-backの依頼（晴樹さん了承済み）で実行。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 0 | 退避（VACUUM INTO） | 22:16 | 1秒未満 | `backups/database_beaver_beta_20261015_2216_pre_rc1_seed_purge.sqlite` |
| 1 | dry-run: `php manual/r0143_purge_seed_cluster_vouchers.php database.sqlite "2026-03-17 20:04"` | 22:16:59 | 1秒未満 | 対象5,772、請求済み0・請求書紐付き0・edited_in_beaver 0 |
| 2 | 実行: 同じコマンドに`--execute` | 22:17:18.86〜22:17:19.09 | 0.23秒 | 5,772件削除 |
| 3 | 確認 | 22:17 | — | 伝票30（access_voucher_idあり24・なし6）、明細193、孤児の明細・内訳0、得意先823、案件61、integrity ok |

重複得意先の統合（A-B-10）は、Access側の得意先突合（ApplyRun）の後にdodai-backの合図で行う。
