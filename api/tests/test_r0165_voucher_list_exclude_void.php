<?php
/**
 * R-0165: GET /vouchers の取消済み除外テスト
 *
 * 起動: php api/tests/test_r0165_voucher_list_exclude_void.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$testDbPath = __DIR__ . '/test_r0165_voucher_list_exclude_void_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) unlink($testDbPath);
register_shutdown_function(function () use ($testDbPath) {
    if (file_exists($testDbPath)) @unlink($testDbPath);
});

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');
$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $m) {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($m));
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}

for ($i = 1; $i <= 11; $i++) {
    $no = sprintf('R165D%02d', $i);
    $pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, voucher_date) VALUES ('$no', 'estimate', 'draft', '2026-10-10')");
}
$pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, voucher_date) VALUES ('R165V01', 'estimate', 'void', '2026-10-10')");

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

$bootstrap = __DIR__ . '/_r0165_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");
$port = 18165;
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
    $r = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health");
    if ($r !== false) { $ready = true; break; }
}
$api = "http://127.0.0.1:$port/contents/Beaver/api/vouchers";

function getJson(string $url): array {
    $body = file_get_contents($url);
    return json_decode($body, true);
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    runTest('受入条件1: exclude_void=1 の非ページング一覧は void を返さない', function () use ($api) {
        $rows = getJson($api . '?exclude_void=1');
        assertEq(11, count($rows), '件数');
        assertEq([], array_values(array_filter(array_column($rows, 'status'), fn($status) => $status === 'void')), 'voidなし');
    });

    runTest('受入条件1: exclude_void=1 のページング一覧とCOUNTは void を除外する', function () use ($api) {
        $body = getJson($api . '?exclude_void=1&page=1&per_page=10');
        assertEq(10, count($body['data']), '1ページ目の件数');
        assertEq(11, $body['meta']['total'], 'total');
        assertEq(2, $body['meta']['last_page'], 'last_page');
        assertEq([], array_values(array_filter(array_column($body['data'], 'status'), fn($status) => $status === 'void')), 'voidなし');
    });

    runTest('受入条件2: exclude_void なしは void も返す', function () use ($api) {
        $rows = getJson($api);
        assertEq(12, count($rows), '件数');
        assertEq(1, count(array_filter($rows, fn($row) => $row['status'] === 'void')), 'void件数');
    });

    runTest('受入条件3: exclude_void=1 でも status=void を優先する', function () use ($api) {
        $rows = getJson($api . '?exclude_void=1&status=void');
        assertEq(1, count($rows), '件数');
        assertEq('R165V01', $rows[0]['voucher_no'] ?? null, 'void伝票');
    });
} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $pipe) if (is_resource($pipe)) fclose($pipe);
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

$pdo = null;
echo "\n========================================\n";
echo "PASSED: $passed\n";
echo "FAILED: $failed\n";
if ($failed > 0) {
    echo "----- failures -----\n";
    foreach ($failures as $failure) echo " - $failure\n";
    exit(1);
}
@unlink($testDbPath);
exit(0);
