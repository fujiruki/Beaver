-- R-0144 B-4: GET /invoices/sync・GET /payments/sync の updated_after 絞り込み用
-- SQLiteのADD COLUMNは非定数DEFAULT(CURRENT_TIMESTAMP等)を許可しないためDEFAULT句なし
ALTER TABLE invoices ADD COLUMN updated_at DATETIME;
UPDATE invoices SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE payments ADD COLUMN updated_at DATETIME;
UPDATE payments SET updated_at = created_at WHERE updated_at IS NULL;
