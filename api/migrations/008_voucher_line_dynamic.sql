CREATE TABLE IF NOT EXISTS voucher_line_costs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_line_id INTEGER NOT NULL REFERENCES voucher_lines(id) ON DELETE CASCADE,
  category_code   TEXT NOT NULL,
  category_name   TEXT NOT NULL,
  measure_type    TEXT NOT NULL CHECK(measure_type IN ('money', 'time')),
  value           REAL NOT NULL DEFAULT 0,
  sort_order      INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS voucher_line_prices (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  voucher_line_id INTEGER NOT NULL REFERENCES voucher_lines(id) ON DELETE CASCADE,
  category_code   TEXT NOT NULL,
  category_name   TEXT NOT NULL,
  measure_type    TEXT NOT NULL CHECK(measure_type IN ('money', 'time')),
  value           REAL NOT NULL DEFAULT 0,
  sort_order      INTEGER DEFAULT 0
);

ALTER TABLE voucher_lines ADD COLUMN source_catalog_item_id INTEGER DEFAULT NULL;
ALTER TABLE aggregation_category_master ADD COLUMN merge_into_price_code TEXT DEFAULT NULL;
