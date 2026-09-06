-- R-0140 (2): PATCH /customers/{id}/access-link で last_synced_at を記録するための列追加。
-- SQLiteのADD COLUMNは非定数DEFAULT(CURRENT_TIMESTAMP等)を許可しないためDEFAULT句なし
-- （019_voucher_lines_updated_at.sql と同じ理由）。
ALTER TABLE customers ADD COLUMN last_synced_at DATETIME;
