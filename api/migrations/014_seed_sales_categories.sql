-- R-066(a) 前提整備: sales_categories 初期データ投入
-- Access tbl売上種別 の実データと ID を完全一致させる。
-- 先頭の数字はキーボード入力補助用として意図的に残す仕様。
-- 冪等性のため INSERT OR IGNORE を使用。

INSERT OR IGNORE INTO sales_categories (id, name, sort_order, is_active) VALUES
(1, '1地元建具', 1, 1),
(2, '2地元組子', 2, 1),
(3, '3県外組子', 3, 1),
(4, '4小物',    4, 1);
