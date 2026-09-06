ALTER TABLE payments ADD COLUMN access_payment_no INTEGER;
ALTER TABLE payments ADD COLUMN origin TEXT NOT NULL DEFAULT 'access';
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_access_payment_no ON payments(access_payment_no) WHERE access_payment_no IS NOT NULL;
