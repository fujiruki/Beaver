-- R-0140 (1): voucher_lines.quantity を INTEGER から REAL に変更し、小数を許容する。
-- SQLite は ALTER COLUMN ができないため、012/vouchers と同じテーブル再作成パターンで行う。
--
-- 元の CREATE TABLE と完全に同じ列定義（quantity の型のみ REAL に変更）を保つこと。
-- voucher_line_costs / voucher_line_prices が voucher_lines(id) を REFERENCES しているため、
-- 012 と同じく FK を一時的に OFF にしてから再構築する。

PRAGMA foreign_keys=OFF;

BEGIN TRANSACTION;

CREATE TABLE voucher_lines_new (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    voucher_id          INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
    line_no             INTEGER NOT NULL,
    line_type           TEXT NOT NULL DEFAULT 'normal',
    location_no         INTEGER,
    location_name       TEXT(30),
    tategu_item_id      INTEGER REFERENCES tategu_items(id),
    item_name           TEXT(60),
    quantity            REAL NOT NULL DEFAULT 1,
    cost_body           REAL NOT NULL DEFAULT 0,
    cost_hardware       REAL NOT NULL DEFAULT 0,
    cost_glass          REAL NOT NULL DEFAULT 0,
    cost_factory_hours  REAL NOT NULL DEFAULT 0,
    cost_site_hours     REAL NOT NULL DEFAULT 0,
    cost_labor_rate     REAL NOT NULL DEFAULT 0,
    snapshot_loaded_at  DATETIME,
    price_body          REAL NOT NULL DEFAULT 0,
    price_hardware      REAL NOT NULL DEFAULT 0,
    price_glass         REAL NOT NULL DEFAULT 0,
    line_total          REAL NOT NULL DEFAULT 0,
    tax_category        TEXT NOT NULL DEFAULT '課税',
    memo                TEXT(16),
    source_catalog_item_id INTEGER DEFAULT NULL,
    source              TEXT DEFAULT 'access',
    access_line_id      INTEGER,
    edited_in_beaver    INTEGER NOT NULL DEFAULT 0,
    updated_at          DATETIME,
    UNIQUE(voucher_id, line_no)
);

INSERT INTO voucher_lines_new
    (id, voucher_id, line_no, line_type, location_no, location_name,
     tategu_item_id, item_name, quantity,
     cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate,
     snapshot_loaded_at,
     price_body, price_hardware, price_glass, line_total, tax_category, memo,
     source_catalog_item_id, source, access_line_id, edited_in_beaver, updated_at)
SELECT
    id, voucher_id, line_no, line_type, location_no, location_name,
    tategu_item_id, item_name, quantity,
    cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate,
    snapshot_loaded_at,
    price_body, price_hardware, price_glass, line_total, tax_category, memo,
    source_catalog_item_id, source, access_line_id, edited_in_beaver, updated_at
FROM voucher_lines;

DROP TABLE voucher_lines;
ALTER TABLE voucher_lines_new RENAME TO voucher_lines;

CREATE INDEX IF NOT EXISTS idx_voucher_lines_voucher ON voucher_lines(voucher_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_voucher_lines_access_line ON voucher_lines(voucher_id, access_line_id);

COMMIT;

-- 公式 table-restore protocol 手順の確認用（dev/prod 適用時に手動実行推奨）：
--   PRAGMA foreign_key_check;

PRAGMA foreign_keys=ON;
