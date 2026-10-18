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

# rc1 R7追加: A-B-10 重複得意先の統合（2026-10-15 22:21、Beaver_beta＝本番写し）

Access側の得意先突合ApplyRun（22:18〜22:20、beaver_link 819・beaver_insert 6・beaver_upsert 3、失敗0）の後、dodai-backの合図で実行。組はA-X-01と同じ4組で、今回のデータでも同じ組になることを確かめた（同名・統合先だけがaccess_customer_noを持つ組が3つ、残る1は無効化済みで参照0）。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 0 | 退避（VACUUM INTO） | 22:21 | 1秒未満 | `backups/database_beaver_beta_20261015_2221_pre_rc1_ab10.sqlite` |
| 1 | dry-run: `php manual/r0143_merge_duplicate_customers.php database.sqlite '[{"keep_id":50,"dup_id":1},{"keep_id":652,"dup_id":824},{"keep_id":754,"dup_id":796},{"keep_id":781,"dup_id":814}]' --dry-run` | 22:21:27 | 0.05秒 | 付け替え予定: 案件3件（824・796・814から各1）、伝票・請求・入金0 |
| 2 | 実行（`--dry-run`なし） | 22:21:49.09〜49.13 | 0.05秒 | 4組を統合、案件3件を付け替え、統合元4件を論理削除 |
| 3 | 確認 | 22:21 | — | 得意先829（有効815）、access_customer_noあり825、有効でaccess_customer_noなし0、統合元を指す案件・伝票0、案件の得意先の孤児0、integrity ok |

# rc1 手順6の照合と、5792の履歴付きvoid（2026-10-15 22:33〜22:36、Beaver_beta＝本番写し）

Access側の全件再push（22:23〜22:32、sent=5,892・failed=0）の後、設計書2 §5-3手順6の照合を読み取りで行った（22:33:54）。期待との差は伝票5792（S04594、access_voucher_id 4613、Accessで削除済み・今回のpushで更新されず）の1件分だけだった。A-X-01と同じく履歴付きvoidにした（Access側の手順書から抜けていた、rc1の発見事項）。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 0 | 退避（VACUUM INTO） | 22:36 | 1秒未満 | `backups/database_beaver_beta_20261015_2236_pre_rc1_void5792.sqlite` |
| 1 | dry-run: `php ~/void_voucher_with_history.php database.sqlite 5792 4613 "Access で削除済みの伝票（切替時の整合。A-X-01 と同じ扱い）"` | 22:36:34 | 1秒未満 | draft → void予定 |
| 2 | 実行（`--execute`） | 22:36:44.20〜44.24 | 0.05秒 | void、record_history id=5（action void） |

| 照合（手順6） | void前 22:33 | void後（voidを除く） 22:36 | 期待 |
|:--|--:|--:|--:|
| access_voucher_idあり 見積／売上 | 1,949／3,944 | 1,949／3,943 | 1,949／3,943 |
| access_voucher_idなし | 6（5805〜5810） | 6 | 6 |
| access_voucher_idありの伝票の明細 | 25,766 | 25,764 | 25,764 |
| 伝票総数／access_voucher_idの重複 | 5,899／0 | 5,899（うちvoid 1）／0 | —／0 |
| 売上の合計の再計算の食い違い | 1（5792） | 0（r0151のdry-runが挙げるのはvoidの5792だけ） | 0 |
| voucher_noの重複／残した24件 | 0／24件 | 同じ | 0 |

# rc2: Beaver_betaのDBを再び本番の写しに入れ替え（2026-10-15 23:13）

dodai-backの依頼（晴樹さんの指示「自分でできないところまでは全部やってくれ」）。rc1と同じ`api/manual/rc1_copy_prod_db_to_beta.php`で実行。

- 退避: `Beaver_beta/api/backups/database_beta_20261015_2313_pre_rc1_prod_copy.sqlite`（7,692,288 bytes、0.06秒。rc1の手順6まで終えた状態）
- 本番の写し: 7,168,000 bytes、0.05秒。本番DBのmd5・サイズ・更新時刻（2026-10-05 15:00）は不変。スキーマ差分なし（migration不要）
- 入れ替え: 23:13:58（`chmod 666`＋`mv`）
- 件数: 得意先823、案件61、伝票5,802（見積1,895・売上3,907）、明細25,496。integrity ok
- 本番フォルダの`database.sqlite-shm`の更新時刻が23:13:57に変わった（読み取り専用で開いたため。`-wal`は0 bytesのまま）

## rc2 R7 ①基準線＋+10000、③シード削除（2026-10-15 23:30）

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| ① | `rc1_r7_baseline_and_plus10000.php 20261015_2330 Beaver_beta`（退避`backups/database_beaver_beta_20261015_2330_pre_rc1_r7.sqlite`→基準線→+10000） | 23:30:42 | 退避0.053秒・基準線0.061秒・変換0.001秒 | 基準線はrc1と同じ値（G-14-1 5,778、G-14-2 見積13・売上11、G-14-3 4,618、G-14-4 13、G-14-6 7、G-19 823、G-20 800、G-21 22、G-22 19組）。変換: 売上source_estimate_no 6行・見積access_voucher_id 13行。変換後: 見積≤10000 0、重複0、衝突0、孤児0、integrity ok |
| ③ 退避 | `backups/database_beaver_beta_20261015_2330_pre_rc2_seed_purge.sqlite` | 23:30 | 1秒未満 | — |
| ③ dry-run | `r0143_purge_seed_cluster_vouchers.php database.sqlite "2026-03-17 20:04"` | 23:30:49 | 1秒未満 | 対象5,772、安全チェック違反0 |
| ③ 実行 | 同`--execute` | 23:30:57.60〜57.84 | 0.24秒 | 5,772件削除。伝票30（access_voucher_idあり24・なし6）、明細193、孤児0、得意先823、案件61、integrity ok |

## rc2 R7 ⑤ A-B-10（2026-10-15 23:35）

Access ④ApplyRun（23:33〜23:35、applied 825・failed 0、link 819・insert 6・upsert 4）の後。組はrc1と同じ4組（50←1、652←824、754←796、781←814）で、事前の読み取りで有効かつaccess_customer_noなしは796・814・824の3件だけと確認。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 退避 | `backups/database_beaver_beta_20261015_2335_pre_rc2_ab10.sqlite` | 23:35 | 1秒未満 | — |
| dry-run | 4組 | 23:35:34.75〜34.80 | 0.05秒 | 案件3件の付け替え予定、伝票・請求・入金0 |
| 実行 | 4組 | 23:35:42.93〜42.98 | 0.05秒 | 統合4組・案件3件付け替え。得意先829（有効815）、access_customer_noあり825、有効でなし0、統合元への参照0、孤児0、integrity ok |

## rc2 R7 ⑦ 照合と5792の履歴付きvoid（2026-10-15 23:46）

Access ⑥全件再push（23:36〜23:46、sent 5,894・failed 0）の後。読み取りで、全件再pushで更新されなかった（last_synced_atが押し込み開始より前）有効な伝票を探すと、rc1と同じ5792（S04594、access_voucher_id 4613）の1件だけだった。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 確認 | 読み取り | 23:46:25 | — | 未更新の有効な伝票は5792のみ |
| 退避 | `backups/database_beaver_beta_20261015_2346_pre_rc2_void5792.sqlite` | 23:46 | 1秒未満 | — |
| dry-run | `~/void_voucher_with_history.php database.sqlite 5792 4613 "<理由>"` | 23:46:33 | 1秒未満 | draft → void予定 |
| 実行 | 同`--execute` | 23:46:43.76〜43.80 | 0.05秒 | void、record_history id=5 |

照合（voidを除く）: 見積1,951／売上3,943（期待どおり）、明細25,769（期待どおり）、access_voucher_idなし6（5805〜5810）、access_voucher_idの重複0、voucher_noの重複0、伝票総数5,901（void 1）、売上の合計の再計算の食い違い0（r0151のdry-runが挙げるのはvoidの5792だけ）、integrity ok

# rc3: Beaver_betaのDBを再び本番の写しに入れ替え（2026-10-15 23:57）

dodai-backの依頼（Access側R6の差を直したうえでの最終リハーサル）。同じ`rc1_copy_prod_db_to_beta.php`で実行。

- 退避: `Beaver_beta/api/backups/database_beta_20261015_2357_pre_rc1_prod_copy.sqlite`（7,692,288 bytes、0.06秒。rc2の⑦まで終えた状態）
- 本番の写し: 0.05秒。本番DBは不変、スキーマ差分なし
- 入れ替え: 23:57:12
- 件数: 得意先823、案件61、伝票5,802（見積1,895・売上3,907）、明細25,496。integrity ok

# rc4（rc3の23:57の写しをそのまま使用。Access側R1〜R6合格後）

## rc4 R7 ①基準線＋+10000、③シード削除（2026-10-16 00:50〜00:51）

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| ① | `rc1_r7_baseline_and_plus10000.php 20261016_0050 Beaver_beta`（退避`backups/database_beaver_beta_20261016_0050_pre_rc1_r7.sqlite`） | 00:50:59 | 退避0.054秒・基準線0.062秒・変換0.001秒 | 実行前の件数は写しのまま（823／61／5,802／25,496）。基準線はrc1・rc2と同じ。変換: 売上6行・見積13行。変換後: 見積≤10000 0、重複0、衝突0、孤児0、integrity ok |
| ③ 退避 | `backups/database_beaver_beta_20261016_0051_pre_rc4_seed_purge.sqlite` | 00:51 | 1秒未満 | — |
| ③ dry-run | | 00:51:08 | 1秒未満 | 対象5,772、違反0 |
| ③ 実行 | `--execute` | 00:51:17.06〜17.29 | 0.23秒 | 5,772件削除。伝票30（あり24・なし6）、明細193、孤児0、得意先823、案件61、integrity ok |

## rc4 R7 ⑤ A-B-10（2026-10-16 00:55）

Access ④ApplyRun（00:52〜00:55、applied 825・failed 0）の後。事前の読み取りで組はrc1・rc2と同じ4組（有効でaccess_customer_noなしは796・814・824、1は無効化済み）。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 退避 | `backups/database_beaver_beta_20261016_0055_pre_rc4_ab10.sqlite` | 00:55 | 1秒未満 | — |
| dry-run | 4組 | 00:55:22 | 1秒未満 | 案件3件の付け替え予定、伝票・請求・入金0 |
| 実行 | 4組 | 00:55:30.87〜30.92 | 0.05秒 | 統合4組・案件3件付け替え。得意先829（有効815）、access_customer_noあり825、有効でなし0、統合元への参照0、孤児0、integrity ok |

## rc4 R7 ⑦ 照合と5792の履歴付きvoid（2026-10-16 01:05）

Access ⑥全件再push（00:56〜01:05、sent 5,894・failed 0）の後。未更新の有効な伝票は5792の1件だけ（01:05:34の読み取り）。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 退避 | `backups/database_beaver_beta_20261016_0105_pre_rc4_void5792.sqlite` | 01:05 | 1秒未満 | — |
| dry-run | `~/void_voucher_with_history.php database.sqlite 5792 4613 "<理由>"` | 01:05:41 | 1秒未満 | draft → void予定 |
| 実行 | 同`--execute` | 01:05:53.44〜54.06 | 0.6秒（照合込み） | void、record_history id=5 |

照合（voidを除く）: 見積1,951／売上3,943、明細25,769、access_voucher_idなし6（5805〜5810）、重複0、voucher_noの重複0、売上の合計の再計算の食い違い0（r0151が挙げるのはvoidの5792のみ）、伝票総数5,901（void 1）、integrity ok。**rc4のBeaver側R7はすべて期待どおり**

# rc4 合格と、Beaver_betaの保持（2026-10-16）

dodai-backより: rc4はR1〜R9すべて合格（Access記録`a96338a`、AccessTategu `docs/R-086_リハーサル記録.md`）。**いまのBeaver_beta（rc4の⑦まで終えた状態）は、藤田晴樹さんの受入確認（S4）に使うので、入れ替え・書き換えをしない**。コードのデプロイも、S4が終わるまではdodai-backと相談してから行う。

# rc5: Beaver_betaのDBを再び本番の写しに入れ替え（2026-10-17 20:49）

dodai-backの依頼（最終リハーサル、晴樹さん了承済み）。同じ`rc1_copy_prod_db_to_beta.php`で実行。**rc5が終わるまで（dodai-backの「rc5 終了」まで）Beaver_betaへのデプロイは止める。betaのコードはR-0184の2026-10-17 20:03の版で固定**。

- 退避: `Beaver_beta/api/backups/database_beta_20261017_2049_pre_rc1_prod_copy.sqlite`（7,696,384 bytes、0.06秒。S4で使っていた状態）
- 本番の写し: 0.05秒。本番DBは不変、スキーマ差分なし
- 入れ替え: 20:49:28
- 件数: 得意先823、案件61、伝票5,802（見積1,895・売上3,907）、明細25,496。integrity ok

## rc5 R7 ①基準線＋+10000、③シード削除（2026-10-17 21:13〜21:14）

Access側R1〜R6合格（A/B差分0）の後。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| ① | `rc1_r7_baseline_and_plus10000.php 20261017_2113 Beaver_beta`（退避`backups/database_beaver_beta_20261017_2113_pre_rc1_r7.sqlite`） | 21:13:52 | 退避0.054秒・基準線0.061秒・変換0.001秒 | 基準線はrc1〜rc4と同じ。変換: 売上6行・見積13行。変換後: 見積≤10000 0、重複0、衝突0、孤児0、integrity ok |
| ③ 退避 | `backups/database_beaver_beta_20261017_2114_pre_rc5_seed_purge.sqlite` | 21:14 | 1秒未満 | — |
| ③ dry-run | | 21:14:06 | 1秒未満 | 対象5,772、違反0 |
| ③ 実行 | `--execute` | 21:14:21.24〜21.47 | 0.23秒 | 5,772件削除。伝票30（あり24・なし6）、明細193、孤児0、得意先823、案件61、integrity ok |

## rc5 R7 ⑤ A-B-10（2026-10-17 21:28〜21:29）

Access ④ApplyRun（link 819・insert 6・upsert 4、失敗0）の後。事前の読み取りで組はrc1〜rc4と同じ4組。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 退避 | `backups/database_beaver_beta_20261017_2128_pre_rc5_ab10.sqlite` | 21:28 | 1秒未満 | — |
| dry-run | 4組 | 21:28:53 | 1秒未満 | 案件3件の付け替え予定、伝票・請求・入金0 |
| 実行 | 4組 | 21:29:08.81〜08.86 | 0.05秒 | 統合4組・案件3件付け替え。得意先829（有効815）、access_customer_noあり825、有効でなし0、統合元への参照0、孤児0、integrity ok |

## rc5 R7 ⑦ 照合と5792の履歴付きvoid（2026-10-17 21:44〜21:45）

Access ⑥全件再push（sent 5,897・failed 0、738秒）の後。読み取り（21:44:53）で、pushで更新されなかった有効な伝票はrc1〜rc4と同じ5792（S04594、access_voucher_id 4613）の1件だけ。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 退避 | `backups/database_beaver_beta_20261017_2145_pre_rc5_void5792.sqlite` | 21:45 | 1秒未満 | — |
| dry-run | `~/void_voucher_with_history.php database.sqlite 5792 4613 "<理由>"` | 21:45:08 | 1秒未満 | draft → void予定 |
| 実行 | 同`--execute` | 21:45:26.20〜26.25 | 0.05秒 | void、record_history id=5 |

照合（voidを除く）: 見積1,953／売上3,944（合計5,897＝Accessのsent 5,897と一致）、明細25,777、access_voucher_idなし6（5805〜5810）、重複0、voucher_noの重複0、売上の合計の再計算の食い違い0（r0151が挙げるのはvoidの5792のみ）、伝票総数5,904（void 1）、integrity ok

## rc6 Beaver_betaを本番の写しに入れ替え（2026-10-18 11:31）

dodai-backの依頼（晴樹さん了承済み）。同じ`rc1_copy_prod_db_to_beta.php`で実行。**rc6が終わるまで（dodai-backの「rc6 終了」まで）Beaver_betaへのデプロイは止める**。

- 退避: `Beaver_beta/api/backups/database_beta_20261018_1131_pre_rc1_prod_copy.sqlite`（7,692,288 bytes、0.06秒。rc5の⑦とR-0184手直しのデプロイまで終えた状態）
- 本番の写し: 7,168,000 bytes、0.05秒。本番DB不変OK。スキーマ差分なし（migration不要）
- 入れ替え: 11:32:32（`chmod 666`＋`mv`）
- 件数: 得意先824（10/18 09:43に本番で誤って作った空の得意先826を含む。code 90023、name空、access_customer_noなし、有効）、案件61、伝票5,802（見積1,895・売上3,907）、明細25,496。integrity ok

## rc6 R7 ①基準線＋+10000、③シード削除（2026-10-18 21:58〜21:59）

dodai-backの合図（Access側R1〜R6合格、A/B比較 OK 14・NG 0）。rc5と同じ手順。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| ① | `rc1_r7_baseline_and_plus10000.php 20261018_2158 Beaver_beta`（退避`backups/database_beaver_beta_20261018_2158_pre_rc1_r7.sqlite`） | 21:58:50〜51 | 変換0.001秒 | 基準線はrc5と比べてG-19が823→824、G-21が22→23（どちらも空の得意先826の分）。ほかは同じ。変換: 売上6行・見積13行。変換後: 見積≤10000 0、重複0、衝突0、孤児0、integrity ok |
| ③ 退避 | `backups/database_beaver_beta_20261018_2159_pre_rc6_seed_purge.sqlite` | 21:59 | 1秒未満 | — |
| ③ dry-run | | 21:59:15 | 1秒未満 | 対象5,772、違反0 |
| ③ 実行 | `--execute` | 21:59:29.64〜29.87 | 0.23秒 | 5,772件削除。伝票30（あり24・なし6）、明細193、孤児0、得意先824、案件61、integrity ok |

## rc6 R7 ⑤ A-B-10（2026-10-18 22:07〜22:08）

Access ④ApplyRun（applied 826・failed 0、再取込830）の後。事前の読み取りで、有効かつaccess_customer_noなしはrc5と同じ796・814・824の3件。空の得意先826は④でaccess_customer_no=835・code 835になり（nameは空のまま。Access側は仮の名前「得意先835」）、統合の候補に出なかった。組はrc1〜rc5と同じ4組。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 退避 | `backups/database_beaver_beta_20261018_2207_pre_rc6_ab10.sqlite` | 22:07 | 1秒未満 | — |
| dry-run | 4組 | 22:07:54 | 1秒未満 | 案件3件の付け替え予定、伝票・請求・入金0 |
| 実行 | 4組 | 22:08:16.41〜16.46 | 0.05秒 | 統合4組・案件3件付け替え。得意先830（有効816）、access_customer_noあり826、有効でなし0、統合元への参照0、孤児0、integrity ok（rc5より得意先・有効・ありが各1多いのは826の分） |

## rc6 R7 ⑦ 照合と5792の履歴付きvoid（2026-10-18 22:24〜22:25）

Access ⑥全件再push（sent 5,897・failed 0、947秒。last_synced_atは13:11:10〜13:24:29 UTC）の後。読み取り（22:24〜）で、pushで更新されなかった有効な伝票はrc1〜rc5と同じ5792（S04594、access_voucher_id 4613）の1件だけ（ほかはaccess_voucher_idなしの5805〜5810）。

| # | 内容 | 時刻 | 所要 | 結果 |
|:--|:--|:--|:--|:--|
| 退避 | `backups/database_beaver_beta_20261018_2225_pre_rc6_void5792.sqlite` | 22:25 | 1秒未満 | — |
| dry-run | `~/void_voucher_with_history.php database.sqlite 5792 4613 "<理由>"` | 22:25:13 | 1秒未満 | draft → void予定 |
| 実行 | 同`--execute` | 22:25:14.04〜14.09 | 0.05秒 | void、record_history id=5 |

照合（voidとaccess_voucher_idなしを除く）: 見積1,953／売上3,944（合計5,897＝Accessのsent 5,897と一致）、明細25,777。rc5と同じ。access_voucher_idなし6（5805〜5810）、重複0、voucher_noの重複0、売上の合計の再計算の食い違い0（r0151が挙げるのはvoidの5792のみ）、伝票総数5,904（void 1）、integrity ok

dodai-backより: rc6はR1〜R9すべて合格（見積1,953・売上3,944・明細25,777で一致）。rc6終了につき、Beaver_betaへのデプロイ止めを解除（2026-10-18）。**Beaver_betaのデータはrc6の⑦まで終えた状態のまま残す**（入れ替え・書き換えをしない）。本番切替の日程は晴樹さんとdodai-backで決めて改めて連絡が来る。
