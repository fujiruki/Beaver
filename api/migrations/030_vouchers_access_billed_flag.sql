-- SQLiteのADD COLUMNは非定数DEFAULT(CURRENT_TIMESTAMP等)を許可しないため、
-- DEFAULT 0以外は列挙時にDEFAULT句なしで追加する
ALTER TABLE vouchers ADD COLUMN access_billed_flag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN access_billing_date DATE;
ALTER TABLE vouchers ADD COLUMN access_receivable_id INTEGER;
