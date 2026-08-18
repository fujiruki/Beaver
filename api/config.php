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

// ローカル/本番固有の秘密情報（Git管理外、.gitignore済み）
if (file_exists(__DIR__ . '/config.local.php')) {
    require_once __DIR__ . '/config.local.php';
}
// R-0080: フィードバック管理API用トークン。config.local.php で未定義の場合のみ開発用フォールバック値を使う
if (!defined('ADMIN_FEEDBACK_TOKEN')) define('ADMIN_FEEDBACK_TOKEN', 'dev-local-token-change-me');
if (!defined('FEEDBACK_UPLOAD_DIR')) define('FEEDBACK_UPLOAD_DIR', __DIR__ . '/uploads/feedback/');

// R-0109: auth-hub連携の認証ドライバ。config.local.php で未定義の場合はローカル開発用に 'none'（認証スキップ）
if (!defined('AUTH_DRIVER')) define('AUTH_DRIVER', 'none');

// R-0110: 番頭AI向けAPIトークン。config.local.php で未定義の場合のみ開発用フォールバック値を使う
if (!defined('BANTO_API_TOKEN')) define('BANTO_API_TOKEN', 'dev-local-banto-token-change-me');
