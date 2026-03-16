<?php
/**
 * Beaver - データベース設定
 * DB_TYPE を 'sqlite' → 'mysql' に変えるだけでDBを切り替え可能
 */

define('DB_TYPE', 'sqlite');

// SQLite設定
define('DB_PATH', __DIR__ . '/database.sqlite');

// MySQL設定（将来用）
define('DB_HOST', 'localhost');
define('DB_NAME', 'beaver');
define('DB_USER', 'root');
define('DB_PASS', '');

// アプリ設定
define('APP_ID', 'Beaver');
define('BASE_PATH', '/contents/Beaver/api');
