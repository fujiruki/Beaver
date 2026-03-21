CREATE TABLE IF NOT EXISTS aggregation_category_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    measure_type TEXT NOT NULL CHECK(measure_type IN ('money', 'time')),
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
