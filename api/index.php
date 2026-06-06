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

try {
    $pdo = Database::connect();

    // --- ヘルスチェック ---
    if ($path === '/health') {
        echo json_encode(['status' => 'ok', 'app' => 'Beaver']);
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
        'settings'          => __DIR__ . '/routes/settings.php',
        'sales-categories'  => __DIR__ . '/routes/sales_categories.php',
        'catalog-proxy'            => __DIR__ . '/routes/catalog_proxy.php',
        'aggregation-categories'   => __DIR__ . '/routes/aggregation_categories.php',
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
