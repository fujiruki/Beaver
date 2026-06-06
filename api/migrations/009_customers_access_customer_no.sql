-- R-025 Step A: AccessTategu 連携用 得意先番号カラム追加
-- AccessTategu の tbl得意先M.得意先番号（LONG）を文字列保持する。
-- 既存得意先は NULL のまま運用、晴樹さんが必要時に手動で紐付ける想定。
ALTER TABLE customers ADD COLUMN access_customer_no TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_access_customer_no
  ON customers(access_customer_no);
