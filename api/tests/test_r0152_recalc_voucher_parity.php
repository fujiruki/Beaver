<?php
/**
 * R-0152: recalcVoucher() をAccess(CalcVoucherTotals)の計算式に揃えるテスト
 *
 * 起動: php api/tests/test_r0152_recalc_voucher_parity.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_r0152_recalc_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
    $GLOBALS['pdo'] = null;
    if (file_exists($testDbPath)) {
        @unlink($testDbPath);
    }
});

require_once $ROOT . '/routes/sync_helpers.php';
require_once $ROOT . '/manual/r0151_recalc_voucher_totals.php';

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=OFF');
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
        throw new RuntimeException(sprintf('%s expected=%s actual=%s', $label, var_export($expected, true), var_export($actual, true)));
    }
}

function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

function mkVoucher(PDO $pdo, array $o = []): int {
    $cid = $pdo->query('SELECT id FROM customers LIMIT 1')->fetchColumn();
    if (!$cid) {
        $pdo->exec("INSERT INTO customers (name, is_active) VALUES ('テスト得意先', 1)");
        $cid = $pdo->lastInsertId();
    }
    $o += [
        'voucher_type' => 'sales', 'tax_input_type' => 'exclusive',
        'consumption_tax_type' => '外税/伝票計', 'voucher_date' => '2026-01-10',
        'delivery_date' => null, 'updated_at' => '2020-01-01 00:00:00',
    ];
    $pdo->prepare('INSERT INTO vouchers (voucher_type, tax_input_type, consumption_tax_type, customer_id, voucher_date, delivery_date, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)')
        ->execute([$o['voucher_type'], $o['tax_input_type'], $o['consumption_tax_type'], $cid, $o['voucher_date'], $o['delivery_date'], $o['updated_at']]);
    return (int)$pdo->lastInsertId();
}

function mkLine(PDO $pdo, int $vid, string $type, float $amt, string $cat = 'taxable'): void {
    static $no = 0;
    $pdo->prepare('INSERT INTO voucher_lines (voucher_id, line_no, line_type, line_total, tax_category, quantity) VALUES (?, ?, ?, ?, ?, 1)')
        ->execute([$vid, ++$no, $type, $amt, $cat]);
}

function getV(PDO $pdo, int $id): array {
    $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch();
}

function recalcAndGet(PDO $pdo, int $id): array {
    recalcVoucher($pdo, $id);
    return getV($pdo, $id);
}

echo "=== R-0152 recalcVoucher Access整合 ===\n\n";

echo "-- 1. 税率の日付判定\n";
foreach ([
    ['売上 delivery 2019-09-30 は8%', ['delivery_date' => '2019-09-30', 'voucher_date' => '2019-12-01'], 800],
    ['売上 delivery 2019-10-01 は10%', ['delivery_date' => '2019-10-01', 'voucher_date' => '2019-01-01'], 1000],
    ['売上 delivery NULL は voucher_date(2019-09-30) で8%', ['voucher_date' => '2019-09-30'], 800],
    ['見積は delivery_date があっても voucher_date(2019-09-30) で8%', ['voucher_type' => 'estimate', 'voucher_date' => '2019-09-30', 'delivery_date' => '2020-01-01'], 800],
    ['2014-03-31 は5%', ['voucher_date' => '2014-03-31'], 500],
    ['1997-04-01 は5%', ['voucher_date' => '1997-04-01'], 500],
] as [$name, $opts, $tax]) {
    runTest($name, function () use ($pdo, $opts, $tax) {
        $id = mkVoucher($pdo, $opts);
        mkLine($pdo, $id, 'normal', 10000);
        $v = recalcAndGet($pdo, $id);
        assertEq($tax, (int)$v['tax_amount'], 'tax_amount');
        assertEq(10000 + $tax, (int)$v['total_amount'], 'total_amount');
    });
}

echo "-- 2. dodai-back代表例\n";
runTest('Beaver 5814: 課税19000 5% → 税950・合計19950', function () use ($pdo) {
    $id = mkVoucher($pdo, ['voucher_date' => '2010-05-01']);
    mkLine($pdo, $id, 'normal', 19000);
    $v = recalcAndGet($pdo, $id);
    assertEq(950, (int)$v['tax_amount'], 'tax');
    assertEq(19950, (int)$v['total_amount'], 'total');
});
runTest('Beaver 5811: 課税23000・値引-4150 5% → 税1150・合計20000', function () use ($pdo) {
    $id = mkVoucher($pdo, ['voucher_date' => '2010-05-01']);
    mkLine($pdo, $id, 'normal', 23000);
    mkLine($pdo, $id, 'discount', -4150);
    $v = recalcAndGet($pdo, $id);
    assertEq(1150, (int)$v['tax_amount'], 'tax');
    assertEq(4150, (int)$v['subtotal_discount'], 'subtotal_discount');
    assertEq(20000, (int)$v['total_amount'], 'total');
});
runTest('Beaver 9004: 課税28200・値引-3020 10% → 税2820・合計28000', function () use ($pdo) {
    $id = mkVoucher($pdo, ['voucher_date' => '2024-05-01']);
    mkLine($pdo, $id, 'normal', 28200);
    mkLine($pdo, $id, 'discount', -3020);
    $v = recalcAndGet($pdo, $id);
    assertEq(2820, (int)$v['tax_amount'], 'tax');
    assertEq(28000, (int)$v['total_amount'], 'total');
});

echo "-- 3〜5. 値引abs・外税/請求計・負数\n";
runTest('値引行の合計が正でも絶対値を差し引く', function () use ($pdo) {
    $id = mkVoucher($pdo);
    mkLine($pdo, $id, 'normal', 10000);
    mkLine($pdo, $id, 'discount', 500);
    mkLine($pdo, $id, 'discount', -200);
    $v = recalcAndGet($pdo, $id);
    assertEq(300, (int)$v['subtotal_discount'], 'subtotal_discount は合計の絶対値');
    assertEq(10000 + 1000 - 300, (int)$v['total_amount'], 'total');
});
runTest('値引行の合計が負でも正で保存・差し引く', function () use ($pdo) {
    $id = mkVoucher($pdo);
    mkLine($pdo, $id, 'normal', 10000);
    mkLine($pdo, $id, 'discount', -1000);
    $v = recalcAndGet($pdo, $id);
    assertEq(1000, (int)$v['subtotal_discount'], 'subtotal_discount');
    assertEq(10000, (int)$v['total_amount'], 'total');
});
runTest('外税/請求計は税0', function () use ($pdo) {
    $id = mkVoucher($pdo, ['consumption_tax_type' => '外税/請求計']);
    mkLine($pdo, $id, 'normal', 10000);
    mkLine($pdo, $id, 'normal', 300, 'non_taxable');
    $v = recalcAndGet($pdo, $id);
    assertEq(0, (int)$v['tax_amount'], 'tax');
    assertEq(10300, (int)$v['total_amount'], 'total');
});
runTest('負の課税小計は0方向に切り捨て(-1005*10% = -100)', function () use ($pdo) {
    $id = mkVoucher($pdo);
    mkLine($pdo, $id, 'normal', -1005);
    $v = recalcAndGet($pdo, $id);
    assertEq(-100, (int)$v['tax_amount'], 'tax');
    assertEq(-1105, (int)$v['total_amount'], 'total');
});
runTest('浮動小数点誤差で1円欠けない(8%で2175=174、10%で30=3)', function () use ($pdo) {
    $id = mkVoucher($pdo, ['voucher_date' => '2016-01-01']);
    mkLine($pdo, $id, 'normal', 2175);
    $v = recalcAndGet($pdo, $id);
    assertEq(174, (int)$v['tax_amount'], 'tax');
    $id = mkVoucher($pdo, ['voucher_date' => '2026-01-01']);
    mkLine($pdo, $id, 'normal', 29);
    mkLine($pdo, $id, 'normal', 1);
    $v = recalcAndGet($pdo, $id);
    assertEq(3, (int)$v['tax_amount'], 'tax');
});

echo "-- 6. 内税\n";
runTest('内税: 基準日(2019-09-30)の8%で税抜き、値引abs', function () use ($pdo) {
    $id = mkVoucher($pdo, ['tax_input_type' => 'inclusive', 'voucher_date' => '2019-09-30']);
    mkLine($pdo, $id, 'normal', 10800);
    mkLine($pdo, $id, 'discount', -800);
    $v = recalcAndGet($pdo, $id);
    assertEq(800, (int)$v['tax_amount'], 'tax');
    assertEq(10000, (int)$v['subtotal_taxable'], 'subtotal_taxable');
    assertEq(800, (int)$v['subtotal_discount'], 'subtotal_discount');
    assertEq(10000, (int)$v['total_amount'], 'total');
});
runTest('内税: 負数は0方向に切り捨て(-10005 10% → 税-909)', function () use ($pdo) {
    $id = mkVoucher($pdo, ['tax_input_type' => 'inclusive']);
    mkLine($pdo, $id, 'normal', -10005);
    $v = recalcAndGet($pdo, $id);
    assertEq(-909, (int)$v['tax_amount'], 'tax');
    assertEq(-9096, (int)$v['subtotal_taxable'], 'subtotal_taxable');
});

echo "-- 7. updated_at\n";
runTest('recalcVoucher(..., false) は updated_at を変えない', function () use ($pdo) {
    $id = mkVoucher($pdo);
    mkLine($pdo, $id, 'normal', 1000);
    recalcVoucher($pdo, $id, false);
    $v = getV($pdo, $id);
    assertEq('2020-01-01 00:00:00', $v['updated_at'], 'updated_at');
    assertEq(1100, (int)$v['total_amount'], 'total');
});
runTest('recalcVoucher(...) 既定は updated_at を更新する', function () use ($pdo) {
    $id = mkVoucher($pdo);
    mkLine($pdo, $id, 'normal', 1000);
    recalcVoucher($pdo, $id);
    assertTrue(getV($pdo, $id)['updated_at'] !== '2020-01-01 00:00:00', 'updated_at が更新される');
});

echo "-- 8. Access同期の受信経路\n";
runTest('replaceSyncedLinesFromPayload(lines_mode=replace) は updated_at を変えず合計を再計算する', function () use ($pdo) {
    $id = mkVoucher($pdo, ['voucher_date' => '2010-05-01']);
    $err = replaceSyncedLinesFromPayload($pdo, $id, [
        'lines_mode' => 'replace',
        'lines' => [
            ['line_no' => 1, 'access_line_id' => 9001, 'line_type' => 'normal', 'item_name' => 'A', 'quantity' => 1, 'line_total' => 23000, 'tax_category' => '課税'],
            ['line_no' => 2, 'access_line_id' => 9002, 'line_type' => 'discount', 'item_name' => '値引', 'quantity' => 1, 'line_total' => -4150, 'tax_category' => '課税'],
        ],
    ]);
    assertEq(null, $err, 'エラーなし');
    $v = getV($pdo, $id);
    assertEq('2020-01-01 00:00:00', $v['updated_at'], 'updated_at');
    assertEq(1150, (int)$v['tax_amount'], 'tax');
    assertEq(20000, (int)$v['total_amount'], 'total');
});

echo "-- 9. 一括修復スクリプト\n";
runTest('見積も対象・updated_at不変・再dry-run 0件・recalcVoucherと同値・voucher_type出力', function () use ($pdo) {
    $ids = [];
    $ids[] = mkVoucher($pdo, ['voucher_type' => 'estimate', 'voucher_date' => '2010-05-01', 'delivery_date' => '2024-01-01']);
    mkLine($pdo, $ids[0], 'normal', 23000);
    mkLine($pdo, $ids[0], 'discount', -4150);
    $ids[] = mkVoucher($pdo, ['voucher_date' => '2019-09-30']);
    mkLine($pdo, $ids[1], 'normal', 10005);
    mkLine($pdo, $ids[1], 'normal', 100, 'non_taxable');
    $ids[] = mkVoucher($pdo, ['tax_input_type' => 'inclusive']);
    mkLine($pdo, $ids[2], 'normal', -10005);
    $ids[] = mkVoucher($pdo, ['consumption_tax_type' => '外税/請求計']);
    mkLine($pdo, $ids[3], 'normal', 5000);
    foreach ($ids as $id) {
        $pdo->prepare('UPDATE vouchers SET total_amount = 1, tax_amount = 1 WHERE id = ?')->execute([$id]);
    }

    $dry = r0151RecalcVoucherTotals($pdo, false);
    $targetIds = array_column($dry['targets'], 'id');
    foreach ($ids as $id) assertTrue(in_array($id, $targetIds, true), "id=$id が対象");
    $types = array_column($dry['targets'], 'voucher_type', 'id');
    assertEq('estimate', $types[$ids[0]], 'voucher_type');
    assertEq('sales', $types[$ids[1]], 'voucher_type');

    $res = r0151RecalcVoucherTotals($pdo, true);
    assertTrue($res['executed'], 'executed');
    assertEq(0, r0151RecalcVoucherTotals($pdo, false)['target_count'], '再dry-runは0件');

    foreach ($ids as $id) {
        $after = getV($pdo, $id);
        assertEq('2020-01-01 00:00:00', $after['updated_at'], "updated_at id=$id");
        $expected = computeVoucherTotals($pdo, $id);
        foreach ($expected as $col => $val) {
            assertTrue(abs((float)$after[$col] - (float)$val) < 0.0001, "id=$id $col 期待={$val} 実際={$after[$col]}");
        }
    }
    assertEq(20000, (int)getV($pdo, $ids[0])['total_amount'], '見積の合計');
});

echo "\n結果: {$passed} PASS / {$failed} FAIL\n";
if ($failed > 0) {
    foreach ($failures as $f) echo "  - $f\n";
    exit(1);
}
exit(0);
