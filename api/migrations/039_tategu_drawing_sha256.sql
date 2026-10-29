ALTER TABLE tategu_items ADD COLUMN drawing_sha256 TEXT;

ALTER TABLE tategu_items ADD COLUMN last_synced_at DATETIME;
