-- R-0268: 木材原価（部位・明細・樹種表）と建具データ（TateDS）
CREATE TABLE IF NOT EXISTS wood_species (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    access_id          INTEGER NOT NULL UNIQUE,
    name               TEXT NOT NULL,
    unit_price_man     REAL NOT NULL DEFAULT 0,
    disabled           INTEGER NOT NULL DEFAULT 0,
    sort_order         INTEGER NOT NULL DEFAULT 0,
    tateds_species_key TEXT,
    created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tategu_wood_sets (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    uid                   TEXT NOT NULL UNIQUE,
    tategu_item_id        INTEGER NOT NULL REFERENCES tategu_items(id) ON DELETE CASCADE,
    part_name             TEXT NOT NULL DEFAULT '',
    species_access_id     INTEGER,
    species_name          TEXT NOT NULL DEFAULT '',
    unit_price_man        REAL NOT NULL DEFAULT 0,
    length_allowance_mm   REAL NOT NULL DEFAULT 100,
    amount                INTEGER NOT NULL DEFAULT 0,
    sort_order            INTEGER NOT NULL DEFAULT 0,
    tateds_design_id      TEXT,
    tateds_revision       TEXT,
    tateds_imported_lines TEXT,
    created_at            DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tategu_wood_sets_item ON tategu_wood_sets(tategu_item_id, sort_order);

CREATE TABLE IF NOT EXISTS tategu_wood_lines (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    wood_set_id     INTEGER NOT NULL REFERENCES tategu_wood_sets(id) ON DELETE CASCADE,
    usage           TEXT NOT NULL DEFAULT '',
    mitsuke_mm      REAL NOT NULL DEFAULT 0,
    mikomi_mm       REAL NOT NULL DEFAULT 0,
    length_mm       REAL NOT NULL DEFAULT 0,
    qty             REAL NOT NULL DEFAULT 0,
    margin_mm       REAL NOT NULL DEFAULT 0,
    tateds_part_key TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tategu_wood_lines_set ON tategu_wood_lines(wood_set_id, sort_order);

ALTER TABLE tategu_item_cost_lines ADD COLUMN wood_set_uid TEXT;
ALTER TABLE tategu_items ADD COLUMN tateds_design_json TEXT;
ALTER TABLE tategu_items ADD COLUMN design_sha256 TEXT;
