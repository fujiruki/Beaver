ALTER TABLE voucher_lines ADD COLUMN source TEXT DEFAULT 'access';
ALTER TABLE voucher_lines ADD COLUMN access_line_id INTEGER;
ALTER TABLE voucher_lines ADD COLUMN edited_in_beaver INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_voucher_lines_access_line ON voucher_lines(voucher_id, access_line_id);
