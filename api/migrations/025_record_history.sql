-- R-0098: データ操作のUndo/Redo（元に戻す）
-- customers（更新）・payments（削除）・invoices（削除）の変更履歴を記録する。
CREATE TABLE IF NOT EXISTS record_history (
    id              INTEGER PRIMARY KEY,
    entity          TEXT NOT NULL,      -- 'customers' | 'payments' | 'invoices'
    entity_id       INTEGER NOT NULL,
    action          TEXT NOT NULL,      -- 'update' | 'delete' | 'restore'
    before_json     TEXT NOT NULL,
    after_json      TEXT,               -- updateのみ。差分表示用
    clamped         INTEGER NOT NULL DEFAULT 0,  -- payments削除時にmax(0,...)クランプが発動したか
    changed_by      INTEGER,            -- NULL許容。認証基盤導入後にcurrentUser()で埋める
    changed_by_name TEXT,               -- 表示名スナップショット
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_record_history_entity ON record_history(entity, entity_id, id DESC);
