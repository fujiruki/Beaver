<?php
/**
 * /vouchers エンドポイント
 * GET    /vouchers                        一覧
 * GET    /vouchers/{id}                   詳細（明細含む）
 * POST   /vouchers                        新規作成（ヘッダーのみ。明細は /lines で）
 * PUT    /vouchers/{id}                   ヘッダー更新
 * DELETE /vouchers/{id}                   void（無効化）
 * POST   /vouchers/{id}/convert-to-sales  見積→売上変換（ディープコピー）
 * POST   /vouchers/{id}/reload-snapshots  スナップショット一括再読み込み
 * GET    /vouchers/{id}/lines             明細一覧
 * POST   /vouchers/{id}/lines             明細追加
 * PUT    /vouchers/{id}/lines/{lineId}    明細更新
 * DELETE /vouchers/{id}/lines/{lineId}    明細削除
 */

$segments   = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subAction  = $segments[2] ?? null;
$subId      = isset($segments[3]) && is_numeric($segments[3]) ? (int)$segments[3] : null;

// --- 伝票番号採番 ---
function nextVoucherNo(PDO $pdo, string $type): string {
    $pdo->beginTransaction();
    $key = ($type === 'estimate') ? 'estimate' : 'sales';
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = ?');
    $stmt->execute([$key]);
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = ?')->execute([$no, $key]);
    $pdo->commit();
    $prefix = ($type === 'estimate') ? 'E' : 'S';
    return $prefix . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

// --- 伝票合計を再計算して vouchers を更新 ---
function recalcVoucher(PDO $pdo, int $voucherId): void {
    $stmt = $pdo->prepare('SELECT tax_input_type FROM vouchers WHERE id = ?');
    $stmt->execute([$voucherId]);
    $v = $stmt->fetch();

    // 現在適用税率を取得
    $taxStmt = $pdo->query('SELECT rate FROM tax_rates ORDER BY valid_from DESC LIMIT 1');
    $taxRate = (float)$taxStmt->fetchColumn();

    // 明細集計
    $lStmt = $pdo->prepare('SELECT line_type, line_total, tax_category FROM voucher_lines WHERE voucher_id = ?');
    $lStmt->execute([$voucherId]);
    $lines = $lStmt->fetchAll();

    $taxable    = 0;
    $nontaxable = 0;
    $discount   = 0;

    foreach ($lines as $l) {
        $amt = (float)$l['line_total'];
        if ($l['line_type'] === 'discount') {
            $discount += $amt;
        } elseif ($l['tax_category'] === '課税') {
            $taxable += $amt;
        } else {
            $nontaxable += $amt;
        }
    }

    // 税抜ベースに統一
    if ($v['tax_input_type'] === 'inclusive') {
        $taxable    = round($taxable    / (1 + $taxRate));
        $nontaxable = round($nontaxable / (1 + $taxRate));
        $discount   = round($discount   / (1 + $taxRate));
    }

    $taxAmount = floor($taxable * $taxRate);
    $total     = $taxable + $nontaxable - $discount + $taxAmount;

    $pdo->prepare('
        UPDATE vouchers SET
            subtotal_taxable = ?, subtotal_nontaxable = ?, subtotal_discount = ?,
            tax_amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ')->execute([$taxable, $nontaxable, $discount, $taxAmount, $total, $voucherId]);
}

// --- 明細行に建具台帳スナップショットをロード ---
function loadSnapshot(PDO $pdo, int $lineId): void {
    $stmt = $pdo->prepare('SELECT tategu_item_id FROM voucher_lines WHERE id = ?');
    $stmt->execute([$lineId]);
    $tId = $stmt->fetchColumn();
    if (!$tId) return;

    $t = $pdo->prepare('SELECT cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate FROM tategu_items WHERE id = ?');
    $t->execute([$tId]);
    $costs = $t->fetch();
    if (!$costs) return;

    $pdo->prepare('
        UPDATE voucher_lines SET
            cost_body = :cost_body, cost_hardware = :cost_hardware, cost_glass = :cost_glass,
            cost_factory_hours = :cost_factory_hours, cost_site_hours = :cost_site_hours,
            cost_labor_rate = :cost_labor_rate, snapshot_loaded_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ')->execute(array_merge($costs, [':id' => $lineId]));
}

switch ($method) {
    case 'GET':
        // 明細一覧
        if ($resourceId && $subAction === 'lines') {
            $stmt = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no');
            $stmt->execute([$resourceId]);
            echo json_encode($stmt->fetchAll());
            break;
        }
        if ($resourceId) {
            // 伝票詳細
            $stmt = $pdo->prepare('
                SELECT v.*, c.name AS customer_name, p.name AS project_name
                FROM vouchers v
                LEFT JOIN customers c ON c.id = v.customer_id
                LEFT JOIN projects  p ON p.id = v.project_id
                WHERE v.id = ?
            ');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

            $stmt2 = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no');
            $stmt2->execute([$resourceId]);
            $row['lines'] = $stmt2->fetchAll();
            echo json_encode($row);
        } else {
            // 一覧
            $where = 'WHERE 1=1'; $params = [];
            if (!empty($_GET['voucher_type'])) { $where .= ' AND v.voucher_type = ?'; $params[] = $_GET['voucher_type']; }
            if (!empty($_GET['customer_id'])) { $where .= ' AND v.customer_id = ?'; $params[] = (int)$_GET['customer_id']; }
            if (!empty($_GET['project_id']))  { $where .= ' AND v.project_id = ?';  $params[] = (int)$_GET['project_id']; }
            if (!empty($_GET['status']))      { $where .= ' AND v.status = ?';      $params[] = $_GET['status']; }
            $stmt = $pdo->prepare("
                SELECT v.*, c.name AS customer_name, p.name AS project_name
                FROM vouchers v
                LEFT JOIN customers c ON c.id = v.customer_id
                LEFT JOIN projects  p ON p.id = v.project_id
                $where ORDER BY v.voucher_date DESC
            ");
            $stmt->execute($params);
            echo json_encode($stmt->fetchAll());
        }
        break;

    case 'POST':
        // ---- 見積→売上変換 ----
        if ($resourceId && $subAction === 'convert-to-sales') {
            $src = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $src->execute([$resourceId]);
            $orig = $src->fetch();
            if (!$orig || $orig['voucher_type'] !== 'estimate') {
                http_response_code(400); echo json_encode(['error' => '見積伝票のみ変換可']); exit;
            }
            $newNo = nextVoucherNo($pdo, 'sales');
            $pdo->prepare('
                INSERT INTO vouchers
                    (voucher_no, voucher_type, status, project_id, customer_id,
                     voucher_date, delivery_date, tax_input_type, consumption_tax_type,
                     cutoff_date, billing_date, override_billing_date,
                     source_voucher_id, source_estimate_no,
                     print_date_flag, print_tax_excl_flag, print_company_seal,
                     trade_type, profit_rate, memo, description,
                     subtotal_taxable, subtotal_nontaxable, subtotal_discount, tax_amount, total_amount)
                VALUES
                    (:voucher_no, "sales", "draft", :project_id, :customer_id,
                     :voucher_date, :delivery_date, :tax_input_type, :consumption_tax_type,
                     :cutoff_date, :billing_date, :override_billing_date,
                     :source_voucher_id, :source_estimate_no,
                     :print_date_flag, :print_tax_excl_flag, :print_company_seal,
                     :trade_type, :profit_rate, :memo, :description,
                     :subtotal_taxable, :subtotal_nontaxable, :subtotal_discount, :tax_amount, :total_amount)
            ')->execute([
                ':voucher_no'           => $newNo,
                ':project_id'           => $orig['project_id'],
                ':customer_id'          => $orig['customer_id'],
                ':voucher_date'         => date('Y-m-d'),
                ':delivery_date'        => $orig['delivery_date'],
                ':tax_input_type'       => $orig['tax_input_type'],
                ':consumption_tax_type' => $orig['consumption_tax_type'],
                ':cutoff_date'          => $orig['cutoff_date'],
                ':billing_date'         => $orig['billing_date'],
                ':override_billing_date'=> $orig['override_billing_date'],
                ':source_voucher_id'    => $resourceId,
                ':source_estimate_no'   => $orig['voucher_no'],
                ':print_date_flag'      => $orig['print_date_flag'],
                ':print_tax_excl_flag'  => $orig['print_tax_excl_flag'],
                ':print_company_seal'   => $orig['print_company_seal'],
                ':trade_type'           => $orig['trade_type'],
                ':profit_rate'          => $orig['profit_rate'],
                ':memo'                 => $orig['memo'],
                ':description'          => $orig['description'],
                ':subtotal_taxable'     => $orig['subtotal_taxable'],
                ':subtotal_nontaxable'  => $orig['subtotal_nontaxable'],
                ':subtotal_discount'    => $orig['subtotal_discount'],
                ':tax_amount'           => $orig['tax_amount'],
                ':total_amount'         => $orig['total_amount'],
            ]);
            $newId = (int)$pdo->lastInsertId();

            // 明細をディープコピー
            $lines = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no');
            $lines->execute([$resourceId]);
            foreach ($lines->fetchAll() as $line) {
                $pdo->prepare('
                    INSERT INTO voucher_lines
                        (voucher_id, line_no, line_type, location_no, location_name,
                         tategu_item_id, item_name, quantity,
                         cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate,
                         snapshot_loaded_at, price_body, price_hardware, price_glass, line_total,
                         tax_category, memo)
                    VALUES
                        (:voucher_id, :line_no, :line_type, :location_no, :location_name,
                         :tategu_item_id, :item_name, :quantity,
                         :cost_body, :cost_hardware, :cost_glass, :cost_factory_hours, :cost_site_hours, :cost_labor_rate,
                         :snapshot_loaded_at, :price_body, :price_hardware, :price_glass, :line_total,
                         :tax_category, :memo)
                ')->execute([
                    ':voucher_id'          => $newId,
                    ':line_no'             => $line['line_no'],
                    ':line_type'           => $line['line_type'],
                    ':location_no'         => $line['location_no'],
                    ':location_name'       => $line['location_name'],
                    ':tategu_item_id'      => $line['tategu_item_id'],
                    ':item_name'           => $line['item_name'],
                    ':quantity'            => $line['quantity'],
                    ':cost_body'           => $line['cost_body'],
                    ':cost_hardware'       => $line['cost_hardware'],
                    ':cost_glass'          => $line['cost_glass'],
                    ':cost_factory_hours'  => $line['cost_factory_hours'],
                    ':cost_site_hours'     => $line['cost_site_hours'],
                    ':cost_labor_rate'     => $line['cost_labor_rate'],
                    ':snapshot_loaded_at'  => $line['snapshot_loaded_at'],
                    ':price_body'          => $line['price_body'],
                    ':price_hardware'      => $line['price_hardware'],
                    ':price_glass'         => $line['price_glass'],
                    ':line_total'          => $line['line_total'],
                    ':tax_category'        => $line['tax_category'],
                    ':memo'                => $line['memo'],
                ]);
            }
            http_response_code(201);
            $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $s->execute([$newId]);
            echo json_encode($s->fetch());
            break;
        }

        // ---- スナップショット一括再読み込み ----
        if ($resourceId && $subAction === 'reload-snapshots') {
            $lines = $pdo->prepare('SELECT id FROM voucher_lines WHERE voucher_id = ? AND tategu_item_id IS NOT NULL');
            $lines->execute([$resourceId]);
            foreach ($lines->fetchAll() as $line) {
                loadSnapshot($pdo, (int)$line['id']);
            }
            // 合計再計算
            recalcVoucher($pdo, $resourceId);
            echo json_encode(['reloaded' => true]);
            break;
        }

        // ---- 明細追加 ----
        if ($resourceId && $subAction === 'lines') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(line_no), 0) + 1 FROM voucher_lines WHERE voucher_id = ?');
            $maxStmt->execute([$resourceId]);
            $lineNo = (int)$maxStmt->fetchColumn();
            $stmt = $pdo->prepare('
                INSERT INTO voucher_lines
                    (voucher_id, line_no, line_type, location_no, location_name,
                     tategu_item_id, item_name, quantity,
                     cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate,
                     price_body, price_hardware, price_glass, line_total, tax_category, memo)
                VALUES
                    (:voucher_id, :line_no, :line_type, :location_no, :location_name,
                     :tategu_item_id, :item_name, :quantity,
                     :cost_body, :cost_hardware, :cost_glass, :cost_factory_hours, :cost_site_hours, :cost_labor_rate,
                     :price_body, :price_hardware, :price_glass, :line_total, :tax_category, :memo)
            ');
            $stmt->execute([
                ':voucher_id'          => $resourceId,
                ':line_no'             => $lineNo,
                ':line_type'           => $data['line_type'] ?? 'normal',
                ':location_no'         => $data['location_no'] ?? null,
                ':location_name'       => $data['location_name'] ?? null,
                ':tategu_item_id'      => $data['tategu_item_id'] ?? null,
                ':item_name'           => $data['item_name'] ?? null,
                ':quantity'            => $data['quantity'] ?? 1,
                ':cost_body'           => $data['cost_body'] ?? 0,
                ':cost_hardware'       => $data['cost_hardware'] ?? 0,
                ':cost_glass'          => $data['cost_glass'] ?? 0,
                ':cost_factory_hours'  => $data['cost_factory_hours'] ?? 0,
                ':cost_site_hours'     => $data['cost_site_hours'] ?? 0,
                ':cost_labor_rate'     => $data['cost_labor_rate'] ?? 0,
                ':price_body'          => $data['price_body'] ?? 0,
                ':price_hardware'      => $data['price_hardware'] ?? 0,
                ':price_glass'         => $data['price_glass'] ?? 0,
                ':line_total'          => $data['line_total'] ?? 0,
                ':tax_category'        => $data['tax_category'] ?? '課税',
                ':memo'                => $data['memo'] ?? null,
            ]);
            $lineId = (int)$pdo->lastInsertId();
            // 建具台帳が指定されていればスナップショットをロード
            if (!empty($data['tategu_item_id'])) {
                loadSnapshot($pdo, $lineId);
            }
            recalcVoucher($pdo, $resourceId);
            http_response_code(201);
            $s = $pdo->prepare('SELECT * FROM voucher_lines WHERE id = ?');
            $s->execute([$lineId]);
            echo json_encode($s->fetch());
            break;
        }

        // ---- 新規伝票作成 ----
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $type = $data['voucher_type'] ?? 'estimate';
        $no = nextVoucherNo($pdo, $type);
        $stmt = $pdo->prepare('
            INSERT INTO vouchers
                (voucher_no, voucher_type, status, project_id, customer_id,
                 voucher_date, delivery_date, tax_input_type, consumption_tax_type,
                 cutoff_date, billing_date, override_billing_date,
                 trade_type, profit_rate, memo, description,
                 print_date_flag, print_tax_excl_flag, print_company_seal)
            VALUES
                (:voucher_no, :voucher_type, "draft", :project_id, :customer_id,
                 :voucher_date, :delivery_date, :tax_input_type, :consumption_tax_type,
                 :cutoff_date, :billing_date, :override_billing_date,
                 :trade_type, :profit_rate, :memo, :description,
                 :print_date_flag, :print_tax_excl_flag, :print_company_seal)
        ');
        $stmt->execute([
            ':voucher_no'           => $no,
            ':voucher_type'         => $type,
            ':project_id'           => $data['project_id'] ?? null,
            ':customer_id'          => $data['customer_id'] ?? null,
            ':voucher_date'         => $data['voucher_date'] ?? date('Y-m-d'),
            ':delivery_date'        => $data['delivery_date'] ?? null,
            ':tax_input_type'       => $data['tax_input_type'] ?? 'exclusive',
            ':consumption_tax_type' => $data['consumption_tax_type'] ?? '外税/伝票計',
            ':cutoff_date'          => $data['cutoff_date'] ?? null,
            ':billing_date'         => $data['billing_date'] ?? null,
            ':override_billing_date'=> $data['override_billing_date'] ?? null,
            ':trade_type'           => $data['trade_type'] ?? '掛売上',
            ':profit_rate'          => $data['profit_rate'] ?? 0.30,
            ':memo'                 => $data['memo'] ?? null,
            ':description'          => $data['description'] ?? null,
            ':print_date_flag'      => $data['print_date_flag'] ?? 1,
            ':print_tax_excl_flag'  => $data['print_tax_excl_flag'] ?? 0,
            ':print_company_seal'   => $data['print_company_seal'] ?? 0,
        ]);
        $id = (int)$pdo->lastInsertId();
        http_response_code(201);
        $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
        $s->execute([$id]);
        echo json_encode($s->fetch());
        break;

    case 'PUT':
        // ---- 明細更新 ----
        if ($resourceId && $subAction === 'lines' && $subId) {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $fields = ['line_type','location_no','location_name','tategu_item_id','item_name','quantity',
                       'cost_body','cost_hardware','cost_glass','cost_factory_hours','cost_site_hours','cost_labor_rate',
                       'price_body','price_hardware','price_glass','line_total','tax_category','memo'];
            $sets = []; $params = [];
            foreach ($fields as $f) {
                if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
            }
            if (!empty($sets)) {
                $params[':id'] = $subId;
                $pdo->prepare('UPDATE voucher_lines SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
                // 建具台帳が変わったらスナップショット再ロード
                if (array_key_exists('tategu_item_id', $data)) {
                    loadSnapshot($pdo, $subId);
                }
                recalcVoucher($pdo, $resourceId);
            }
            $s = $pdo->prepare('SELECT * FROM voucher_lines WHERE id = ?');
            $s->execute([$subId]);
            echo json_encode($s->fetch());
            break;
        }
        // ---- 伝票ヘッダー更新 ----
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = ['status','project_id','customer_id','voucher_date','delivery_date',
                   'tax_input_type','consumption_tax_type','cutoff_date','billing_date','override_billing_date',
                   'trade_type','profit_rate','memo','description',
                   'print_date_flag','print_tax_excl_flag','print_company_seal'];
        $sets = []; $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $params[':id'] = $resourceId;
        $pdo->prepare('UPDATE vouchers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        // 税設定が変わった可能性があるので再集計
        recalcVoucher($pdo, $resourceId);
        $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
        $s->execute([$resourceId]);
        echo json_encode($s->fetch());
        break;

    case 'DELETE':
        if ($resourceId && $subAction === 'lines' && $subId) {
            $pdo->prepare('DELETE FROM voucher_lines WHERE id = ?')->execute([$subId]);
            recalcVoucher($pdo, $resourceId);
            echo json_encode(['deleted' => true]);
            break;
        }
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $pdo->prepare('UPDATE vouchers SET status = "void", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        echo json_encode(['voided' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
