<?php
/**
 * /tategu-items エンドポイント
 * GET    /tategu-items                    一覧
 * GET    /tategu-items/{id}               詳細（追加工程・使用履歴含む）
 * POST   /tategu-items                    新規作成
 * PUT    /tategu-items/{id}               更新
 * POST   /tategu-items/{id}/reload-cost   catalog-systemから原価再取得（スタブ）
 * POST   /tategu-items/{id}/additions     追加工程追加
 * PUT    /tategu-items/{id}/additions/{addId}   追加工程更新
 * DELETE /tategu-items/{id}/additions/{addId}   追加工程削除
 * PUT    /tategu-items/{id}/cost-breakdown      集計区分別内訳の全件入れ替え
 */

require_once __DIR__ . '/list_helpers.php';
require_once dirname(__DIR__) . '/search_helpers.php';
require_once __DIR__ . '/sync_helpers.php';

$segments = explode('/', trim($path, '/'));
$resourceId  = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subAction   = $segments[2] ?? null;   // 'reload-cost' | 'additions'
$subId       = isset($segments[3]) && is_numeric($segments[3]) ? (int)$segments[3] : null;

function normalizeTateguCode($code): ?string {
    if ($code === null || $code === '') return null;
    if (!is_numeric($code)) return null;
    return str_pad((string)(int)$code, 5, '0', STR_PAD_LEFT);
}

function tateguSyncRow(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM tategu_items WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $stmt = $pdo->prepare('SELECT * FROM tategu_item_cost_lines WHERE tategu_item_id = ? ORDER BY sort_order, id');
    $stmt->execute([$id]);
    $row['cost_lines'] = $stmt->fetchAll();
    $stmt = $pdo->prepare('SELECT * FROM tategu_item_labor_lines WHERE tategu_item_id = ? ORDER BY sort_order, id');
    $stmt->execute([$id]);
    $row['labor_lines'] = $stmt->fetchAll();
    $row['updated_at'] = utcToJst($row['updated_at']);
    return $row;
}

function validateTateguUnitCosts(array $lines): ?array {
    foreach ($lines as $index => $line) {
        $value = $line['unit_cost'] ?? 0;
        if (!is_numeric($value) || (float)$value != (int)$value) {
            return ['error' => 'unit_cost_fraction', 'line_no' => $index + 1];
        }
    }
    return null;
}

function replaceTateguSyncLines(PDO $pdo, int $id, array $data): void {
    if (array_key_exists('cost_lines', $data)) {
        $pdo->prepare('DELETE FROM tategu_item_cost_lines WHERE tategu_item_id = ?')->execute([$id]);
        $ins = $pdo->prepare('INSERT INTO tategu_item_cost_lines
            (tategu_item_id, category_code, name, quantity, unit_cost, amount, source, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        foreach ($data['cost_lines'] as $i => $line) {
            $quantity = (float)($line['quantity'] ?? 0);
            $unitCost = (int)($line['unit_cost'] ?? 0);
            $ins->execute([$id, $line['category_code'] ?? '', $line['name'] ?? '', $quantity, $unitCost,
                array_key_exists('amount', $line) ? (float)$line['amount'] : $quantity * $unitCost,
                $line['source'] ?? 'manual', $line['sort_order'] ?? $i]);
        }
    }
    if (array_key_exists('labor_lines', $data)) {
        $pdo->prepare('DELETE FROM tategu_item_labor_lines WHERE tategu_item_id = ?')->execute([$id]);
        $ins = $pdo->prepare('INSERT INTO tategu_item_labor_lines
            (tategu_item_id, process_name, category_code, work_hours, labor_rate, amount, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?)');
        foreach ($data['labor_lines'] as $i => $line) {
            $hours = (float)($line['work_hours'] ?? 0);
            $rate = (float)($line['labor_rate'] ?? 0);
            $ins->execute([$id, $line['process_name'] ?? '', $line['category_code'] ?? '', $hours, $rate,
                array_key_exists('amount', $line) ? (float)$line['amount'] : $hours * $rate, $line['sort_order'] ?? $i]);
        }
    }
    recalcTateguCost($pdo, $id, true);
}

function writeTateguSync(PDO $pdo, array $data, ?int $id = null): int {
    $code = normalizeTateguCode($data['code'] ?? null);
    if ($id === null) {
        $stmt = $pdo->prepare('INSERT INTO tategu_items (code, name, description, status, building_image_path)
            VALUES (?, ?, ?, ?, ?)');
        $stmt->execute([$code, $data['name'] ?? '', $data['description'] ?? null,
            $data['status'] ?? 'active', $data['building_image_path'] ?? null]);
        $id = (int)$pdo->lastInsertId();
    } else {
        $stmt = $pdo->prepare('UPDATE tategu_items SET code = COALESCE(?, code), name = ?, description = ?, status = ?,
            building_image_path = COALESCE(?, building_image_path), updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        $stmt->execute([$code, $data['name'] ?? '', $data['description'] ?? null,
            $data['status'] ?? 'active', $data['building_image_path'] ?? null, $id]);
    }
    replaceTateguSyncLines($pdo, $id, $data);
    $pdo->prepare('UPDATE tategu_items SET last_synced_at = updated_at WHERE id = ?')->execute([$id]);
    return $id;
}

// R-0200: 製品台帳同期API。
if (($segments[1] ?? null) === 'sync' && $method === 'GET') {
    $since = isset($_GET['since']) ? jstToUtc((string)$_GET['since']) : '1970-01-01 00:00:00';
    if ($since === null) { respond(400, ['error' => 'Invalid since']); exit; }
    $limit = min(500, max(1, (int)($_GET['limit'] ?? 100)));
    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $stmt = $pdo->prepare('SELECT id FROM tategu_items WHERE updated_at > ? ORDER BY updated_at, id LIMIT ? OFFSET ?');
    $stmt->bindValue(1, $since); $stmt->bindValue(2, $limit, PDO::PARAM_INT); $stmt->bindValue(3, $offset, PDO::PARAM_INT);
    $stmt->execute();
    respond(200, ['data' => array_map(fn($r) => tateguSyncRow($pdo, (int)$r['id']), $stmt->fetchAll())]);
    exit;
}
if (($segments[1] ?? null) === 'sync' && ($segments[2] ?? null) === 'bulk' && $method === 'POST') {
    $data = readJsonBody(); $items = $data['items'] ?? [];
    if (!is_array($items) || count($items) > 500) { respond(400, ['error' => 'invalid_bulk']); exit; }
    $pdo->beginTransaction();
    try {
        $result = [];
        foreach ($items as $item) {
            $code = normalizeTateguCode($item['code'] ?? null);
            if ($code === null) throw new InvalidArgumentException('code_required');
            $error = validateTateguUnitCosts($item['cost_lines'] ?? []); if ($error) throw new InvalidArgumentException('unit_cost_fraction');
            $stmt = $pdo->prepare('SELECT id FROM tategu_items WHERE CAST(code AS INTEGER) = ?'); $stmt->execute([(int)$code]);
            $id = $stmt->fetchColumn(); $id = writeTateguSync($pdo, $item, $id ? (int)$id : null);
            $result[] = tateguSyncRow($pdo, $id);
        }
        $pdo->commit(); respond(200, ['data' => $result]);
    } catch (InvalidArgumentException $e) { $pdo->rollBack(); respond(400, ['error' => $e->getMessage()]); }
    exit;
}
if (($segments[1] ?? null) === 'sync' && $method === 'POST') {
    $data = readJsonBody(); $code = normalizeTateguCode($data['code'] ?? null);
    if ($code === null) { respond(400, ['error' => 'code_required']); exit; }
    if ($error = validateTateguUnitCosts($data['cost_lines'] ?? [])) { respond(400, $error); exit; }
    $stmt = $pdo->prepare('SELECT id FROM tategu_items WHERE CAST(code AS INTEGER) = ?'); $stmt->execute([(int)$code]);
    if ($id = $stmt->fetchColumn()) { respond(200, tateguSyncRow($pdo, (int)$id)); exit; }
    $pdo->beginTransaction();
    try { $id = writeTateguSync($pdo, $data); $pdo->commit(); respond(201, tateguSyncRow($pdo, $id)); }
    catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    exit;
}
if ($resourceId && $subAction === 'sync' && $method === 'PUT') {
    $data = readJsonBody();
    $base = isset($data['base_synced_at']) ? jstToUtc((string)$data['base_synced_at']) : null;
    if ($base === null) { respond(400, ['error' => 'base_synced_at_required']); exit; }
    $stmt = $pdo->prepare('SELECT updated_at FROM tategu_items WHERE id = ?'); $stmt->execute([$resourceId]); $updated = $stmt->fetchColumn();
    if (!$updated) { respond(404, ['error' => 'not_found']); exit; }
    if ($updated > $base) { respond(409, ['error' => 'product_conflict', 'product' => tateguSyncRow($pdo, $resourceId)]); exit; }
    if ($error = validateTateguUnitCosts($data['cost_lines'] ?? [])) { respond(400, $error); exit; }
    $pdo->beginTransaction();
    try { writeTateguSync($pdo, $data, $resourceId); $pdo->commit(); respond(200, tateguSyncRow($pdo, $resourceId)); }
    catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    exit;
}
if ($resourceId && $subAction === 'access-link' && $method === 'PATCH') {
    $data = readJsonBody(); $code = normalizeTateguCode($data['code'] ?? null);
    if ($code === null) { respond(400, ['error' => 'code_required']); exit; }
    $stmt = $pdo->prepare('SELECT id FROM tategu_items WHERE CAST(code AS INTEGER) = ? AND id <> ?'); $stmt->execute([(int)$code, $resourceId]);
    if ($stmt->fetchColumn()) { respond(409, ['error' => 'code_conflict']); exit; }
    $stmt = $pdo->prepare('SELECT code FROM tategu_items WHERE id = ?'); $stmt->execute([$resourceId]); $current = $stmt->fetchColumn();
    if ($current !== false && $current !== null && normalizeTateguCode($current) !== $code) { respond(409, ['error' => 'code_conflict']); exit; }
    $pdo->prepare('UPDATE tategu_items SET code = ?, updated_at = CURRENT_TIMESTAMP, last_synced_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$code, $resourceId]);
    respond(200, tateguSyncRow($pdo, $resourceId)); exit;
}
if ($resourceId && $subAction === 'drawing') {
    $stmt = $pdo->prepare('SELECT building_image_path FROM tategu_items WHERE id = ?');
    $stmt->execute([$resourceId]); $filename = $stmt->fetchColumn();
    if ($filename === false) { respond(404, ['error' => 'not_found']); exit; }
    $dir = dirname(__DIR__) . '/uploads/tategu/' . $resourceId;
    if ($method === 'GET') {
        $file = $filename ? $dir . '/' . basename((string)$filename) : '';
        if (!$filename || !is_file($file)) { respond(404, ['error' => 'drawing_not_found']); exit; }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file);
        header('Content-Type: ' . $mime); header('Content-Length: ' . filesize($file)); readfile($file); exit;
    }
    if ($method === 'POST') {
        $upload = $_FILES['file'] ?? null;
        if (!$upload || ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) { respond(400, ['error' => 'file_required']); exit; }
        if ((int)$upload['size'] > 10 * 1024 * 1024) { respond(400, ['error' => 'file_too_large']); exit; }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->file($upload['tmp_name']);
        $ext = ['image/jpeg' => 'jpg', 'image/png' => 'png'][$mime] ?? null;
        if ($ext === null) { respond(400, ['error' => 'invalid_image_type']); exit; }
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) throw new RuntimeException('drawing directory create failed');
        $deny = dirname($dir) . '/.htaccess';
        if (!is_file($deny)) file_put_contents($deny, "Require all denied
");
        foreach (glob($dir . '/*') ?: [] as $old) { if (is_file($old)) unlink($old); }
        $newName = 'drawing.' . $ext; $target = $dir . '/' . $newName;
        if (!move_uploaded_file($upload['tmp_name'], $target)) throw new RuntimeException('drawing move failed');
        $hash = hash_file('sha256', $target);
        $pdo->prepare('UPDATE tategu_items SET building_image_path = ?, drawing_sha256 = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$newName, $hash, $resourceId]);
        respond(200, tateguSyncRow($pdo, $resourceId)); exit;
    }
    if ($method === 'DELETE') {
        foreach (glob($dir . '/*') ?: [] as $old) { if (is_file($old)) unlink($old); }
        $pdo->prepare('UPDATE tategu_items SET building_image_path = NULL, drawing_sha256 = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        respond(200, ['deleted' => true]); exit;
    }
}

// --- 原価合計を計算して tategu_items を更新するヘルパー ---
function recalcTateguCost(PDO $pdo, int $id, bool $forceLineRecalc = false): void {
    $countStmt = $pdo->prepare('
        SELECT
            (SELECT COUNT(*) FROM tategu_item_cost_lines WHERE tategu_item_id = ?) +
            (SELECT COUNT(*) FROM tategu_item_labor_lines WHERE tategu_item_id = ?)
    ');
    $countStmt->execute([$id, $id]);
    $lineCount = (int)$countStmt->fetchColumn();

    if (!$forceLineRecalc && $lineCount === 0) {
        $pdo->prepare('UPDATE tategu_items SET cost_snapshot_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$id]);
        return;
    }

    $costs = ['MAIN' => 0.0, 'HARDWARE' => 0.0, 'GLASS' => 0.0];
    $costStmt = $pdo->prepare('
        SELECT category_code, COALESCE(SUM(amount), 0) AS amount
        FROM tategu_item_cost_lines
        WHERE tategu_item_id = ?
        GROUP BY category_code
    ');
    $costStmt->execute([$id]);
    foreach ($costStmt->fetchAll() as $row) {
        if (array_key_exists($row['category_code'], $costs)) {
            $costs[$row['category_code']] = (float)$row['amount'];
        }
    }

    $hours = ['FACTORY_TIME' => 0.0, 'SITE_TIME' => 0.0];
    $laborAmount = 0.0;
    $totalHours = 0.0;
    $laborStmt = $pdo->prepare('
        SELECT
            category_code,
            COALESCE(SUM(work_hours), 0) AS work_hours,
            COALESCE(SUM(amount), 0) AS amount
        FROM tategu_item_labor_lines
        WHERE tategu_item_id = ?
        GROUP BY category_code
    ');
    $laborStmt->execute([$id]);
    foreach ($laborStmt->fetchAll() as $row) {
        $workHours = (float)$row['work_hours'];
        $amount = (float)$row['amount'];
        if (array_key_exists($row['category_code'], $hours)) {
            $hours[$row['category_code']] = $workHours;
        }
        $totalHours += $workHours;
        $laborAmount += $amount;
    }
    $laborRate = $totalHours > 0 ? $laborAmount / $totalHours : 0;

    $pdo->prepare('
        UPDATE tategu_items SET
            cost_body = :cost_body,
            cost_hardware = :cost_hardware,
            cost_glass = :cost_glass,
            cost_factory_hours = :cost_factory_hours,
            cost_site_hours = :cost_site_hours,
            cost_labor_rate = :cost_labor_rate,
            cost_snapshot_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ')->execute([
        ':cost_body'          => $costs['MAIN'],
        ':cost_hardware'      => $costs['HARDWARE'],
        ':cost_glass'         => $costs['GLASS'],
        ':cost_factory_hours' => $hours['FACTORY_TIME'],
        ':cost_site_hours'    => $hours['SITE_TIME'],
        ':cost_labor_rate'    => $laborRate,
        ':id'                 => $id,
    ]);
}

switch ($method) {
    case 'GET':
        if ($resourceId) {
            $stmt = $pdo->prepare('SELECT * FROM tategu_items WHERE id = ?');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

            // 追加工程
            $stmt2 = $pdo->prepare('SELECT * FROM tategu_item_additions WHERE tategu_item_id = ? ORDER BY line_no');
            $stmt2->execute([$resourceId]);
            $row['additions'] = $stmt2->fetchAll();

            // 原価合計（本体 + additions）
            $row['total_cost'] = (
                (float)$row['cost_body'] + (float)$row['cost_hardware'] + (float)$row['cost_glass']
                + ((float)$row['cost_factory_hours'] + (float)$row['cost_site_hours']) * (float)$row['cost_labor_rate']
            );
            foreach ($row['additions'] as $a) {
                $row['total_cost'] += (float)$a['cost_body'] + (float)$a['cost_hardware'] + (float)$a['cost_glass']
                    + ((float)$a['cost_factory_hours'] + (float)$a['cost_site_hours']) * (float)$a['cost_labor_rate'];
            }

            // 集計区分別内訳
            $stmt_bd = $pdo->prepare('SELECT * FROM tategu_item_cost_breakdown WHERE tategu_item_id = ? ORDER BY sort_order, id');
            $stmt_bd->execute([$resourceId]);
            $row['cost_breakdown'] = $stmt_bd->fetchAll();

            $stmt_cost_lines = $pdo->prepare('SELECT * FROM tategu_item_cost_lines WHERE tategu_item_id = ? ORDER BY sort_order, id');
            $stmt_cost_lines->execute([$resourceId]);
            $row['cost_lines'] = $stmt_cost_lines->fetchAll();

            $stmt_labor_lines = $pdo->prepare('SELECT * FROM tategu_item_labor_lines WHERE tategu_item_id = ? ORDER BY sort_order, id');
            $stmt_labor_lines->execute([$resourceId]);
            $row['labor_lines'] = $stmt_labor_lines->fetchAll();

            // 使用履歴
            $stmt3 = $pdo->prepare('
                SELECT vl.id, v.voucher_no, v.voucher_type, v.voucher_date, v.status,
                       vl.line_total, vl.quantity,
                       p.name AS project_name, c.name AS customer_name
                FROM voucher_lines vl
                JOIN vouchers v ON v.id = vl.voucher_id
                LEFT JOIN projects p ON p.id = v.project_id
                LEFT JOIN customers c ON c.id = v.customer_id
                WHERE vl.tategu_item_id = ?
                ORDER BY v.voucher_date DESC
                LIMIT 50
            ');
            $stmt3->execute([$resourceId]);
            $row['usage_history'] = $stmt3->fetchAll();

            echo json_encode($row);
        } else {
            $where = 'WHERE 1=1';
            $params = [];
            if (!empty($_GET['q'])) {
                [$searchClause, $searchParams] = buildMultiColumnSearchClause(
                    ['name', 'code', 'description'],
                    $_GET['q']
                );
                $where .= ' AND ' . $searchClause;
                $params = array_merge($params, $searchParams);
            }
            if (!isset($_GET['include_archived'])) {
                $where .= ' AND status = "active"';
            }
            if (isset($_GET['page'])) {
                $page    = max(1, (int)$_GET['page']);
                $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
                $offset  = ($page - 1) * $perPage;
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM tategu_items $where");
                $cntStmt->execute($params);
                $total = (int)$cntStmt->fetchColumn();
                // R-076 Part A: サーバソート（ホワイトリストは全てハードコード文字列）。
                // total_costは原価合計のSQL式（GET詳細のtotal_cost計算とPHP側で同一の式）。
                // 既存動作(code DESC)を維持するためdefaultOrder='DESC'を指定する。
                $sortClause = resolveSortClause(
                    [
                        'code' => 'code',
                        'name' => 'name',
                        'total_cost' => '(cost_body + cost_hardware + cost_glass + (cost_factory_hours + cost_site_hours) * cost_labor_rate)',
                    ],
                    'code',
                    'id',
                    'DESC'
                );
                $stmt  = $pdo->prepare("SELECT * FROM tategu_items $where $sortClause LIMIT $perPage OFFSET $offset");
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$row) {
                    $row['total_cost'] = (float)$row['cost_body'] + (float)$row['cost_hardware'] + (float)$row['cost_glass']
                        + ((float)$row['cost_factory_hours'] + (float)$row['cost_site_hours']) * (float)$row['cost_labor_rate'];
                }
                echo json_encode([
                    'data' => $rows,
                    'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'last_page' => (int)ceil($total / $perPage)],
                ]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM tategu_items $where ORDER BY code DESC");
                $stmt->execute($params);
                $rows = $stmt->fetchAll();
                foreach ($rows as &$row) {
                    $row['total_cost'] = (float)$row['cost_body'] + (float)$row['cost_hardware'] + (float)$row['cost_glass']
                        + ((float)$row['cost_factory_hours'] + (float)$row['cost_site_hours']) * (float)$row['cost_labor_rate'];
                }
                echo json_encode($rows);
            }
        }
        break;

    case 'POST':
        if ($resourceId && $subAction === 'additions') {
            // 追加工程追加
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(line_no), 0) + 1 FROM tategu_item_additions WHERE tategu_item_id = ?');
            $maxStmt->execute([$resourceId]);
            $lineNo = (int)$maxStmt->fetchColumn();
            $stmt = $pdo->prepare('
                INSERT INTO tategu_item_additions
                    (tategu_item_id, line_no, line_type, catalog_item_id, name,
                     cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate, memo)
                VALUES
                    (:tategu_item_id, :line_no, :line_type, :catalog_item_id, :name,
                     :cost_body, :cost_hardware, :cost_glass, :cost_factory_hours, :cost_site_hours, :cost_labor_rate, :memo)
            ');
            $stmt->execute([
                ':tategu_item_id'    => $resourceId,
                ':line_no'           => $lineNo,
                ':line_type'         => $data['line_type'] ?? 'manual',
                ':catalog_item_id'   => $data['catalog_item_id'] ?? null,
                ':name'              => $data['name'] ?? '',
                ':cost_body'         => $data['cost_body'] ?? 0,
                ':cost_hardware'     => $data['cost_hardware'] ?? 0,
                ':cost_glass'        => $data['cost_glass'] ?? 0,
                ':cost_factory_hours'=> $data['cost_factory_hours'] ?? 0,
                ':cost_site_hours'   => $data['cost_site_hours'] ?? 0,
                ':cost_labor_rate'   => $data['cost_labor_rate'] ?? 0,
                ':memo'              => $data['memo'] ?? null,
            ]);
            $addId = $pdo->lastInsertId();
            recalcTateguCost($pdo, $resourceId);
            http_response_code(201);
            $s = $pdo->prepare('SELECT * FROM tategu_item_additions WHERE id = ?');
            $s->execute([$addId]);
            echo json_encode($s->fetch());
            break;
        }
        if ($resourceId && $subAction === 'reload-cost') {
            // catalog-system から原価再取得（Phase 3で実装。現在はスタブ）
            echo json_encode(['message' => 'catalog-system連携は未実装（Phase 3）']);
            break;
        }
        // 新規作成
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $data['code'] = normalizeTateguCode($data['code'] ?? null);
        $stmt = $pdo->prepare('
            INSERT INTO tategu_items
                (code, name, description, base_catalog_item_id, status,
                 cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate)
            VALUES
                (:code, :name, :description, :base_catalog_item_id, :status,
                 :cost_body, :cost_hardware, :cost_glass, :cost_factory_hours, :cost_site_hours, :cost_labor_rate)
        ');
        $stmt->execute([
            ':code'                => $data['code'],
            ':name'                => $data['name'] ?? '',
            ':description'         => $data['description'] ?? null,
            ':base_catalog_item_id'=> $data['base_catalog_item_id'] ?? null,
            ':status'              => $data['status'] ?? 'active',
            ':cost_body'           => $data['cost_body'] ?? 0,
            ':cost_hardware'       => $data['cost_hardware'] ?? 0,
            ':cost_glass'          => $data['cost_glass'] ?? 0,
            ':cost_factory_hours'  => $data['cost_factory_hours'] ?? 0,
            ':cost_site_hours'     => $data['cost_site_hours'] ?? 0,
            ':cost_labor_rate'     => $data['cost_labor_rate'] ?? 0,
        ]);
        $id = $pdo->lastInsertId();
        http_response_code(201);
        $s = $pdo->prepare('SELECT * FROM tategu_items WHERE id = ?');
        $s->execute([$id]);
        echo json_encode($s->fetch());
        break;

    case 'PUT':
        if ($resourceId && $subAction === 'cost-lines') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $lines = $data['lines'] ?? [];
            if ($error = validateTateguUnitCosts($lines)) { respond(400, $error); break; }
            $pdo->beginTransaction();
            try {
                $pdo->prepare("DELETE FROM tategu_item_cost_lines WHERE tategu_item_id = ? AND source <> 'wood_calc'")->execute([$resourceId]);
                $ins = $pdo->prepare('
                    INSERT INTO tategu_item_cost_lines
                        (tategu_item_id, category_code, name, quantity, unit_cost, amount, source, sort_order)
                    VALUES
                        (:tategu_item_id, :category_code, :name, :quantity, :unit_cost, :amount, :source, :sort_order)
                ');
                foreach ($lines as $i => $line) {
                    if (($line['source'] ?? 'manual') === 'wood_calc') continue;
                    $quantity = (float)($line['quantity'] ?? 0);
                    $unitCost = (float)($line['unit_cost'] ?? 0);
                    $source = $line['source'] ?? 'manual';
                    if (!in_array($source, ['manual', 'wood_calc'], true)) {
                        $source = 'manual';
                    }
                    $ins->execute([
                        ':tategu_item_id' => $resourceId,
                        ':category_code'  => $line['category_code'] ?? '',
                        ':name'           => $line['name'] ?? '',
                        ':quantity'       => $quantity,
                        ':unit_cost'      => $unitCost,
                        ':amount'         => array_key_exists('amount', $line) ? (float)$line['amount'] : $quantity * $unitCost,
                        ':source'         => $source,
                        ':sort_order'     => $line['sort_order'] ?? $i,
                    ]);
                }
                recalcTateguCost($pdo, $resourceId, true);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            echo json_encode(['ok' => true]);
            break;
        }
        if ($resourceId && $subAction === 'labor-lines') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $lines = $data['lines'] ?? [];
            $pdo->beginTransaction();
            try {
                $pdo->prepare('DELETE FROM tategu_item_labor_lines WHERE tategu_item_id = ?')->execute([$resourceId]);
                $ins = $pdo->prepare('
                    INSERT INTO tategu_item_labor_lines
                        (tategu_item_id, process_name, category_code, work_hours, labor_rate, amount, sort_order)
                    VALUES
                        (:tategu_item_id, :process_name, :category_code, :work_hours, :labor_rate, :amount, :sort_order)
                ');
                foreach ($lines as $i => $line) {
                    $workHours = (float)($line['work_hours'] ?? 0);
                    $laborRate = (float)($line['labor_rate'] ?? 0);
                    $ins->execute([
                        ':tategu_item_id' => $resourceId,
                        ':process_name'   => $line['process_name'] ?? '',
                        ':category_code'  => $line['category_code'] ?? '',
                        ':work_hours'     => $workHours,
                        ':labor_rate'     => $laborRate,
                        ':amount'         => array_key_exists('amount', $line) ? (float)$line['amount'] : $workHours * $laborRate,
                        ':sort_order'     => $line['sort_order'] ?? $i,
                    ]);
                }
                recalcTateguCost($pdo, $resourceId, true);
                $pdo->commit();
            } catch (Throwable $e) {
                $pdo->rollBack();
                throw $e;
            }
            echo json_encode(['ok' => true]);
            break;
        }
        if ($resourceId && $subAction === 'cost-breakdown') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $lines = $data['lines'] ?? [];
            $pdo->prepare('DELETE FROM tategu_item_cost_breakdown WHERE tategu_item_id = ?')->execute([$resourceId]);
            $ins = $pdo->prepare('
                INSERT INTO tategu_item_cost_breakdown
                    (tategu_item_id, category_code, category_name, measure_type, value, sort_order)
                VALUES
                    (:tategu_item_id, :category_code, :category_name, :measure_type, :value, :sort_order)
            ');
            foreach ($lines as $i => $line) {
                $ins->execute([
                    ':tategu_item_id' => $resourceId,
                    ':category_code'  => $line['category_code'] ?? '',
                    ':category_name'  => $line['category_name'] ?? '',
                    ':measure_type'   => $line['measure_type'] ?? 'money',
                    ':value'          => $line['value'] ?? 0,
                    ':sort_order'     => $line['sort_order'] ?? $i,
                ]);
            }
            echo json_encode(['ok' => true]);
            break;
        }
        if ($resourceId && $subAction === 'additions' && $subId) {
            // 追加工程更新
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $fields = ['line_type','catalog_item_id','name',
                       'cost_body','cost_hardware','cost_glass',
                       'cost_factory_hours','cost_site_hours','cost_labor_rate','memo'];
            $sets = []; $params = [];
            foreach ($fields as $f) {
                if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
            }
            if (!empty($sets)) {
                $params[':id'] = $subId;
                $pdo->prepare('UPDATE tategu_item_additions SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
                recalcTateguCost($pdo, $resourceId);
            }
            $s = $pdo->prepare('SELECT * FROM tategu_item_additions WHERE id = ?');
            $s->execute([$subId]);
            echo json_encode($s->fetch());
            break;
        }
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = ['code','name','description','base_catalog_item_id','base_catalog_item_name','status',
                   'cost_body','cost_hardware','cost_glass',
                   'cost_factory_hours','cost_site_hours','cost_labor_rate'];
        $sets = []; $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $params[':id'] = $resourceId;
        $pdo->prepare('UPDATE tategu_items SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        $s = $pdo->prepare('SELECT * FROM tategu_items WHERE id = ?');
        $s->execute([$resourceId]);
        echo json_encode($s->fetch());
        break;

    case 'DELETE':
        if ($resourceId && $subAction === 'additions' && $subId) {
            $pdo->prepare('DELETE FROM tategu_item_additions WHERE id = ?')->execute([$subId]);
            recalcTateguCost($pdo, $resourceId);
            echo json_encode(['deleted' => true]);
            break;
        }
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $pdo->prepare('UPDATE tategu_items SET status = "archived", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        echo json_encode(['archived' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
