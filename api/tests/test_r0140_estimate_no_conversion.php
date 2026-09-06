<?php
/**
 * R-0140 (5) 見積番号 +10000 への追従 単体テスト
 *
 * 起動: php api/tests/test_r0140_estimate_no_conversion.php
 *
 * api/manual/r0140_5_estimate_no_plus10000.sql の変換ロジックを
 * テスト専用 SQLite DB に対してのみ実行して検証する。
 * 実DB（api/database.sqlite）には一切触れない。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_r0140_conv_' . getmypid() . '.sqlite';
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
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0)");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('sales', 0)");

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

/**
 * api/manual/r0140_5_estimate_no_plus10000.sql をテストDBに適用する。
 */
function applyConversion(PDO $pdo, string $root): void {
    $sql = file_get_contents($root . '/manual/r0140_5_estimate_no_plus10000.sql');
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        $pdo->exec($stmt);
    }
}

// runHelperCase: test_sync.php と同一の子プロセス実行ヘルパ（sync_helpers 関数を呼ぶ）
function runHelperCase(string $testDbPath, string $func, $arg1, ?array $body): array {
    $worker = __DIR__ . '/_worker.php';
    $payload = json_encode([
        'db'   => $testDbPath,
        'func' => $func,
        'arg1' => $arg1,
        'body' => $body,
    ], JSON_UNESCAPED_UNICODE);

    $descriptors = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $proc = proc_open(['php', $worker], $descriptors, $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException('子プロセス起動に失敗');
    }
    fwrite($pipes[0], $payload);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);

    $decoded = json_decode($stdout, true);
    if (!is_array($decoded)) {
        throw new RuntimeException("worker からの JSON パース失敗。stdout=$stdout stderr=$stderr");
    }
    return $decoded;
}

// ============================================================
// テスト用データ投入（5-1 の前提: 見積 access_voucher_id=1704、売上 source_estimate_no="1704"）
// ============================================================
$pdo->exec("
    INSERT INTO vouchers (voucher_no, voucher_type, status, voucher_date, total_amount, access_voucher_id, access_voucher_no)
    VALUES ('MIG-E00001', 'estimate', 'approved', '2024-04-14', 25440, 1704, '1704')
");
$pdo->exec("
    INSERT INTO vouchers (voucher_no, voucher_type, status, voucher_date, total_amount, access_voucher_id, access_voucher_no, source_estimate_no)
    VALUES ('MIG-S00001', 'sales', 'approved', '2024-05-01', 25440, 4635, '4635', '1704')
");

echo "=== R-0140 (5) 見積番号+10000変換 テスト ===\n\n";

runTest('5-1: 見積 access_voucher_id=1704・売上 source_estimate_no="1704" を持つテストDBで変換を実行', function () use (&$pdo, $ROOT) {
    applyConversion($pdo, $ROOT);

    $estimate = $pdo->query("SELECT access_voucher_id, access_voucher_no FROM vouchers WHERE voucher_no = 'MIG-E00001'")->fetch();
    assertEq(11704, (int)$estimate['access_voucher_id'], '見積 access_voucher_id が11704になる');
    assertEq('11704', $estimate['access_voucher_no'], '見積 access_voucher_no が11704になる');

    $sales = $pdo->query("SELECT source_estimate_no FROM vouchers WHERE voucher_no = 'MIG-S00001'")->fetch();
    assertEq('11704', $sales['source_estimate_no'], '売上 source_estimate_no が11704になる');
});

runTest('5-2: もう一度実行しても変化なし（冪等）', function () use (&$pdo, $ROOT) {
    applyConversion($pdo, $ROOT);

    $estimate = $pdo->query("SELECT access_voucher_id, access_voucher_no FROM vouchers WHERE voucher_no = 'MIG-E00001'")->fetch();
    assertEq(11704, (int)$estimate['access_voucher_id'], '見積 access_voucher_id は11704のまま');
    assertEq('11704', $estimate['access_voucher_no'], '見積 access_voucher_no は11704のまま');

    $sales = $pdo->query("SELECT source_estimate_no FROM vouchers WHERE voucher_no = 'MIG-S00001'")->fetch();
    assertEq('11704', $sales['source_estimate_no'], '売上 source_estimate_no は11704のまま');
});

runTest('5-3: 変換前後で source_estimate_no が指す見積が実在する件数は減らない', function () use (&$pdo) {
    // 5-1/5-2 適用後の状態で、source_estimate_no が指す見積が実在するか確認する。
    // 見積・売上とも同じ変換で access_voucher_no / source_estimate_no を +10000 しているため、
    // 変換の前後を通じて紐付けは維持される（孤児が発生しない）。
    $matchCount = (int)$pdo->query("
        SELECT COUNT(*) FROM vouchers s
        WHERE s.voucher_type = 'sales' AND s.source_estimate_no IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM vouchers e
              WHERE e.voucher_type = 'estimate' AND e.access_voucher_no = s.source_estimate_no
          )
    ")->fetchColumn();
    assertEq(1, $matchCount, '変換後も source_estimate_no=11704 の売上は見積11704に対応づく（減らない）');
});

runTest('5-4: 変換後に検体voucher_sales_12962.jsonをsyncすると200・値をそのまま保存', function () use (&$pdo, $ROOT, $testDbPath) {
    $pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('R0140テスト得意先755', '755')");

    $fixturePath = dirname($ROOT) . '/docs/spec/fixtures/accesstategu_r086/voucher_sales_12962.json';
    $payload = json_decode(file_get_contents($fixturePath), true);

    $r = runHelperCase($testDbPath, 'syncVoucherUpsert', null, $payload);
    assertEq(200, $r['code'], 'http code: ' . json_encode($r));

    $row = $pdo->query("SELECT access_voucher_id, billing_date, delivery_date FROM vouchers WHERE access_voucher_id = 12962")->fetch();
    assertTrue($row !== false, 'access_voucher_id=12962 の伝票が保存される');
    assertEq(12962, (int)$row['access_voucher_id'], 'access_voucher_id=12962がそのまま保存される');
    assertEq('2026-12-25', $row['billing_date'], 'billing_dateがそのまま保存される（Beaver側で再計算しない）');
    assertEq('2026-11-25', $row['delivery_date'], 'delivery_dateがそのまま保存される（Beaver側で再計算しない）');
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
