ALTER TABLE invoices ADD COLUMN access_receivable_id INTEGER;
ALTER TABLE invoices ADD COLUMN access_cancelled_at DATETIME;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_access_receivable_id ON invoices(access_receivable_id) WHERE access_receivable_id IS NOT NULL;
