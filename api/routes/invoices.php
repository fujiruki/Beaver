<?php
/**
 * /invoices エンドポイント
 * GET    /invoices                   一覧
 * GET    /invoices/{id}              詳細（紐づく伝票・入金含む）
 * POST   /invoices                   請求書新規作成
 * DELETE /invoices/{id}              削除（発行済みは不可）
 */

require_once __DIR__ . '/history_helpers.php';

$segments   = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;

// --- 請求書番号採番 ---
function nextInvoiceNo(PDO $pdo): string {
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = "invoice"');
    $stmt->execute();
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = "invoice"')->execute([$no]);
    return 'I' . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

switch ($method) {
    case 'GET':
        if ($resourceId) {
            $stmt = $pdo->prepare('
                SELECT inv.*, c.name AS customer_name
                FROM invoices inv
                LEFT JOIN customers c ON c.id = inv.customer_id
                WHERE inv.id = ?
            ');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

            // 紐づく売上伝票
            $stmt2 = $pdo->prepare('
                SELECT v.id, v.voucher_no, v.voucher_date, v.total_amount, v.memo
                FROM invoice_vouchers iv
                JOIN vouchers v ON v.id = iv.voucher_id
                WHERE iv.invoice_id = ?
                ORDER BY v.voucher_date
            ');
            $stmt2->execute([$resourceId]);
            $row['vouchers'] = $stmt2->fetchAll();

            // 入金一覧
            $stmt3 = $pdo->prepare('SELECT * FROM payments WHERE invoice_id = ? ORDER BY payment_date');
            $stmt3->execute([$resourceId]);
            $row['payments'] = $stmt3->fetchAll();

            echo json_encode($row);
        } else {
            $where = 'WHERE 1=1'; $params = [];
            if (!empty($_GET['customer_id'])) { $where .= ' AND inv.customer_id = ?'; $params[] = (int)$_GET['customer_id']; }
            if (!empty($_GET['year']))  { $where .= ' AND strftime("%Y", inv.billing_date) = ?'; $params[] = $_GET['year']; }
            if (!empty($_GET['month'])) { $where .= ' AND strftime("%m", inv.billing_date) = ?'; $params[] = str_pad($_GET['month'], 2, '0', STR_PAD_LEFT); }
            $stmt = $pdo->prepare("
                SELECT inv.*, c.name AS customer_name
                FROM invoices inv
                LEFT JOIN customers c ON c.id = inv.customer_id
                $where ORDER BY inv.billing_date DESC
            ");
            $stmt->execute($params);
            echo json_encode($stmt->fetchAll());
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $no = nextInvoiceNo($pdo);

        // 得意先の請求先名スナップショット
        $cStmt = $pdo->prepare('SELECT billing_name, name FROM customers WHERE id = ?');
        $cStmt->execute([$data['customer_id'] ?? 0]);
        $cust = $cStmt->fetch();
        $billingName = ($cust && $cust['billing_name']) ? $cust['billing_name'] : ($cust ? $cust['name'] : '');

        $stmt = $pdo->prepare('
            INSERT INTO invoices
                (invoice_no, customer_id, invoice_date, cutoff_date, billing_date,
                 carry_forward, sales_total, tax_total, payment_received,
                 invoice_total, next_carry_forward, billing_name_print)
            VALUES
                (:invoice_no, :customer_id, :invoice_date, :cutoff_date, :billing_date,
                 :carry_forward, :sales_total, :tax_total, :payment_received,
                 :invoice_total, :next_carry_forward, :billing_name_print)
        ');
        $stmt->execute([
            ':invoice_no'         => $no,
            ':customer_id'        => $data['customer_id'],
            ':invoice_date'       => $data['invoice_date'] ?? date('Y-m-d'),
            ':cutoff_date'        => $data['cutoff_date'] ?? date('Y-m-d'),
            ':billing_date'       => $data['billing_date'] ?? date('Y-m-d'),
            ':carry_forward'      => $data['carry_forward'] ?? 0,
            ':sales_total'        => $data['sales_total'] ?? 0,
            ':tax_total'          => $data['tax_total'] ?? 0,
            ':payment_received'   => $data['payment_received'] ?? 0,
            ':invoice_total'      => $data['invoice_total'] ?? 0,
            ':next_carry_forward' => $data['next_carry_forward'] ?? 0,
            ':billing_name_print' => $billingName,
        ]);
        $invId = (int)$pdo->lastInsertId();

        // 売上伝票との紐づけ
        if (!empty($data['voucher_ids']) && is_array($data['voucher_ids'])) {
            $ivStmt = $pdo->prepare('INSERT OR IGNORE INTO invoice_vouchers (invoice_id, voucher_id) VALUES (?, ?)');
            foreach ($data['voucher_ids'] as $vid) {
                $ivStmt->execute([$invId, (int)$vid]);
                // 伝票を billed に更新
                $pdo->prepare('UPDATE vouchers SET status = "billed", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    ->execute([(int)$vid]);
            }
        }

        // 得意先の繰越残高を更新
        if (!empty($data['next_carry_forward'])) {
            $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                ->execute([$data['next_carry_forward'], $data['customer_id']]);
        }

        http_response_code(201);
        $s = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
        $s->execute([$invId]);
        echo json_encode($s->fetch());
        break;

    case 'DELETE':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        // 入金が存在する場合は削除不可
        $chk = $pdo->prepare('SELECT COUNT(*) FROM payments WHERE invoice_id = ?');
        $chk->execute([$resourceId]);
        if ((int)$chk->fetchColumn() > 0) {
            http_response_code(400);
            echo json_encode(['error' => '入金記録があるため削除できません']);
            exit;
        }
        // R-0100: 削除対象自身の carry_forward（作成前の繰越残高）を保持しておく
        // R-0098: 復元用にUndo記録も同じSELECTで賄う（全列が必要なため SELECT * にする）
        $invStmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
        $invStmt->execute([$resourceId]);
        $targetInvoice = $invStmt->fetch();

        // 紐づき解除 → 伝票を approved に戻す
        // R-0098: invoice_vouchers を DELETE する前に voucher_ids を確保して履歴に残す
        $iv = $pdo->prepare('SELECT voucher_id FROM invoice_vouchers WHERE invoice_id = ?');
        $iv->execute([$resourceId]);
        $ivRows = $iv->fetchAll();
        $voucherIds = array_map(fn($row) => (int)$row['voucher_id'], $ivRows);
        foreach ($ivRows as $row) {
            $pdo->prepare('UPDATE vouchers SET status = "approved", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([$row['voucher_id']]);
        }
        $historyId = null;
        if ($targetInvoice) {
            $historyId = recordHistory($pdo, 'invoices', $resourceId, 'delete', $targetInvoice, ['voucher_ids' => $voucherIds]);
        }
        $pdo->prepare('DELETE FROM invoice_vouchers WHERE invoice_id = ?')->execute([$resourceId]);
        $pdo->prepare('DELETE FROM invoices WHERE id = ?')->execute([$resourceId]);

        // R-0100: 得意先の繰越残高を巻き戻す。ただし削除対象より後に作られた
        // 同一得意先の請求書が存在する場合は、その最新残高を壊さないよう触らない
        if ($targetInvoice) {
            $newerStmt = $pdo->prepare('SELECT COUNT(*) FROM invoices WHERE customer_id = ? AND id > ?');
            $newerStmt->execute([$targetInvoice['customer_id'], $resourceId]);
            if ((int)$newerStmt->fetchColumn() === 0) {
                $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                    ->execute([$targetInvoice['carry_forward'], $targetInvoice['customer_id']]);
            }
        }

        echo json_encode(['deleted' => true, 'history_id' => $historyId]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
