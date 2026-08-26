<?php
/**
 * /aggregation-categories - 集計区分マスター
 * GET  /aggregation-categories       - 一覧取得
 * POST /aggregation-categories/sync  - catalog-systemから同期
 */

$segments = explode('/', trim($path, '/'));
$subPath = isset($segments[1]) ? '/' . $segments[1] : '';

if ($method === 'GET' && $subPath === '') {
    $rows = $pdo->query('SELECT * FROM aggregation_category_master WHERE is_active = 1 ORDER BY sort_order')->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode($rows);
    exit;
}

if ($method === 'POST' && $subPath === '/sync') {
    $catalogUrl = CATALOG_API_BASE . '/aggregation-categories';
    $ctx = stream_context_create(['http' => ['timeout' => 5]]);
    $result = @file_get_contents($catalogUrl, false, $ctx);

    if ($result === false) {
        http_response_code(503);
        echo json_encode(['error' => 'catalog-systemに接続できませんでした']);
        exit;
    }

    $categories = json_decode($result, true);
    if (!is_array($categories)) {
        http_response_code(502);
        echo json_encode(['error' => 'catalog-systemから不正なレスポンスが返されました']);
        exit;
    }

    $stmt = $pdo->prepare(
        'INSERT OR REPLACE INTO aggregation_category_master
             (code, name, measure_type, sort_order, is_active, synced_at, merge_into_price_code)
         VALUES (:code, :name, :measure_type, :sort_order, :is_active, CURRENT_TIMESTAMP,
             COALESCE((SELECT merge_into_price_code FROM aggregation_category_master WHERE code = :code2), NULL))'
    );

    $pdo->beginTransaction();
    foreach ($categories as $cat) {
        $stmt->execute([
            ':code'         => $cat['code'],
            ':code2'        => $cat['code'],
            ':name'         => $cat['name'],
            ':measure_type' => $cat['measureType'] ?? $cat['measure_type'] ?? 'money',
            ':sort_order'   => $cat['sortOrder'] ?? $cat['sort_order'] ?? 0,
            ':is_active'    => $cat['isActive'] ?? $cat['is_active'] ?? 1,
        ]);
    }
    $pdo->commit();

    $saved = $pdo->query('SELECT * FROM aggregation_category_master WHERE is_active = 1 ORDER BY sort_order')->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['synced' => count($categories), 'categories' => $saved]);
    exit;
}

// PATCH /aggregation-categories/{code}/merge-price — merge_into_price_code を更新
if ($method === 'PATCH' && isset($segments[1]) && isset($segments[2]) && $segments[2] === 'merge-price') {
    $code = $segments[1];
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    $mergeCode = $body['merge_into_price_code'] ?? null;
    $pdo->prepare('UPDATE aggregation_category_master SET merge_into_price_code = ? WHERE code = ?')
        ->execute([$mergeCode, $code]);
    $row = $pdo->prepare('SELECT * FROM aggregation_category_master WHERE code = ?');
    $row->execute([$code]);
    echo json_encode($row->fetch());
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found']);
