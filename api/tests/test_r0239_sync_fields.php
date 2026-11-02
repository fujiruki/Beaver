<?php
/**
 * R-0239 同期の窓口: 入金の種類・得意先の請求日印字・伝票の引用日
 *
 * 起動: php api/tests/test_r0239_sync_fields.php
 */

declare(strict_types=1);

$harnessName = 'test_r0239_sync_fields';
$harnessPort = 18123;
require __DIR__ . '/_http_test_harness.php';

function col(PDO $pdo, string $sql) {
    $v = $pdo->query($sql)->fetchColumn();
    return $v === false ? null : $v;
}

function pushPayment(int $port, int $no, array $extra = []): array {
    return httpJson($port, '/payments/sync', 'POST', array_merge([
        'access_payment_no' => $no, 'customer_access_no' => '239', 'payment_date' => '2026-09-01', 'amount' => 1000,
    ], $extra));
}

function pushCustomer(int $port, array $extra = []): array {
    return httpJson($port, '/customers', 'POST', array_merge([
        'access_customer_no' => '239', 'name' => 'R239得意先',
    ], $extra));
}

function pushVoucher(int $port, int $accessId, array $extra = []): array {
    return httpJson($port, '/vouchers/sync', 'POST', array_merge([
        'access_voucher_id' => $accessId, 'voucher_type' => 'estimate', 'customer_access_no' => '',
        'voucher_date' => '2026-09-01', 'total_amount' => 1000,
    ], $extra));
}

function findIn(array $rows, string $key, $val): ?array {
    foreach ($rows as $r) if ((string)$r[$key] === (string)$val) return $r;
    return null;
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0239 入金の種類 ===\n";
    $pdo->exec("INSERT INTO customers (name, access_customer_no, code) VALUES ('入金用', '239', '239')");

    runTest('入金: キーありの追加で値が入る', function () use ($pdo, $port) {
        pushPayment($port, 70001, ['payment_type' => '振込']);
        assertEq('振込', col($pdo, 'SELECT payment_type FROM payments WHERE access_payment_no = 70001'), '追加');
    });
    runTest('入金: キーなしの追加は現金', function () use ($pdo, $port) {
        pushPayment($port, 70002);
        assertEq('現金', col($pdo, 'SELECT payment_type FROM payments WHERE access_payment_no = 70002'), '既定');
    });
    runTest('入金: キーありの更新で値が入り、選択肢外の値も保存', function () use ($pdo, $port) {
        pushPayment($port, 70003, ['payment_type' => '振込']);
        pushPayment($port, 70003, ['payment_type' => '電子記録債権']);
        assertEq('電子記録債権', col($pdo, 'SELECT payment_type FROM payments WHERE access_payment_no = 70003'), '更新');
    });
    runTest('入金: キーなしの更新は前の値のまま', function () use ($pdo, $port) {
        pushPayment($port, 70004, ['payment_type' => '手形']);
        pushPayment($port, 70004, ['amount' => 2000]);
        assertEq('手形', col($pdo, 'SELECT payment_type FROM payments WHERE access_payment_no = 70004'), '残る');
    });
    runTest('入金: GET /payments/sync の返り値に payment_type が入る', function () use ($port) {
        pushPayment($port, 70005, ['payment_type' => '相殺']);
        $get = httpJson($port, '/payments/sync', 'GET');
        $f = findIn($get['body']['payments'] ?? [], 'access_payment_no', 70005);
        assertTrue($f !== null, '入金が返る');
        assertTrue(array_key_exists('payment_type', $f), 'payment_type キーがある');
        assertEq('相殺', $f['payment_type'], '値');
    });

    echo "=== R-0239 得意先の請求日印字 ===\n";
    runTest('得意先: 返り値に billing_date_print がある', function () use ($port) {
        pushCustomer($port, ['access_customer_no' => '23901', 'name' => 'B1', 'billing_date_print' => 1]);
        $get = httpJson($port, '/customers/sync', 'GET');
        $f = findIn($get['body']['customers'] ?? [], 'access_customer_no', '23901');
        assertTrue($f !== null, '得意先が返る');
        assertTrue(array_key_exists('billing_date_print', $f), 'キーがある');
        assertEq(1, (int)$f['billing_date_print'], '値');
    });
    runTest('得意先: キーありで更新、キーなしは前の値のまま', function () use ($pdo, $port) {
        pushCustomer($port, ['access_customer_no' => '23902', 'name' => 'B2', 'billing_date_print' => 1]);
        pushCustomer($port, ['access_customer_no' => '23902', 'name' => 'B2', 'billing_date_print' => 0]);
        assertEq(0, (int)col($pdo, "SELECT billing_date_print FROM customers WHERE access_customer_no = '23902'"), '更新');
        pushCustomer($port, ['access_customer_no' => '23902', 'name' => 'B2', 'billing_date_print' => 1]);
        pushCustomer($port, ['access_customer_no' => '23902', 'name' => 'B2改']);
        assertEq(1, (int)col($pdo, "SELECT billing_date_print FROM customers WHERE access_customer_no = '23902'"), 'キーなしで残る');
    });

    echo "=== R-0239 伝票の引用日 ===\n";
    runTest('伝票: キーありで入り、キーなしの再送で残る', function () use ($pdo, $port) {
        pushVoucher($port, 80001, ['quoted_at' => '2026-08-01']);
        assertEq('2026-08-01', col($pdo, 'SELECT quoted_at FROM vouchers WHERE access_voucher_id = 80001'), '新規');
        pushVoucher($port, 80001, ['total_amount' => 2000, 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        assertEq('2026-08-01', col($pdo, 'SELECT quoted_at FROM vouchers WHERE access_voucher_id = 80001'), '残る');
    });
    runTest('伝票: キーありで更新、null で空', function () use ($pdo, $port) {
        pushVoucher($port, 80002, ['quoted_at' => '2026-08-01']);
        pushVoucher($port, 80002, ['quoted_at' => '2026-08-15', 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        assertEq('2026-08-15', col($pdo, 'SELECT quoted_at FROM vouchers WHERE access_voucher_id = 80002'), '更新');
        pushVoucher($port, 80002, ['quoted_at' => null, 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        assertEq(null, col($pdo, 'SELECT quoted_at FROM vouchers WHERE access_voucher_id = 80002'), '空');
    });
    runTest('伝票: GET /vouchers/sync の返り値に quoted_at が入る', function () use ($port) {
        pushVoucher($port, 80003, ['quoted_at' => '2026-07-01']);
        $get = httpJson($port, '/vouchers/sync', 'GET');
        $f = findIn($get['body']['vouchers'] ?? [], 'access_voucher_id', 80003);
        assertTrue($f !== null, '伝票が返る');
        assertTrue(array_key_exists('quoted_at', $f), 'quoted_at キーがある');
        assertEq('2026-07-01', $f['quoted_at'], '値');
    });
} finally {
    harnessFinish();
}
