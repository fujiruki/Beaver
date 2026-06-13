-- R-038: access_customer_no に UNIQUE インデックス追加
-- SQLite は「NULL != NULL」標準動作で UNIQUE 制約上 NULL を複数許容する。
-- 部分インデックス (WHERE 句) は SQLite 3.8.0+ 専用機能のため本番 3.7.17 では非対応。
-- WHERE 句なし通常 UNIQUE インデックスで同等動作 (NULL は重複許可、値あれば一意)。
DROP INDEX IF EXISTS idx_customers_access_customer_no;
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_access_customer_no
    ON customers(access_customer_no);
