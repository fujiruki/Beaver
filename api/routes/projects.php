<?php
/**
 * /projects エンドポイント
 * GET    /projects               一覧
 * GET    /projects/{id}          詳細（案件に紐づく伝票一覧・業務時間合計含む）
 * POST   /projects               新規作成
 * PUT    /projects/{id}          更新
 * DELETE /projects/{id}          削除（キャンセル扱い）
 */

$segments = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;

switch ($method) {
    case 'GET':
        if ($resourceId) {
            // 詳細
            $stmt = $pdo->prepare('
                SELECT p.*, c.name AS customer_name
                FROM projects p
                LEFT JOIN customers c ON c.id = p.customer_id
                WHERE p.id = ?
            ');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

            // 紐づく伝票
            $stmt2 = $pdo->prepare('
                SELECT id, voucher_no, voucher_type, status, voucher_date, total_amount
                FROM vouchers WHERE project_id = ? ORDER BY voucher_date DESC
            ');
            $stmt2->execute([$resourceId]);
            $row['vouchers'] = $stmt2->fetchAll();

            // 有効見積の業務時間合計
            $stmt3 = $pdo->prepare('
                SELECT
                    COALESCE(SUM(vl.cost_factory_hours * vl.quantity), 0) AS total_factory_hours,
                    COALESCE(SUM(vl.cost_site_hours    * vl.quantity), 0) AS total_site_hours
                FROM voucher_lines vl
                JOIN vouchers v ON v.id = vl.voucher_id
                WHERE v.project_id = ? AND v.voucher_type = "estimate" AND v.status != "void"
            ');
            $stmt3->execute([$resourceId]);
            $hours = $stmt3->fetch();
            $row['estimated_factory_hours'] = round((float)$hours['total_factory_hours'], 2);
            $row['estimated_site_hours']    = round((float)$hours['total_site_hours'], 2);

            echo json_encode($row);
        } else {
            // 一覧
            $where = 'WHERE 1=1';
            $params = [];
            if (!empty($_GET['customer_id'])) {
                $where .= ' AND p.customer_id = ?';
                $params[] = (int)$_GET['customer_id'];
            }
            if (!empty($_GET['status'])) {
                $where .= ' AND p.status = ?';
                $params[] = $_GET['status'];
            }
            if (!empty($_GET['q'])) {
                $where .= ' AND p.name LIKE ?';
                $params[] = '%' . $_GET['q'] . '%';
            }
            $stmt = $pdo->prepare("
                SELECT p.*, c.name AS customer_name
                FROM projects p
                LEFT JOIN customers c ON c.id = p.customer_id
                $where
                ORDER BY p.updated_at DESC
            ");
            $stmt->execute($params);
            echo json_encode($stmt->fetchAll());
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $stmt = $pdo->prepare('
            INSERT INTO projects (customer_id, name, description, status, start_date, end_date)
            VALUES (:customer_id, :name, :description, :status, :start_date, :end_date)
        ');
        $stmt->execute([
            ':customer_id' => $data['customer_id'] ?? null,
            ':name'        => $data['name'] ?? '',
            ':description' => $data['description'] ?? null,
            ':status'      => $data['status'] ?? 'active',
            ':start_date'  => $data['start_date'] ?? null,
            ':end_date'    => $data['end_date'] ?? null,
        ]);
        $id = $pdo->lastInsertId();
        http_response_code(201);
        $stmt2 = $pdo->prepare('SELECT p.*, c.name AS customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?');
        $stmt2->execute([$id]);
        echo json_encode($stmt2->fetch());
        break;

    case 'PUT':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = ['customer_id','name','description','status','start_date','end_date'];
        $sets = []; $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $params[':id'] = $resourceId;
        $pdo->prepare('UPDATE projects SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        $stmt = $pdo->prepare('SELECT p.*, c.name AS customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?');
        $stmt->execute([$resourceId]);
        echo json_encode($stmt->fetch());
        break;

    case 'DELETE':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $pdo->prepare('UPDATE projects SET status = "cancelled", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        echo json_encode(['cancelled' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
