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
// R-0141: 環境変数 BEAVER_APP_ID でAppIDを切り替え可能にする（未指定なら本番の'Beaver'のまま）
function beaver_resolve_app_id(string|false $env): string
{
    return $env !== false && $env !== '' ? $env : 'Beaver';
}

if (!defined('APP_ID'))    define('APP_ID', beaver_resolve_app_id(getenv('BEAVER_APP_ID')));
if (!defined('BASE_PATH')) define('BASE_PATH', '/contents/' . APP_ID . '/api');

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

// R-0117: Youkan連携API向けトークン。config.local.php で未定義の場合のみ開発用フォールバック値を使う
if (!defined('YOUKAN_API_TOKEN')) define('YOUKAN_API_TOKEN', 'dev-youkan-token-change-me');

// R-0143: AccessTategu連携の同期API向けトークン。config.local.php で未定義の場合のみ開発用フォールバック値を使う
if (!defined('SYNC_API_TOKEN')) define('SYNC_API_TOKEN', 'dev-local-sync-token-change-me');

// R-0143: 同期APIのトークン必須化の移行フラグ。既定false（後方互換）。Beaver_betaで先にtrueにする
if (!defined('SYNC_TOKEN_REQUIRED')) define('SYNC_TOKEN_REQUIRED', false);

// R-0143 A-B-05: 請求・入金編集の封印フラグ。既定false（Beaver側での新規作成・削除・繰越残高編集を禁止し、Accessの写しとして表示専用にする）
if (!defined('BILLING_EDIT_ENABLED')) define('BILLING_EDIT_ENABLED', false);

// R-0118: Youkan容量判定プロキシ用。config.local.php で未定義の場合のみ開発用フォールバック値を使う
if (!defined('BEAVER_CAPACITY_TOKEN')) define('BEAVER_CAPACITY_TOKEN', 'dev-beaver-capacity-token-change-me');
if (!defined('YOUKAN_CAPACITY_URL')) define('YOUKAN_CAPACITY_URL', 'http://localhost:8000/integrations/beaver/capacity-check');

// R-0130: Youkanプロジェクトリンク取得プロキシ用。BEAVER_CAPACITY_TOKENを再利用する
if (!defined('YOUKAN_PROJECT_LINK_BASE_URL')) define('YOUKAN_PROJECT_LINK_BASE_URL', 'http://localhost:8000/integrations/beaver/project-link');
if (!defined('YOUKAN_FRONTEND_BASE_URL'))     define('YOUKAN_FRONTEND_BASE_URL', 'http://localhost:5173/contents/Youkan/');

if (!defined('CATALOG_API_BASE')) define('CATALOG_API_BASE', 'http://localhost:8002/contents/catalog-system/api');
