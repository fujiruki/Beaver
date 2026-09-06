-- R-0140 (5): 見積番号 +10000 への追従（Access 側 A-2 と整合させる一度きりの変換）
--
-- 【実行は今回しない】通常の migrations/*.sql とは異なり applied.txt では管理せず、
-- api/migrations/ にも置かない（自動テストのスキーマ構築 glob に巻き込まれ、
-- 他テストの access_voucher_id < 10000 のデータを誤って変換してしまうため）。
--
-- 実行タイミング: AccessTategu P4 の全件再push直前、Beaver停止・Access同期停止の窓で、
-- 開発者が手動で一度だけ実行する（`sqlite3 api/database.sqlite < api/manual/r0140_5_estimate_no_plus10000.sql`）。
--
-- `< 10000` の条件で二重実行を防ぐ（Access の新規伝票は12317以降のため、
-- 旧見積番号の域 1〜9999 と重ならない）。

UPDATE vouchers SET source_estimate_no = CAST(CAST(source_estimate_no AS INTEGER) + 10000 AS TEXT)
 WHERE voucher_type = 'sales' AND source_estimate_no IS NOT NULL
   AND CAST(source_estimate_no AS INTEGER) < 10000;

UPDATE vouchers SET access_voucher_id = access_voucher_id + 10000,
                    access_voucher_no = CAST(access_voucher_id + 10000 AS TEXT)
 WHERE voucher_type = 'estimate' AND access_voucher_id IS NOT NULL
   AND access_voucher_id < 10000;
