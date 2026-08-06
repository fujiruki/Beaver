<?php
/**
 * /history エンドポイント（R-0098: Undo/Redo）
 * GET  /history?entity=...&entity_id=...&action=...   履歴一覧
 * POST /history/{id}/restore                          指定履歴の状態へ復元
 */

require_once __DIR__ . '/history_helpers.php';

$segments    = explode('/', trim($path, '/'));
$resourceId  = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subResource = $segments[2] ?? null;

if ($method === 'GET' && !$resourceId) {
    $entity = $_GET['entity'] ?? null;
    if (!$entity) {
        http_response_code(400);
        echo json_encode(['error' => 'entity is required']);
        exit;
    }
    $where  = 'WHERE entity = :entity';
    $params = [':entity' => $entity];
    if (!empty($_GET['entity_id'])) {
        $where .= ' AND entity_id = :entity_id';
        $params[':entity_id'] = (int)$_GET['entity_id'];
    }
    if (!empty($_GET['action'])) {
        $where .= ' AND action = :action';
        $params[':action'] = $_GET['action'];
    }
    $stmt = $pdo->prepare("SELECT * FROM record_history $where ORDER BY id DESC LIMIT 200");
    $stmt->execute($params);
    echo json_encode($stmt->fetchAll());
    exit;
}

if ($method === 'POST' && $resourceId && $subResource === 'restore') {
    $histStmt = $pdo->prepare('SELECT * FROM record_history WHERE id = ?');
    $histStmt->execute([$resourceId]);
    $history = $histStmt->fetch();
    if (!$history) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        exit;
    }

    $envelope = json_decode($history['before_json'], true) ?? [];
    $row      = $envelope['row'] ?? [];
    $related  = $envelope['related'] ?? [];

    switch ($history['entity']) {
        case 'customers':
            $result = restoreCustomerUpdate($pdo, $row);
            break;
        case 'payments':
            $result = restorePaymentDelete($pdo, $row);
            break;
        case 'invoices':
            $result = restoreInvoiceDelete($pdo, $row, $related);
            break;
        default:
            http_response_code(400);
            echo json_encode(['error' => 'unsupported entity']);
            exit;
    }

    if ($result['code'] >= 200 && $result['code'] < 300) {
        $newEntityId = (int)($result['body']['id'] ?? $history['entity_id']);
        recordHistory(
            $pdo,
            $history['entity'],
            $newEntityId,
            'restore',
            $result['body'],
            $history['entity'] === 'invoices' ? ['voucher_ids' => $related['voucher_ids'] ?? []] : []
        );
    }

    http_response_code($result['code']);
    echo json_encode($result['body']);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found', 'path' => $path]);
