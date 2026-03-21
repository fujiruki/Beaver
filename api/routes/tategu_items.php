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

$segments = explode('/', trim($path, '/'));
$resourceId  = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subAction   = $segments[2] ?? null;   // 'reload-cost' | 'additions'
$subId       = isset($segments[3]) && is_numeric($segments[3]) ? (int)$segments[3] : null;

// --- 原価合計を計算して tategu_items を更新するヘルパー ---
function recalcTateguCost(PDO $pdo, int $id): void {
    $stmt = $pdo->prepare('
        SELECT
            COALESCE(SUM(cost_body), 0)          AS body,
            COALESCE(SUM(cost_hardware), 0)       AS hardware,
            COALESCE(SUM(cost_glass), 0)          AS glass,
            COALESCE(SUM(cost_factory_hours), 0)  AS factory_h,
            COALESCE(SUM(cost_site_hours), 0)     AS site_h,
            MAX(cost_labor_rate)                  AS labor_rate
        FROM tategu_item_additions WHERE tategu_item_id = ?
    ');
    $stmt->execute([$id]);
    $add = $stmt->fetch();

    // 台帳本体の base 原価を取得
    $base = $pdo->prepare('SELECT cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate FROM tategu_items WHERE id = ?');
    $base->execute([$id]);
    $b = $base->fetch();

    // 台帳本体の値はそのまま維持し、additions の合計は別保管ではなく
    // 台帳フィールドを additions の合算で上書きする設計ではない（台帳自体を直接編集する）
    // ここでは cost_snapshot_at だけ更新
    $pdo->prepare('UPDATE tategu_items SET cost_snapshot_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        ->execute([$id]);
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
                $where .= ' AND (name LIKE ? OR code LIKE ?)';
                $q = '%' . $_GET['q'] . '%';
                $params[] = $q; $params[] = $q;
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
                $stmt  = $pdo->prepare("SELECT * FROM tategu_items $where ORDER BY code DESC LIMIT $perPage OFFSET $offset");
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
        // 台帳番号を自動採番（5桁ゼロ埋め）
        if (empty($data['code'])) {
            $maxStmt = $pdo->query('SELECT COALESCE(MAX(CAST(code AS INTEGER)), 0) + 1 FROM tategu_items');
            $data['code'] = str_pad((string)$maxStmt->fetchColumn(), 5, '0', STR_PAD_LEFT);
        }
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
