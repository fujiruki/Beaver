<?php
/**
 * /customers エンドポイント
 * GET    /customers         一覧
 * GET    /customers/{id}    詳細
 * POST   /customers         新規作成
 * PUT    /customers/{id}    更新
 * DELETE /customers/{id}    削除（論理削除）
 */

// IDとサブリソースを取り出す
$segments = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subResource = isset($segments[2]) ? $segments[2] : null;

// PATCH /customers/{id}/carry-forward — 繰越残高例外修正
if ($method === 'PATCH' && $resourceId && $subResource === 'carry-forward') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    if (!isset($data['carry_forward_balance'])) {
        http_response_code(400);
        echo json_encode(['error' => 'carry_forward_balance is required']);
        exit;
    }
    $pdo->prepare('
        UPDATE customers
        SET carry_forward_balance = :bal, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ')->execute([':bal' => (float)$data['carry_forward_balance'], ':id' => $resourceId]);
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([$resourceId]);
    echo json_encode($stmt->fetch());
    exit;
}

switch ($method) {
    case 'GET':
        if ($resourceId) {
            // 詳細
            $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                exit;
            }
            echo json_encode($row);
        } else {
            // 一覧
            $where = 'WHERE 1=1';
            $params = [];
            if (!empty($_GET['q'])) {
                $where .= ' AND (name LIKE ? OR code LIKE ?)';
                $q = '%' . $_GET['q'] . '%';
                $params[] = $q;
                $params[] = $q;
            }
            if (!isset($_GET['include_inactive'])) {
                $where .= ' AND is_active = 1';
            }
            if (isset($_GET['page'])) {
                $page    = max(1, (int)$_GET['page']);
                $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
                $offset  = ($page - 1) * $perPage;
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM customers $where");
                $cntStmt->execute($params);
                $total = (int)$cntStmt->fetchColumn();
                $stmt  = $pdo->prepare("SELECT * FROM customers $where ORDER BY code LIMIT $perPage OFFSET $offset");
                $stmt->execute($params);
                echo json_encode([
                    'data' => $stmt->fetchAll(),
                    'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'last_page' => (int)ceil($total / $perPage)],
                ]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM customers $where ORDER BY code");
                $stmt->execute($params);
                echo json_encode($stmt->fetchAll());
            }
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $stmt = $pdo->prepare('
            INSERT INTO customers
                (code, name, name_kana, honorific_type, gender,
                 postal_code, address1, address2, tel, mobile, fax, email,
                 memo, billing_name, billing_date_print,
                 cutoff_day, billing_offset_days, payment_due_days,
                 carry_forward_balance, is_active)
            VALUES
                (:code, :name, :name_kana, :honorific_type, :gender,
                 :postal_code, :address1, :address2, :tel, :mobile, :fax, :email,
                 :memo, :billing_name, :billing_date_print,
                 :cutoff_day, :billing_offset_days, :payment_due_days,
                 :carry_forward_balance, 1)
        ');
        $stmt->execute([
            ':code'                 => $data['code'] ?? null,
            ':name'                 => $data['name'] ?? '',
            ':name_kana'            => $data['name_kana'] ?? null,
            ':honorific_type'       => $data['honorific_type'] ?? '御中',
            ':gender'               => $data['gender'] ?? null,
            ':postal_code'          => $data['postal_code'] ?? null,
            ':address1'             => $data['address1'] ?? null,
            ':address2'             => $data['address2'] ?? null,
            ':tel'                  => $data['tel'] ?? null,
            ':mobile'               => $data['mobile'] ?? null,
            ':fax'                  => $data['fax'] ?? null,
            ':email'                => $data['email'] ?? null,
            ':memo'                 => $data['memo'] ?? null,
            ':billing_name'         => $data['billing_name'] ?? null,
            ':billing_date_print'   => $data['billing_date_print'] ?? 0,
            ':cutoff_day'           => $data['cutoff_day'] ?? 31,
            ':billing_offset_days'  => $data['billing_offset_days'] ?? 15,
            ':payment_due_days'     => $data['payment_due_days'] ?? 30,
            ':carry_forward_balance'=> $data['carry_forward_balance'] ?? 0,
        ]);
        $id = $pdo->lastInsertId();
        http_response_code(201);
        $stmt2 = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
        $stmt2->execute([$id]);
        echo json_encode($stmt2->fetch());
        break;

    case 'PUT':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        // carry_forward_balance は PATCH /carry-forward 専用。通常更新では変更不可
        $fields = ['code','name','name_kana','honorific_type','gender',
                   'postal_code','address1','address2','tel','mobile','fax','email',
                   'memo','billing_name','billing_date_print',
                   'cutoff_day','billing_offset_days','payment_due_days','is_active'];
        $sets = [];
        $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) {
                $sets[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $params[':id'] = $resourceId;
        $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
        $stmt->execute([$resourceId]);
        echo json_encode($stmt->fetch());
        break;

    case 'DELETE':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $pdo->prepare('UPDATE customers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        echo json_encode(['deleted' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
