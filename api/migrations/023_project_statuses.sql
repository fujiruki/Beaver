CREATE TABLE IF NOT EXISTS project_statuses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO project_statuses (name, sort_order) VALUES
  ('問い合わせ', 1), ('見積済', 2), ('受注済', 3), ('進行中', 4),
  ('納品済', 5), ('請求済', 6), ('完了', 7), ('キャンセル', 8);
