<?php
/**
 * /projects エンドポイント
 * GET    /projects                    一覧
 * GET    /projects/sync               AccessTategu 連携用 軽量同期 API（R-025 Step A）
 * GET    /projects/{id}               詳細（案件に紐づく伝票一覧・業務時間合計・画像含む）
 * POST   /projects                    新規作成（project_code 自動採番）
 * PUT    /projects/{id}               更新
 * DELETE /projects/{id}               削除（キャンセル扱い）
 * DELETE /projects/{id}?hard=1        完全削除（R-0095、請求書に紐づく伝票がある場合は409）
 * GET    /projects/{id}/images        画像一覧
 * POST   /projects/{id}/images        画像アップロード（multipart/form-data）
 * DELETE /projects/{id}/images/{imgId} 画像削除
 */

$segments = explode('/', trim($path, '/'));
$resourceId  = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subResource = $segments[2] ?? null;
$subId       = isset($segments[3]) && is_numeric($segments[3]) ? (int)$segments[3] : null;

function nextProjectCode(PDO $pdo): string {
    $pdo->prepare('UPDATE sequences SET last_no = last_no + 1 WHERE key = "project"')->execute();
    $row = $pdo->query('SELECT last_no FROM sequences WHERE key = "project"')->fetch();
    return 'P' . str_pad($row['last_no'], 5, '0', STR_PAD_LEFT);
}

require_once __DIR__ . '/sync_helpers.php';
require_once __DIR__ . '/list_helpers.php';
require_once __DIR__ . '/../search_helpers.php';

// --- R-025 Step E-Beaver: AccessTategu からの伝票 push 受信 ---
// POST  /projects/{id}/vouchers/sync                    新規/upsert
// PUT   /projects/{id}/vouchers/{voucher_no}            既存伝票更新
// PATCH /projects/{id}/vouchers/{voucher_no}/shipped    発送済フラグ
// PATCH /projects/{id}/customer                          案件マスタの得意先変更
if ($resourceId && $subResource === 'vouchers') {
    $voucherNo = $segments[3] ?? null;
    $subAction = $segments[4] ?? null;
    if ($method === 'POST' && $voucherNo === 'sync') {
        syncVoucherUpsert($pdo, $resourceId);
        exit;
    }
    if ($method === 'PUT' && $voucherNo) {
        syncVoucherUpdate($pdo, $resourceId, $voucherNo);
        exit;
    }
    if ($method === 'PATCH' && $voucherNo && $subAction === 'shipped') {
        syncVoucherShipped($pdo, $resourceId, $voucherNo);
        exit;
    }
}
if ($resourceId && $subResource === 'customer' && $method === 'PATCH') {
    syncProjectCustomer($pdo, $resourceId);
    exit;
}

// --- R-025 Step A: AccessTategu 連携用 軽量同期 API ---
// GET /projects/sync[?updated_after=ISO8601][&include_cancelled=true][&limit=N][&cursor=ID]
// R-034 (b): 完全一致チェック。`/projects/sync/anything` を全件返却で誤通過させない。
if ($method === 'GET' && isset($segments[1]) && $segments[1] === 'sync' && isset($segments[2])) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found', 'path' => $path]);
    exit;
}
if ($method === 'GET' && isset($segments[1]) && $segments[1] === 'sync' && !isset($segments[2])) {
    $updatedAfterRaw = $_GET['updated_after'] ?? null;
    $updatedAfterSql = null;
    if ($updatedAfterRaw !== null && $updatedAfterRaw !== '') {
        $ts = strtotime($updatedAfterRaw);
        if ($ts === false) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid updated_after format']);
            exit;
        }
        $updatedAfterSql = gmdate('Y-m-d H:i:s', $ts);
    }
    $includeCancelled = isset($_GET['include_cancelled'])
        && in_array(strtolower((string)$_GET['include_cancelled']), ['1', 'true', 'yes'], true);

    // R-035 (a): pagination。デフォルト limit=1000、最大 5000。
    // cursor は since_id 方式（id > cursor の昇順）で、安定したページング順序を確保する。
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;
    if ($limit < 1)   $limit = 1000;
    if ($limit > 5000) $limit = 5000;

    $cursor = null;
    if (isset($_GET['cursor']) && $_GET['cursor'] !== '') {
        if (!is_numeric($_GET['cursor'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid cursor (numeric id required)']);
            exit;
        }
        $cursor = (int)$_GET['cursor'];
    }

    $sql = 'SELECT p.id, p.project_code, p.name,
                   c.access_customer_no AS customer_access_no,
                   p.status, p.delivery_date, p.address, p.updated_at
            FROM projects p
            LEFT JOIN customers c ON c.id = p.customer_id
            WHERE 1=1';
    $params = [];
    if ($updatedAfterSql !== null) {
        $sql .= ' AND p.updated_at > :updated_after';
        $params[':updated_after'] = $updatedAfterSql;
    }
    if ($cursor !== null) {
        $sql .= ' AND p.id > :cursor';
        $params[':cursor'] = $cursor;
    }
    if (!$includeCancelled) {
        $sql .= " AND p.status != 'キャンセル'";
    }
    // cursor pagination の安定性のため id ASC で並べる（updated_at DESC ではページング順が崩れる）
    $sql .= ' ORDER BY p.id ASC LIMIT :limit_plus_one';
    $params[':limit_plus_one'] = $limit + 1; // next_cursor 検出のため +1 件取得

    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $v) {
        $type = ($k === ':limit_plus_one' || $k === ':cursor') ? PDO::PARAM_INT : PDO::PARAM_STR;
        $stmt->bindValue($k, $v, $type);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll();

    $nextCursor = null;
    if (count($rows) > $limit) {
        // limit+1 件目があった場合は次ページが存在する。limit 件のみ返し、最後の id を next_cursor に。
        $rows = array_slice($rows, 0, $limit);
        $lastRow = end($rows);
        if (is_array($lastRow) && isset($lastRow['id'])) {
            $nextCursor = (int)$lastRow['id'];
        }
        reset($rows);
    }

    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $response = [
        'synced_at' => $now->format('c'),
        'projects'  => $rows,
        'total'     => count($rows),
        'limit'     => $limit,
    ];
    if ($nextCursor !== null) {
        $response['next_cursor'] = $nextCursor;
    }
    echo json_encode($response);
    exit;
}

// --- 画像サブリソース ---
if ($resourceId && $subResource === 'images') {
    $uploadDir = __DIR__ . '/../uploads/projects/' . $resourceId . '/';
    switch ($method) {
        case 'GET':
            $stmt = $pdo->prepare('SELECT * FROM project_images WHERE project_id = ? ORDER BY display_order, id');
            $stmt->execute([$resourceId]);
            echo json_encode($stmt->fetchAll());
            exit;

        case 'POST':
            if (empty($_FILES['image'])) {
                http_response_code(400);
                echo json_encode(['error' => 'image file required']);
                exit;
            }
            if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);
            $file     = $_FILES['image'];
            $ext      = pathinfo($file['name'], PATHINFO_EXTENSION);
            $uuid     = bin2hex(random_bytes(8));
            $fileName = $uuid . '_' . basename($file['name']);
            $filePath = 'uploads/projects/' . $resourceId . '/' . $fileName;
            move_uploaded_file($file['tmp_name'], $uploadDir . $fileName);
            $maxOrder = $pdo->query("SELECT COALESCE(MAX(display_order),0) FROM project_images WHERE project_id = $resourceId")->fetchColumn();
            $stmt = $pdo->prepare('INSERT INTO project_images (project_id, file_name, file_path, display_order) VALUES (?,?,?,?)');
            $stmt->execute([$resourceId, $fileName, $filePath, $maxOrder + 1]);
            $imgId = $pdo->lastInsertId();
            http_response_code(201);
            $stmt2 = $pdo->prepare('SELECT * FROM project_images WHERE id = ?');
            $stmt2->execute([$imgId]);
            echo json_encode($stmt2->fetch());
            exit;

        case 'DELETE':
            if (!$subId) { http_response_code(400); echo json_encode(['error' => 'image id required']); exit; }
            $stmt = $pdo->prepare('SELECT * FROM project_images WHERE id = ? AND project_id = ?');
            $stmt->execute([$subId, $resourceId]);
            $img = $stmt->fetch();
            if ($img) {
                $fullPath = __DIR__ . '/../' . $img['file_path'];
                if (file_exists($fullPath)) unlink($fullPath);
                $pdo->prepare('DELETE FROM project_images WHERE id = ?')->execute([$subId]);
            }
            echo json_encode(['deleted' => true]);
            exit;
    }
}

switch ($method) {
    case 'GET':
        if ($resourceId) {
            $stmt = $pdo->prepare('
                SELECT p.*, c.name AS customer_name
                FROM projects p
                LEFT JOIN customers c ON c.id = p.customer_id
                WHERE p.id = ?
            ');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

            $stmt2 = $pdo->prepare('
                SELECT id, voucher_no, voucher_type, status, voucher_date, total_amount, description
                FROM vouchers WHERE project_id = ? ORDER BY voucher_date DESC
            ');
            $stmt2->execute([$resourceId]);
            $row['vouchers'] = $stmt2->fetchAll();

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

            $stmt4 = $pdo->prepare('SELECT * FROM project_images WHERE project_id = ? ORDER BY display_order, id');
            $stmt4->execute([$resourceId]);
            $row['images'] = $stmt4->fetchAll();

            // R-0097: 実効工数目安（見積伝票集計優先・無ければ手動入力）
            $sumHours = $row['estimated_factory_hours'] + $row['estimated_site_hours'];
            $row['effective_estimated_hours'] = effectiveEstimatedHours($sumHours, $row['manual_estimated_hours']);

            echo json_encode($row);
        } else {
            $where = 'WHERE p.status != "キャンセル"';
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
                // R-0091: 検索対象を案件コード・案件名・得意先名に拡張
                [$searchClause, $searchParams] = buildMultiColumnSearchClause(
                    ['p.project_code', 'p.name', 'c.name'],
                    $_GET['q']
                );
                $where .= ' AND ' . $searchClause;
                $params = array_merge($params, $searchParams);
            }
            if (isset($_GET['page'])) {
                $page    = max(1, (int)$_GET['page']);
                $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
                $offset  = ($page - 1) * $perPage;
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM projects p LEFT JOIN customers c ON c.id = p.customer_id $where");
                $cntStmt->execute($params);
                $total = (int)$cntStmt->fetchColumn();
                // R-076 Part A: サーバソート（ホワイトリストは全てハードコード文字列）。
                // 既存動作(updated_at DESC)を維持するためdefaultOrder='DESC'を指定する。
                // tiebreakerはcustomersとの結合でidが曖昧になるためp.idを明示する。
                $sortClause = resolveSortClause(
                    [
                        'project_code'  => 'p.project_code',
                        'name'          => 'p.name',
                        'customer_name' => 'c.name',
                        'status'        => 'ps.sort_order',
                        'start_date'    => 'p.start_date',
                        'delivery_date' => 'p.delivery_date',
                    ],
                    'p.updated_at',
                    'p.id',
                    'DESC'
                );
                $stmt  = $pdo->prepare("
                    SELECT p.*, c.name AS customer_name
                    FROM projects p
                    LEFT JOIN customers c ON c.id = p.customer_id
                    LEFT JOIN project_statuses ps ON ps.name = p.status
                    $where $sortClause LIMIT $perPage OFFSET $offset
                ");
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                // R-0097: 該当ページの案件IDに絞って集計工数を取得し、実効工数目安を付与する
                $hoursMap = fetchEstimatedHoursByProjectIds($pdo, array_column($rows, 'id'));
                foreach ($rows as &$r) {
                    $r['effective_estimated_hours'] = effectiveEstimatedHours($hoursMap[(int)$r['id']] ?? 0, $r['manual_estimated_hours']);
                }
                unset($r);
                echo json_encode([
                    'data' => $rows,
                    'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'last_page' => (int)ceil($total / $perPage)],
                ]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT p.*, c.name AS customer_name
                    FROM projects p
                    LEFT JOIN customers c ON c.id = p.customer_id
                    $where ORDER BY p.updated_at DESC
                ");
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                $hoursMap = fetchEstimatedHoursByProjectIds($pdo, array_column($rows, 'id'));
                foreach ($rows as &$r) {
                    $r['effective_estimated_hours'] = effectiveEstimatedHours($hoursMap[(int)$r['id']] ?? 0, $r['manual_estimated_hours']);
                }
                unset($r);
                echo json_encode($rows);
            }
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $code = nextProjectCode($pdo);
        $stmt = $pdo->prepare('
            INSERT INTO projects (project_code, customer_id, name, description, status, start_date, end_date, delivery_date, address, memo, order_date, owner_name, general_contractor_name, site_contact, manual_estimated_hours)
            VALUES (:project_code, :customer_id, :name, :description, :status, :start_date, :end_date, :delivery_date, :address, :memo, :order_date, :owner_name, :general_contractor_name, :site_contact, :manual_estimated_hours)
        ');
        $stmt->execute([
            ':project_code'              => $code,
            ':customer_id'               => $data['customer_id'] ?? null,
            ':name'                      => $data['name'] ?? '',
            ':description'               => $data['description'] ?? null,
            ':status'                    => $data['status'] ?? '問い合わせ',
            ':start_date'                => $data['start_date'] ?? null,
            ':end_date'                  => $data['end_date'] ?? null,
            ':delivery_date'             => $data['delivery_date'] ?? null,
            ':address'                   => $data['address'] ?? null,
            ':memo'                      => $data['memo'] ?? null,
            ':order_date'                => $data['order_date'] ?? null,
            ':owner_name'                => $data['owner_name'] ?? null,
            ':general_contractor_name'   => $data['general_contractor_name'] ?? null,
            ':site_contact'              => $data['site_contact'] ?? null,
            ':manual_estimated_hours'    => $data['manual_estimated_hours'] ?? null,
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
        $fields = ['customer_id','name','description','status','start_date','end_date','delivery_date','address','memo','order_date','owner_name','general_contractor_name','site_contact','manual_estimated_hours'];
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
        if (isset($_GET['hard']) && $_GET['hard'] === '1') {
            require_once __DIR__ . '/project_delete_helpers.php';
            $result = hardDeleteProject($pdo, $resourceId);
            http_response_code($result['code']);
            echo json_encode($result['body']);
            break;
        }
        $pdo->prepare('UPDATE projects SET status = "キャンセル", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        echo json_encode(['cancelled' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
