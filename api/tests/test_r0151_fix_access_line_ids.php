<?php
/**
 * R-0151 (5): 既存17行の access_line_id 修復スクリプトのテスト
 *
 * 起動: php api/tests/test_r0151_fix_access_line_ids.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_r0151_fix_access_line_ids_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
    if (file_exists($testDbPath)) {
        @unlink($testDbPath);
    }
});

require_once $ROOT . '/manual/r0151_fix_access_line_ids.php';

// ============================================================
// テストハーネス
// ============================================================
$passed = 0;
$failed = 0;
$failures = [];

function runTest(string $name, callable $fn): void
{
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

function assertEq($expected, $actual, string $label = '', array $debug = []): void
{
    if ($expected !== $actual) {
        $dbg = empty($debug) ? '' : ' debug=' . json_encode($debug, JSON_UNESCAPED_UNICODE);
        throw new RuntimeException(sprintf(
            "%s expected=%s actual=%s%s",
            $label,
            var_export($expected, true),
            var_export($actual, true),
            $dbg
        ));
    }
}

function assertTrue(bool $cond, string $label = ''): void
{
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

/**
 * テスト用DBを新規作成し、R0151_FIX_MAP 通りの7伝票・17明細を投入する。
 * $mutate で一部の行を書き換えて、不一致・既存設定済み等のケースを作れる。
 */
function r0151SetupDb(string $path, ?callable $mutate = null): PDO
{
    global $ROOT;
    if (file_exists($path)) {
        unlink($path);
    }
    $pdo = new PDO('sqlite:' . $path, null, null, [
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
            try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
        }
    }

    $voucherIds = [];
    foreach (R0151_FIX_MAP as $map) {
        $accessVoucherNo = $map['access_voucher_no'];
        if (!isset($voucherIds[$accessVoucherNo])) {
            $pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, voucher_date, total_amount, access_voucher_id)
                VALUES ('R0151-FIX-$accessVoucherNo', 'sales', 'approved', '2026-09-01', 0, $accessVoucherNo)");
            $voucherIds[$accessVoucherNo] = (int)$pdo->lastInsertId();
        }
        $voucherId = $voucherIds[$accessVoucherNo];
        $itemName = $pdo->quote($map['item_name']);
        $pdo->exec("INSERT INTO voucher_lines (id, voucher_id, line_no, line_type, item_name, quantity, line_total, tax_category, source, access_line_id, updated_at)
            VALUES ({$map['beaver_line_id']}, $voucherId, {$map['line_no']}, 'normal', $itemName, 1, {$map['line_total']}, '課税', 'beaver', NULL, '2026-09-01 00:00:00')");
    }

    if ($mutate !== null) {
        $mutate($pdo);
    }

    return $pdo;
}

// ============================================================
// テスト本体
// ============================================================

runTest('全17行一致する場合、dry-runで全件OKと判定される', function () use ($testDbPath) {
    $pdo = r0151SetupDb($testDbPath);
    $result = r0151FixAccessLineIds($pdo, false);

    assertEq(17, $result['total_count'], '対応表は17行');
    assertEq(17, $result['ok_count'], '全件OK');
    assertTrue($result['all_ok'], 'all_ok=true');
    assertTrue($result['executed'] === false, 'dry-runではexecuted=false');

    $count = (int)$pdo->query('SELECT COUNT(*) FROM voucher_lines WHERE access_line_id IS NOT NULL')->fetchColumn();
    assertEq(0, $count, 'dry-runではDBは変更されない');
});

runTest('item_nameが不一致の行があれば、dry-runでも中止判定され何も変更されない', function () use ($testDbPath) {
    $pdo = r0151SetupDb($testDbPath, function (PDO $pdo) {
        $pdo->exec("UPDATE voucher_lines SET item_name = '別の品名' WHERE id = 25492");
    });

    $dry = r0151FixAccessLineIds($pdo, false);
    assertTrue($dry['all_ok'] === false, 'item_name不一致でall_ok=false(dry-run)');

    $exec = r0151FixAccessLineIds($pdo, true);
    assertTrue($exec['all_ok'] === false, 'item_name不一致でall_ok=false(execute指定時も)');
    assertTrue($exec['executed'] === false, '不一致があるのでexecuted=falseのまま');

    $count = (int)$pdo->query('SELECT COUNT(*) FROM voucher_lines WHERE access_line_id IS NOT NULL')->fetchColumn();
    assertEq(0, $count, '不一致があるため何も変更されない（部分適用禁止）');
});

runTest('line_totalが不一致の行があれば、dry-run/executeとも中止判定され何も変更されない', function () use ($testDbPath) {
    $pdo = r0151SetupDb($testDbPath, function (PDO $pdo) {
        $pdo->exec("UPDATE voucher_lines SET line_total = 99999 WHERE id = 25496");
    });

    $dry = r0151FixAccessLineIds($pdo, false);
    assertTrue($dry['all_ok'] === false, 'line_total不一致でall_ok=false');

    $exec = r0151FixAccessLineIds($pdo, true);
    assertTrue($exec['executed'] === false, '不一致があるのでexecuted=falseのまま');

    $count = (int)$pdo->query('SELECT COUNT(*) FROM voucher_lines WHERE access_line_id IS NOT NULL')->fetchColumn();
    assertEq(0, $count, '不一致があるため何も変更されない（部分適用禁止）');
});

runTest('--execute実行後、17行のaccess_line_idが正しく設定される', function () use ($testDbPath) {
    $pdo = r0151SetupDb($testDbPath);

    $exec = r0151FixAccessLineIds($pdo, true);
    assertTrue($exec['executed'], '全件OKなのでexecuted=true');
    assertEq(17, count($exec['verified']), '17行分の照合結果が返る');
    foreach ($exec['verified'] as $v) {
        assertTrue($v['ok'], 'beaver_line_id=' . $v['beaver_line_id'] . ' の照合OK');
    }

    foreach (R0151_FIX_MAP as $map) {
        $actual = (int)$pdo->query("SELECT access_line_id FROM voucher_lines WHERE id = {$map['beaver_line_id']}")->fetchColumn();
        assertEq($map['access_line_id'], $actual, 'id=' . $map['beaver_line_id'] . ' のaccess_line_id');
    }

    $updatedAt = $pdo->query('SELECT updated_at FROM voucher_lines WHERE id = 25485')->fetchColumn();
    assertEq('2026-09-01 00:00:00', $updatedAt, 'updated_atは変更されない');
});

runTest('既にaccess_line_idが設定済みの行がある場合は中止される', function () use ($testDbPath) {
    $pdo = r0151SetupDb($testDbPath, function (PDO $pdo) {
        $pdo->exec('UPDATE voucher_lines SET access_line_id = 99999999 WHERE id = 25352');
    });

    $dry = r0151FixAccessLineIds($pdo, false);
    assertTrue($dry['all_ok'] === false, '設定済みの行があるとall_ok=false');

    $exec = r0151FixAccessLineIds($pdo, true);
    assertTrue($exec['executed'] === false, '設定済みの行があるとexecuted=falseのまま');

    $count = (int)$pdo->query("SELECT COUNT(*) FROM voucher_lines WHERE access_line_id IS NOT NULL AND id != 25352")->fetchColumn();
    assertEq(0, $count, '他の行も一切変更されない（部分適用禁止）');
});

// ============================================================
// 結果サマリ
// ============================================================
echo "\n========================================\n";
echo "PASSED: $passed\n";
echo "FAILED: $failed\n";
if ($failed > 0) {
    echo "----- failures -----\n";
    foreach ($failures as $f) echo " - $f\n";
    exit(1);
}
@unlink($testDbPath);
exit(0);
