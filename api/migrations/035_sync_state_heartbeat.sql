-- R-0143 A-B-06: sync-state（Access側の確認待ちフラグ）とheartbeat（最終疎通時刻）
ALTER TABLE vouchers ADD COLUMN sync_pending INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS sync_heartbeats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    synced_at DATETIME,
    source TEXT
);
INSERT OR IGNORE INTO sync_heartbeats (id, synced_at, source) VALUES (1, NULL, NULL);
