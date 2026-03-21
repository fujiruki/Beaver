CREATE TABLE IF NOT EXISTS tategu_item_cost_breakdown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tategu_item_id INTEGER NOT NULL REFERENCES tategu_items(id) ON DELETE CASCADE,
    category_code TEXT NOT NULL,
    category_name TEXT NOT NULL,
    measure_type TEXT NOT NULL CHECK(measure_type IN ('money', 'time')),
    value REAL NOT NULL DEFAULT 0,
    sort_order INTEGER DEFAULT 0
);
