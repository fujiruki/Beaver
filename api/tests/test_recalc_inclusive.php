<?php
/**
 * recalcVoucher の inclusive 分岐テスト
 *
 * 起動: php api/tests/test_recalc_inclusive.php
 *
 * - recalcVoucher の inclusive 計算を PDO 直接呼び出しで検証
 * - 専用 SQLite DB を使って既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_recalc_inclusive_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
    $GLOBALS['pdo'] = null;
    if (file_exists($testDbPath)) {
        @unlink($testDbPath);
    }
});

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
        try { $pdo->exec($stmt); } catch (Throwable $_) { }
    }
}

require_once $ROOT . '/routes/sync_helpers.php';

// テストハーネス
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

// テスト用得意先を作成（vouchers.customer_id NOT NULL のため必要）
function ensureCustomer(PDO $pdo): int {
    $stmt = $pdo->query('SELECT id FROM customers LIMIT 1');
    $row = $stmt->fetch();
    if ($row) return (int)$row['id'];
    $pdo->prepare('INSERT INTO customers (name, is_active) VALUES (?, 1)')->execute(['テスト得意先']);
    return (int)$pdo->lastInsertId();
}

// テスト用伝票を作成するヘルパ
function createTestVoucher(PDO $pdo, string $taxInputType): int {
    $customerId = ensureCustomer($pdo);
    $pdo->prepare('
        INSERT INTO vouchers (voucher_type, tax_input_type, customer_id, voucher_date, subtotal_taxable, subtotal_nontaxable, subtotal_discount, tax_amount, total_amount)
        VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0)
    ')->execute(['estimate', $taxInputType, $customerId, date('Y-m-d')]);
    return (int)$pdo->lastInsertId();
}

$lineNoCounter = [];
function addLine(PDO $pdo, int $voucherId, string $lineType, float $amount, string $taxCategory = 'taxable'): void {
    global $lineNoCounter;
    if (!isset($lineNoCounter[$voucherId])) {
        $lineNoCounter[$voucherId] = 0;
    }
    $lineNo = ++$lineNoCounter[$voucherId];
    $pdo->prepare('
        INSERT INTO voucher_lines (voucher_id, line_no, line_type, line_total, tax_category, quantity)
        VALUES (?, ?, ?, ?, ?, 1)
    ')->execute([$voucherId, $lineNo, $lineType, $amount, $taxCategory]);
}

function fetchVoucher(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

echo "=== recalcVoucher inclusive 分岐テスト ===\n\n";

// T-01: 税込10005 → tax=909, subtotal_taxable=9096, total=10005
runTest('T-01: 税込10005 → tax=909, subtotal_taxable=9096, total=10005', function () use ($pdo) {
    $id = createTestVoucher($pdo, 'inclusive');
    addLine($pdo, $id, 'normal', 10005.0, 'taxable');
    recalcVoucher($pdo, $id);
    $v = fetchVoucher($pdo, $id);
    assertEq(909, (int)$v['tax_amount'], 'tax_amount');
    assertEq(9096, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(10005, (int)$v['total_amount'], 'total_amount');
});

// T-02: 税込110000 → tax=10000, subtotal_taxable=100000, total=110000
runTest('T-02: 税込110000 → tax=10000, subtotal_taxable=100000, total=110000', function () use ($pdo) {
    $id = createTestVoucher($pdo, 'inclusive');
    addLine($pdo, $id, 'normal', 110000.0, 'taxable');
    recalcVoucher($pdo, $id);
    $v = fetchVoucher($pdo, $id);
    assertEq(10000, (int)$v['tax_amount'], 'tax_amount');
    assertEq(100000, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(110000, (int)$v['total_amount'], 'total_amount');
});

// T-03: 税込110010 → tax=10000, subtotal_taxable=100010, total=110010
runTest('T-03: 税込110010 → tax=10000, subtotal_taxable=100010, total=110010', function () use ($pdo) {
    $id = createTestVoucher($pdo, 'inclusive');
    addLine($pdo, $id, 'normal', 110010.0, 'taxable');
    recalcVoucher($pdo, $id);
    $v = fetchVoucher($pdo, $id);
    assertEq(10000, (int)$v['tax_amount'], 'tax_amount');
    assertEq(100010, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(110010, (int)$v['total_amount'], 'total_amount');
});

// T-04: 税込100000 → tax=9090, subtotal_taxable=90910, total=100000
runTest('T-04: 税込100000 → tax=9090, subtotal_taxable=90910, total=100000', function () use ($pdo) {
    $id = createTestVoucher($pdo, 'inclusive');
    addLine($pdo, $id, 'normal', 100000.0, 'taxable');
    recalcVoucher($pdo, $id);
    $v = fetchVoucher($pdo, $id);
    assertEq(9090, (int)$v['tax_amount'], 'tax_amount');
    assertEq(90910, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(100000, (int)$v['total_amount'], 'total_amount');
});

// T-05: 割引あり（正本=割引前の税込課税110000に課税、値引は合計でのみ減算）
//   tax=floor(110000*10/110)=10000, taxable=100000, total=110000-5500=104500
runTest('T-05: 割引あり 税込110000-5500 → tax=10000, taxable=100000, total=104500', function () use ($pdo) {
    $id = createTestVoucher($pdo, 'inclusive');
    addLine($pdo, $id, 'normal',   110000.0, 'taxable');
    addLine($pdo, $id, 'discount',   5500.0, 'taxable');
    recalcVoucher($pdo, $id);
    $v = fetchVoucher($pdo, $id);
    assertEq(10000, (int)$v['tax_amount'], 'tax_amount');
    assertEq(100000, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(104500, (int)$v['total_amount'], 'total_amount');
});

// T-06: exclusive 分岐は変更されていない（回帰防止） - 課税10万 → tax=10000, total=110000
runTest('T-06: exclusive 分岐回帰防止 → tax=10000, total=110000', function () use ($pdo) {
    $id = createTestVoucher($pdo, 'exclusive');
    addLine($pdo, $id, 'normal', 100000.0, 'taxable');
    recalcVoucher($pdo, $id);
    $v = fetchVoucher($pdo, $id);
    assertEq(10000, (int)$v['tax_amount'], 'tax_amount');
    assertEq(100000, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(110000, (int)$v['total_amount'], 'total_amount');
});

// T-07: exclusive 割引あり（正本=割引前100000に課税、値引は合計でのみ減算）→ tax=10000, taxable=100000, total=100000
runTest('T-07: exclusive 割引あり 課税100000-割引10000 → tax=10000, taxable=100000, total=100000', function () use ($pdo) {
    $id = createTestVoucher($pdo, 'exclusive');
    addLine($pdo, $id, 'normal',   100000.0, 'taxable');
    addLine($pdo, $id, 'discount',  10000.0, 'taxable');
    recalcVoucher($pdo, $id);
    $v = fetchVoucher($pdo, $id);
    assertEq(10000, (int)$v['tax_amount'], 'tax_amount');
    assertEq(100000, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(100000, (int)$v['total_amount'], 'total_amount');
});

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
