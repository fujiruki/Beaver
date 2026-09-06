<?php
/**
 * /payments エンドポイント
 * GET    /payments           一覧
 * GET    /payments/{id}      詳細
 * POST   /payments           入金登録
 * DELETE /payments/{id}      削除
 */

require_once __DIR__ . '/history_helpers.php';

$segments   = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;

function nextPaymentNo(PDO $pdo): string {
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = "payment"');
    $stmt->execute();
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = "payment"')->execute([$no]);
    return 'P' . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

switch ($method) {
    case 'GET':
        if ($resourceId) {
            $stmt = $pdo->prepare('
                SELECT p.*, c.name AS customer_name
                FROM payments p
                LEFT JOIN customers c ON c.id = p.customer_id
                WHERE p.id = ?
            ');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }
            echo json_encode($row);
        } else {
            $where = 'WHERE 1=1'; $params = [];
            if (!empty($_GET['customer_id'])) { $where .= ' AND p.customer_id = ?'; $params[] = (int)$_GET['customer_id']; }
            if (!empty($_GET['invoice_id']))  { $where .= ' AND p.invoice_id = ?';  $params[] = (int)$_GET['invoice_id']; }
            $stmt = $pdo->prepare("
                SELECT p.*, c.name AS customer_name
                FROM payments p
                LEFT JOIN customers c ON c.id = p.customer_id
                $where ORDER BY p.payment_date DESC
            ");
            $stmt->execute($params);
            echo json_encode($stmt->fetchAll());
        }
        break;

    case 'POST':
        // R-0143 A-B-05: 請求・入金編集の封印。フラグOFFの間は新規登録できない
        if (!BILLING_EDIT_ENABLED) {
            http_response_code(409);
            echo json_encode(['error' => 'billing_edit_disabled']);
            exit;
        }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $no = nextPaymentNo($pdo);
        $stmt = $pdo->prepare('
            INSERT INTO payments (payment_no, customer_id, invoice_id, payment_date, amount, payment_type, memo)
            VALUES (:payment_no, :customer_id, :invoice_id, :payment_date, :amount, :payment_type, :memo)
        ');
        $stmt->execute([
            ':payment_no'   => $no,
            ':customer_id'  => $data['customer_id'] ?? null,
            ':invoice_id'   => $data['invoice_id'] ?? null,
            ':payment_date' => $data['payment_date'] ?? date('Y-m-d'),
            ':amount'       => $data['amount'] ?? 0,
            ':payment_type' => $data['payment_type'] ?? '現金',
            ':memo'         => $data['memo'] ?? null,
        ]);
        $id = (int)$pdo->lastInsertId();

        // 請求書の入金額・次回繰越を更新
        if (!empty($data['invoice_id'])) {
            $invStmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
            $invStmt->execute([$data['invoice_id']]);
            $inv = $invStmt->fetch();
            if ($inv) {
                $newReceived = (float)$inv['payment_received'] + (float)($data['amount'] ?? 0);
                $newCarryFwd = (float)$inv['invoice_total'] - $newReceived;
                $pdo->prepare('UPDATE invoices SET payment_received = ?, next_carry_forward = ? WHERE id = ?')
                    ->execute([$newReceived, $newCarryFwd, $data['invoice_id']]);
                // 得意先の繰越残高を更新
                $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                    ->execute([$newCarryFwd, $inv['customer_id']]);
            }
        }

        http_response_code(201);
        $s = $pdo->prepare('SELECT * FROM payments WHERE id = ?');
        $s->execute([$id]);
        echo json_encode($s->fetch());
        break;

    case 'DELETE':
        // R-0143 A-B-05: 請求・入金編集の封印。フラグOFFの間は削除できない
        if (!BILLING_EDIT_ENABLED) {
            http_response_code(409);
            echo json_encode(['error' => 'billing_edit_disabled']);
            exit;
        }
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        // 入金取消：請求書の入金額を戻す
        $stmt = $pdo->prepare('SELECT * FROM payments WHERE id = ?');
        $stmt->execute([$resourceId]);
        $pay = $stmt->fetch();
        // R-0098: max(0, ...)クランプが発動した削除は復元しても厳密な逆変換にならないため記録する
        $clamped = false;
        if ($pay && $pay['invoice_id']) {
            $invStmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
            $invStmt->execute([$pay['invoice_id']]);
            $inv = $invStmt->fetch();
            if ($inv) {
                $clamped = ((float)$inv['payment_received'] - (float)$pay['amount']) < 0;
                $newReceived = max(0, (float)$inv['payment_received'] - (float)$pay['amount']);
                $newCarryFwd = (float)$inv['invoice_total'] - $newReceived;
                $pdo->prepare('UPDATE invoices SET payment_received = ?, next_carry_forward = ? WHERE id = ?')
                    ->execute([$newReceived, $newCarryFwd, $pay['invoice_id']]);
                $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                    ->execute([$newCarryFwd, $inv['customer_id']]);
            }
        }
        $historyId = null;
        if ($pay) {
            $historyId = recordHistory($pdo, 'payments', $resourceId, 'delete', $pay, [], null, $clamped);
        }
        $pdo->prepare('DELETE FROM payments WHERE id = ?')->execute([$resourceId]);
        echo json_encode(['deleted' => true, 'history_id' => $historyId]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
