INSERT OR REPLACE INTO aggregation_category_master
    (code, name, measure_type, sort_order, is_active, synced_at)
VALUES
    ('MAIN', '本体', 'money', 1, 1, NULL),
    ('HARDWARE', '金物', 'money', 2, 1, NULL),
    ('GLASS', 'ガラス', 'money', 3, 1, NULL),
    ('FACTORY_TIME', '工場時間', 'time', 4, 1, NULL),
    ('SITE_TIME', '現場時間', 'time', 5, 1, NULL);
