<?php
/**
 * Beaver API - エントリーポイント
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-HTTP-Method-Override');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/auth_client.php';
require_once __DIR__ . '/auth_gate.php';
auth_configure(['driver' => AUTH_DRIVER, 'base' => 'https://door-fujita.com/contents/auth']);

// ルーティング
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$parsedPath = parse_url($requestUri, PHP_URL_PATH);
$path = $parsedPath;
if (strpos($parsedPath, BASE_PATH) === 0) {
    $path = substr($parsedPath, strlen(BASE_PATH));
}
$path = '/' . trim($path, '/');
if ($path === '/') $path = '';

$method = $_SERVER['REQUEST_METHOD'];
if ($method === 'POST') {
    if (isset($_GET['_method'])) {
        $method = strtoupper($_GET['_method']);
    } elseif (isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
        $method = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
    }
}

header('Content-Type: application/json; charset=utf-8');
// R-074: nginxのコンテンツキャッシュがAPI応答（GET含む）を保持し、DB更新後も古いJSONを
// 返し続ける事故が発生したため、全APIエンドポイント一律でキャッシュを抑止する。
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

try {
    $pdo = Database::connect();

    // --- ヘルスチェック ---
    if ($path === '/health') {
        echo json_encode(['status' => 'ok', 'app' => APP_ID]);
        exit;
    }

    // --- 認証ゲート (R-0117): Youkan連携APIは専用トークン必須 ---
    // BANTO_API_TOKEN・auth-hubログインとは独立した最小権限トークン。AUTH_DRIVER=noneでも省略しない。
    if ($path === '/integrations/youkan' || strpos($path, '/integrations/youkan/') === 0) {
        if (!authGateHasValidYoukanToken()) {
            http_response_code(401);
            echo json_encode(['error' => 'unauthenticated']);
            exit;
        }
    } elseif (authGateIsExempt($path, $method)) {
        // --- 認証ゲート (R-0143 A-B-08) ---
        // 免除＝df_sessionログイン不要という意味であり、SYNC_TOKEN_REQUIRED=true の間は
        // Authorization: Bearer <SYNC_API_TOKEN> が無ければ401にする
        if (SYNC_TOKEN_REQUIRED && !authGateHasValidSyncToken()) {
            http_response_code(401);
            echo json_encode(['error' => 'unauthenticated']);
            exit;
        }
    } elseif (
        // --- 認証ゲート (R-0109 / R-0110) ---
        // AUTH_DRIVER=none（ローカル開発既定）では従来通り認証なしで通す
        // 番頭AI用の固定トークン（Bearer）が一致すればauth-hubログインなしでも通す
        AUTH_DRIVER !== 'none' && !authGateHasValidBantoToken()
    ) {
        auth_require_user(json: true);
    }

    // --- ログインユーザー情報 ---
    if ($path === '/me') {
        if ($method !== 'GET') {
            http_response_code(405);
            echo json_encode(['error' => 'Method not allowed']);
            exit;
        }
        echo json_encode(currentUser());
        exit;
    }

    // --- ルーティング ---
    $routes = [
        'customers'     => __DIR__ . '/routes/customers.php',
        'projects'      => __DIR__ . '/routes/projects.php',
        'tategu-items'  => __DIR__ . '/routes/tategu_items.php',
        'vouchers'      => __DIR__ . '/routes/vouchers.php',
        'invoices'      => __DIR__ . '/routes/invoices.php',
        'payments'      => __DIR__ . '/routes/payments.php',
        'history'       => __DIR__ . '/routes/history.php',
        'settings'          => __DIR__ . '/routes/settings.php',
        'sales-categories'  => __DIR__ . '/routes/sales_categories.php',
        'project-statuses'  => __DIR__ . '/routes/project_statuses.php',
        'catalog-proxy'            => __DIR__ . '/routes/catalog_proxy.php',
        'aggregation-categories'   => __DIR__ . '/routes/aggregation_categories.php',
        'feedback'                 => __DIR__ . '/routes/feedback.php',
        'admin/feedback'           => __DIR__ . '/routes/feedback.php',
        'integrations/youkan'      => __DIR__ . '/routes/integrations_youkan.php',
        'sync'                     => __DIR__ . '/routes/sync.php',
    ];

    $matched = false;
    foreach ($routes as $prefix => $routeFile) {
        if ($path === "/$prefix" || strpos($path, "/$prefix/") === 0) {
            if (file_exists($routeFile)) {
                require $routeFile;
                $matched = true;
            }
            break;
        }
    }

    if (!$matched) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found', 'path' => $path]);
    }

} catch (Throwable $e) {
    error_log(sprintf(
        '[Beaver index] %s in %s:%d',
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    ));
    http_response_code(500);
    echo json_encode(['error' => 'internal_error']);
}
