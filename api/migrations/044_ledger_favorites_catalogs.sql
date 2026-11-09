-- R-0252: 製品台帳のお気に入りとカタログ（Beaver だけ。Access との同期には出さない）
ALTER TABLE tategu_items ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ledger_catalogs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ledger_catalog_items (
    catalog_id     INTEGER NOT NULL REFERENCES ledger_catalogs(id) ON DELETE CASCADE,
    tategu_item_id INTEGER NOT NULL REFERENCES tategu_items(id) ON DELETE CASCADE,
    sort_order     INTEGER NOT NULL DEFAULT 0,
    UNIQUE (catalog_id, tategu_item_id)
);
