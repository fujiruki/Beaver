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
