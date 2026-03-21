<?php
/**
 * /sales-categories エンドポイント
 * GET    /sales-categories        一覧
 * POST   /sales-categories        新規作成
 * PUT    /sales-categories/{id}   更新
 * DELETE /sales-categories/{id}   削除
 */

$segments = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;

switch ($method) {
    case 'GET':
        $includeInactive = isset($_GET['all']);
        $where = $includeInactive ? '' : 'WHERE is_active = 1';
        $stmt = $pdo->query("SELECT * FROM sales_categories $where ORDER BY sort_order, id");
        echo json_encode($stmt->fetchAll());
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        if (empty($data['name'])) { http_response_code(400); echo json_encode(['error' => 'name is required']); exit; }
        $maxStmt = $pdo->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM sales_categories');
        $sortOrder = (int)$maxStmt->fetchColumn();
        $stmt = $pdo->prepare('INSERT INTO sales_categories (name, sort_order, is_active) VALUES (:name, :sort_order, :is_active)');
        $stmt->execute([
            ':name'       => $data['name'],
            ':sort_order' => $data['sort_order'] ?? $sortOrder,
            ':is_active'  => $data['is_active'] ?? 1,
        ]);
        $id = $pdo->lastInsertId();
        http_response_code(201);
        $s = $pdo->prepare('SELECT * FROM sales_categories WHERE id = ?');
        $s->execute([$id]);
        echo json_encode($s->fetch());
        break;

    case 'PUT':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = ['name', 'sort_order', 'is_active'];
        $sets = []; $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $params[':id'] = $resourceId;
        $pdo->prepare('UPDATE sales_categories SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        $s = $pdo->prepare('SELECT * FROM sales_categories WHERE id = ?');
        $s->execute([$resourceId]);
        echo json_encode($s->fetch());
        break;

    case 'DELETE':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $checkStmt = $pdo->prepare('SELECT COUNT(*) FROM vouchers WHERE sales_category_id = ?');
        $checkStmt->execute([$resourceId]);
        if ((int)$checkStmt->fetchColumn() > 0) {
            http_response_code(409);
            echo json_encode(['error' => 'この売上種別は伝票で使用中です']);
            exit;
        }
        $pdo->prepare('DELETE FROM sales_categories WHERE id = ?')->execute([$resourceId]);
        echo json_encode(['deleted' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
