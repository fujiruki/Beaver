<?php
/**
 * Beaver - データベース設定
 * DB_TYPE を 'sqlite' → 'mysql' に変えるだけでDBを切り替え可能
 */

// テストハーネスが auto_prepend_file で DB_PATH 等を事前定義するため、
// 既定義の定数は上書きしない（二重定義の E_WARNING が出力へ混入するのを防ぐ）
if (!defined('DB_TYPE')) define('DB_TYPE', 'sqlite');

// SQLite設定
if (!defined('DB_PATH')) define('DB_PATH', __DIR__ . '/database.sqlite');

// MySQL設定（将来用）
if (!defined('DB_HOST')) define('DB_HOST', 'localhost');
if (!defined('DB_NAME')) define('DB_NAME', 'beaver');
if (!defined('DB_USER')) define('DB_USER', 'root');
if (!defined('DB_PASS')) define('DB_PASS', '');

// アプリ設定
if (!defined('APP_ID'))    define('APP_ID', 'Beaver');
if (!defined('BASE_PATH')) define('BASE_PATH', '/contents/Beaver/api');
