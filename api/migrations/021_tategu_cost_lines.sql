CREATE TABLE IF NOT EXISTS tategu_item_cost_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tategu_item_id INTEGER NOT NULL REFERENCES tategu_items(id) ON DELETE CASCADE,
    category_code TEXT NOT NULL,
    name TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual', 'wood_calc')),
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tategu_item_cost_lines_item
    ON tategu_item_cost_lines(tategu_item_id, sort_order);

CREATE TABLE IF NOT EXISTS tategu_item_labor_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tategu_item_id INTEGER NOT NULL REFERENCES tategu_items(id) ON DELETE CASCADE,
    process_name TEXT NOT NULL,
    category_code TEXT NOT NULL,
    work_hours REAL NOT NULL DEFAULT 0,
    labor_rate REAL NOT NULL DEFAULT 0,
    amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tategu_item_labor_lines_item
    ON tategu_item_labor_lines(tategu_item_id, sort_order);

UPDATE aggregation_category_master
SET merge_into_price_code = 'body'
WHERE code IN ('factory_hours', 'site_hours')
  AND merge_into_price_code IS NULL;
