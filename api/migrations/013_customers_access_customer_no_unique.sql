-- R-038: access_customer_no に部分 UNIQUE インデックス追加
-- migration 009 の通常インデックスとは別に、NULL を除外した UNIQUE 制約を付与する。
-- SQLite では NULL は UNIQUE 比較の対象外だが、部分インデックスで明示的に絞る。
DROP INDEX IF EXISTS idx_customers_access_customer_no;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_access_customer_no
    ON customers(access_customer_no)
    WHERE access_customer_no IS NOT NULL;
