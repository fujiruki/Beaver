<?php
/**
 * R-0143 A-B-06: PATCH /vouchers/{id}/sync-state 単体・統合テスト
 *
 * 起動: php api/tests/test_sync_state.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_sync_state_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) unlink($testDbPath);
register_shutdown_function(function () use ($testDbPath) {
    if (file_exists($testDbPath)) @unlink($testDbPath);
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

$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT INTO customers (name) VALUES ('テスト得意先')");
$customerId = (int)$pdo->lastInsertId();
$pdo->prepare("
    INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type)
    VALUES ('S-SYNC-001', 'sales', 'approved', ?, '2026-09-01', 'exclusive')
")->execute([$customerId]);
$voucherId = (int)$pdo->lastInsertId();

$passed = 0; $failed = 0; $failures = [];
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

$bootstrap = __DIR__ . '/_server_bootstrap_sync_state.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18101;
$serverProc = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $ROOT, $ROOT . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $serverPipes,
    $ROOT
);
if (!is_resource($serverProc)) {
    @unlink($bootstrap);
    throw new RuntimeException('php ビルトインサーバを起動できませんでした');
}

$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
    $r = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
    if ($r !== false) { $ready = true; break; }
}

function httpJson(int $port, string $method, string $path, ?array $body = null): array {
    $opts = ['method' => $method, 'header' => "Content-Type: application/json\r\nConnection: close\r\n", 'ignore_errors' => true, 'timeout' => 5];
    if ($body !== null) $opts['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    $ctx = stream_context_create(['http' => $opts]);
    $rawBody = false; $hdr = [];
    for ($t = 0; $t < 3 && $rawBody === false; $t++) {
        if ($t > 0) usleep(200000);
        $rawBody = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
        if (isset($http_response_header)) $hdr = $http_response_header;
    }
    return ['status' => $hdr[0] ?? '', 'body' => json_decode((string)$rawBody, true)];
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0143 A-B-06 PATCH /vouchers/{id}/sync-state ===\n";

    runTest('sync_pending=trueで更新できる', function () use ($port, $pdo, $voucherId) {
        $r = httpJson($port, 'PATCH', "/vouchers/$voucherId/sync-state", ['sync_pending' => true]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq($voucherId, $r['body']['voucher_id'] ?? null, 'voucher_id');
        assertEq(true, $r['body']['sync_pending'] ?? null, 'sync_pending');
        $db = (int)$pdo->query("SELECT sync_pending FROM vouchers WHERE id = $voucherId")->fetchColumn();
        assertEq(1, $db, 'DB上のsync_pendingが1');
    });

    runTest('sync_pending=falseで更新できる', function () use ($port, $pdo, $voucherId) {
        $r = httpJson($port, 'PATCH', "/vouchers/$voucherId/sync-state", ['sync_pending' => false]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq(false, $r['body']['sync_pending'] ?? null, 'sync_pending');
        $db = (int)$pdo->query("SELECT sync_pending FROM vouchers WHERE id = $voucherId")->fetchColumn();
        assertEq(0, $db, 'DB上のsync_pendingが0');
    });

    runTest('存在しないvoucher_idは404', function () use ($port) {
        $r = httpJson($port, 'PATCH', '/vouchers/999999/sync-state', ['sync_pending' => true]);
        assertTrue(str_contains($r['status'], '404'), 'HTTP 404: ' . $r['status']);
    });

    runTest('sync_pending未指定は400', function () use ($port, $voucherId) {
        $r = httpJson($port, 'PATCH', "/vouchers/$voucherId/sync-state", []);
        assertTrue(str_contains($r['status'], '400'), 'HTTP 400: ' . $r['status']);
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

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
