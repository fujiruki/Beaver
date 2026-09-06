<?php
/**
 * R-0143 (3) 同期再開前の基準線記録 単体テスト
 *
 * 起動: php api/tests/test_r0143_baseline_snapshot.php
 *
 * api/manual/r0143_baseline_snapshot.php の集計ロジックを
 * テスト専用 SQLite DB に対してのみ実行して検証する。
 * 実DB（api/database.sqlite）には一切触れない。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_r0143_snapshot_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
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
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}

require_once $ROOT . '/manual/r0143_baseline_snapshot.php';

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

function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

// ============================================================
// テスト用データ投入
// vouchers: access_voucher_id NULLが2件（estimate1・sales1）、
//           非NULLがestimate2件・sales1件、最大値300
// voucher_lines: 1件だけ edited_in_beaver=1（estimate2の伝票に付与）
// sales で source_estimate_no 非NULLは1件
// customers: 前回同様5件（総数5・access_customer_no非NULL2・code>=90001が1・同名重複1組）
// ============================================================
$pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, access_voucher_id) VALUES ('SNAP-E00001', 'estimate', '2026-01-01', NULL)");
$pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, access_voucher_id) VALUES ('SNAP-E00002', 'estimate', '2026-01-02', 100)");
$estimate2Id = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, access_voucher_id, source_estimate_no) VALUES ('SNAP-S00001', 'sales', '2026-01-03', 200, '100')");
$pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, access_voucher_id, source_estimate_no) VALUES ('SNAP-S00002', 'sales', '2026-01-04', NULL, NULL)");
$pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, voucher_date, access_voucher_id) VALUES ('SNAP-E00003', 'estimate', '2026-01-05', 300)");

$pdo->exec("INSERT INTO voucher_lines (voucher_id, line_no, edited_in_beaver) VALUES ({$estimate2Id}, 1, 1)");

$pdo->exec("INSERT INTO customers (code, name, access_customer_no) VALUES ('00001', 'テスト太郎', NULL)");
$pdo->exec("INSERT INTO customers (code, name, access_customer_no) VALUES ('00002', 'テスト太郎', '12345')");
$pdo->exec("INSERT INTO customers (code, name, access_customer_no) VALUES ('90005', 'テスト花子', '67890')");
$pdo->exec("INSERT INTO customers (code, name, access_customer_no) VALUES ('00004', 'テスト次郎', NULL)");
$pdo->exec("INSERT INTO customers (code, name, access_customer_no) VALUES ('00005', 'テスト三郎', NULL)");

echo "=== R-0143 (3) 同期再開前の基準線記録 テスト ===\n\n";

runTest('G-14-1: access_voucher_id IS NULLが2件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(2, $s['g14_1'], 'g14_1');
});

runTest('G-14-2: access_voucher_id非NULLをvoucher_type別に集計するとestimate2件・sales1件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    $byType = [];
    foreach ($s['g14_2'] as $row) {
        $byType[$row['voucher_type']] = $row['count'];
    }
    assertEq(2, $byType['estimate'] ?? null, 'g14_2 estimate');
    assertEq(1, $byType['sales'] ?? null, 'g14_2 sales');
});

runTest('G-14-3: access_voucher_idの最大値が300', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(300, $s['g14_3'], 'g14_3');
});

runTest('G-14-4: edited_in_beaver=1の明細行が1件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(1, $s['g14_4'], 'g14_4');
});

runTest('G-14-5: G-14-4が0でないため対象伝票一覧にSNAP-E00002が1件含まれる', function () use (&$pdo, $estimate2Id) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(1, count($s['g14_5']), 'g14_5件数');
    assertEq($estimate2Id, $s['g14_5'][0]['id'], 'g14_5 id');
    assertEq('SNAP-E00002', $s['g14_5'][0]['voucher_no'], 'g14_5 voucher_no');
    assertEq(100, $s['g14_5'][0]['access_voucher_id'], 'g14_5 access_voucher_id');
});

runTest('G-14-6: sales かつ source_estimate_no 非NULLが1件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(1, $s['g14_6'], 'g14_6');
});

runTest('G-19: customers総数が5件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(5, $s['g19'], 'g19');
});

runTest('G-20: access_customer_no非NULLが2件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(2, $s['g20'], 'g20');
});

runTest('G-21: code>=90001が1件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(1, $s['g21'], 'g21');
});

runTest('G-22: name重複がテスト太郎の1グループ・2件', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertEq(1, count($s['g22']), 'g22グループ数');
    assertEq('テスト太郎', $s['g22'][0]['name'], 'g22名前');
    assertEq(2, $s['g22'][0]['count'], 'g22件数');
});

runTest('recorded_at がJST時刻のY-m-d H:i:s形式で入る', function () use (&$pdo) {
    $s = r0143ComputeBaselineSnapshot($pdo);
    assertTrue((bool)preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $s['recorded_at']), 'recorded_at形式: ' . $s['recorded_at']);
});

runTest('CLIスクリプトはoutput_path指定時にJSONをファイルへ保存する', function () use ($ROOT, $testDbPath) {
    $outputPath = sys_get_temp_dir() . '/r0143_snapshot_test_' . getmypid() . '.json';
    if (file_exists($outputPath)) unlink($outputPath);

    $script = escapeshellarg($ROOT . '/manual/r0143_baseline_snapshot.php');
    $db = escapeshellarg($testDbPath);
    $out = escapeshellarg($outputPath);
    exec("php {$script} {$db} {$out} 2>&1", $lines, $exitCode);

    assertEq(0, $exitCode, 'CLI終了コード: ' . implode("\n", $lines));
    assertTrue(file_exists($outputPath), '出力ファイルが作成される');

    $saved = json_decode(file_get_contents($outputPath), true);
    assertTrue(is_array($saved), '出力ファイルがJSONとしてパースできる');
    assertEq(5, $saved['g19'], '保存されたJSONのg19');

    @unlink($outputPath);
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
