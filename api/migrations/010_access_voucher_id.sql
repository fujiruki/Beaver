-- R-025 Step E-Beaver: AccessTategu からの伝票 push 受信用列を追加
-- access_voucher_id を冪等性キーとし、access_voucher_no は表示用、shipped は R-022 連携用
ALTER TABLE vouchers ADD COLUMN access_voucher_id INTEGER;
ALTER TABLE vouchers ADD COLUMN access_voucher_no TEXT;
ALTER TABLE vouchers ADD COLUMN shipped INTEGER DEFAULT 0;
ALTER TABLE vouchers ADD COLUMN shipped_at TEXT;
CREATE INDEX IF NOT EXISTS idx_vouchers_access_voucher_id ON vouchers(access_voucher_id);
