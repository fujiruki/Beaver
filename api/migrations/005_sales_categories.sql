-- 売上種別マスタ（工事内容分類）
CREATE TABLE IF NOT EXISTS sales_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 伝票テーブルに売上種別FK追加
ALTER TABLE vouchers ADD COLUMN sales_category_id INTEGER REFERENCES sales_categories(id);
