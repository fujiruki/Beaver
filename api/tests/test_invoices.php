<?php
/**
 * R-0100 invoices API 単体テスト
 *
 * 起動: php api/tests/test_invoices.php
 *
 * - invoices.php の POST/DELETE ロジックを PDO 直接呼び出しで検証
 * - 専用 SQLite DB を使って既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_invoices.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');

$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $m) {
    $sql = file_get_contents($m);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}

// ============================================================
// テストハーネス
// ============================================================
$passed = 0;
$failed = 0;
$failures = [];

function runTest(string $name, callable $fn): void {
    global $passed, $failed, $failures;
    try {
        $fn();
        echo "  [OK] $name\n";
        $passed++;
    } catch (Throwable $e) {
        echo "  [NG] $name :: " . $e->getMessage() . "\n";
        $failed++;
        $failures[] = $name . ': ' . $e->getMessage();
    }
}

function assertEq($expected, $actual, string $label = ''): void {
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf(
            "%s expected=%s actual=%s",
            $label,
            var_export($expected, true),
            var_export($actual, true)
        ));
    }
}

// ============================================================
// invoices.php の nextInvoiceNo() と同一ロジック
// ============================================================
function nextInvoiceNoTest(PDO $pdo): string {
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = "invoice"');
    $stmt->execute();
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = "invoice"')->execute([$no]);
    return 'I' . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

/**
 * invoices.php の POST ロジックをインライン実行。
 */
function invoicePost(PDO $pdo, array $data): array {
    $no = nextInvoiceNoTest($pdo);

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

    if (!empty($data['voucher_ids']) && is_array($data['voucher_ids'])) {
        $ivStmt = $pdo->prepare('INSERT OR IGNORE INTO invoice_vouchers (invoice_id, voucher_id) VALUES (?, ?)');
        foreach ($data['voucher_ids'] as $vid) {
            $ivStmt->execute([$invId, (int)$vid]);
            $pdo->prepare('UPDATE vouchers SET status = "billed", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([(int)$vid]);
        }
    }

    if (!empty($data['next_carry_forward'])) {
        $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
            ->execute([$data['next_carry_forward'], $data['customer_id']]);
    }

    $s = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $s->execute([$invId]);
    return $s->fetch();
}

/**
 * invoices.php の DELETE ロジックをインライン実行（現行の routes/invoices.php と同一）。
 * R-0100: 削除対象自身の carry_forward 列で customers.carry_forward_balance を
 * 巻き戻す。ただし削除対象より後に作られた同一得意先の請求書が存在する場合は触らない。
 */
function invoiceDelete(PDO $pdo, int $resourceId): array {
    $chk = $pdo->prepare('SELECT COUNT(*) FROM payments WHERE invoice_id = ?');
    $chk->execute([$resourceId]);
    if ((int)$chk->fetchColumn() > 0) {
        return ['code' => 400, 'body' => ['error' => '入金記録があるため削除できません']];
    }

    $invStmt = $pdo->prepare('SELECT customer_id, carry_forward FROM invoices WHERE id = ?');
    $invStmt->execute([$resourceId]);
    $targetInvoice = $invStmt->fetch();

    $iv = $pdo->prepare('SELECT voucher_id FROM invoice_vouchers WHERE invoice_id = ?');
    $iv->execute([$resourceId]);
    foreach ($iv->fetchAll() as $row) {
        $pdo->prepare('UPDATE vouchers SET status = "approved", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$row['voucher_id']]);
    }
    $pdo->prepare('DELETE FROM invoice_vouchers WHERE invoice_id = ?')->execute([$resourceId]);
    $pdo->prepare('DELETE FROM invoices WHERE id = ?')->execute([$resourceId]);

    if ($targetInvoice) {
        $newerStmt = $pdo->prepare('SELECT COUNT(*) FROM invoices WHERE customer_id = ? AND id > ?');
        $newerStmt->execute([$targetInvoice['customer_id'], $resourceId]);
        if ((int)$newerStmt->fetchColumn() === 0) {
            $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                ->execute([$targetInvoice['carry_forward'], $targetInvoice['customer_id']]);
        }
    }

    return ['code' => 200, 'body' => ['deleted' => true]];
}

function getCustomerCarryForward(PDO $pdo, int $customerId): float {
    $stmt = $pdo->prepare('SELECT carry_forward_balance FROM customers WHERE id = ?');
    $stmt->execute([$customerId]);
    return (float)$stmt->fetchColumn();
}

// ============================================================
// テスト本体
// ============================================================
echo "=== R-0100 invoices API テスト ===\n\n";

// T-01: 請求書を1件作成→削除すると、customers.carry_forward_balanceが作成前の値に戻る
runTest('T-01: 請求書1件作成→削除で carry_forward_balance が作成前の値に戻る', function () use ($pdo) {
    $custId = (int)$pdo->query("INSERT INTO customers (name, carry_forward_balance, is_active) VALUES ('得意先A', 1000, 1) RETURNING id")->fetchColumn();

    $inv = invoicePost($pdo, [
        'customer_id'        => $custId,
        'carry_forward'      => 1000,
        'sales_total'        => 5000,
        'next_carry_forward' => 6000,
    ]);
    assertEq(6000.0, getCustomerCarryForward($pdo, $custId), '作成直後は next_carry_forward が反映される');

    $res = invoiceDelete($pdo, (int)$inv['id']);
    assertEq(200, $res['code'], 'DELETE status');
    assertEq(1000.0, getCustomerCarryForward($pdo, $custId), '削除後は作成前の carry_forward(1000) に戻る');
});

// T-02: 同一得意先に請求書A→請求書Bの順で作成後、Aを削除してもBの残高は変わらない
runTest('T-02: 古い請求書を削除しても新しい請求書の carry_forward_balance を壊さない', function () use ($pdo) {
    $custId = (int)$pdo->query("INSERT INTO customers (name, carry_forward_balance, is_active) VALUES ('得意先B', 0, 1) RETURNING id")->fetchColumn();

    $invA = invoicePost($pdo, [
        'customer_id'        => $custId,
        'carry_forward'      => 0,
        'sales_total'        => 3000,
        'next_carry_forward' => 3000,
    ]);
    $invB = invoicePost($pdo, [
        'customer_id'        => $custId,
        'carry_forward'      => 3000,
        'sales_total'        => 2000,
        'next_carry_forward' => 5000,
    ]);
    assertEq(5000.0, getCustomerCarryForward($pdo, $custId), 'Bの作成直後は5000');

    $res = invoiceDelete($pdo, (int)$invA['id']);
    assertEq(200, $res['code'], 'DELETE status');
    assertEq(5000.0, getCustomerCarryForward($pdo, $custId), 'Aを削除してもBが設定した5000のまま変わらない');
});

// ============================================================
// 結果サマリ
// ============================================================
echo "\n";
echo "結果: {$passed} PASS / {$failed} FAIL\n";
if (!empty($failures)) {
    echo "\n失敗したテスト:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
    exit(1);
}
exit(0);
