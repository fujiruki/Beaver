<?php
/**
 * R-0187: GET /sync/changes 受け入れテスト
 *
 * 起動: php api/tests/test_r0187_sync_changes.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

function makeTestDb(string $root, string $dbPath): PDO {
    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec(file_get_contents($root . '/schema.sql'));
    $migrations = glob($root . '/migrations/*.sql');
    sort($migrations);
    foreach ($migrations as $migration) {
        $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($migration));
        foreach (explode(';', $sql) as $statement) {
            $statement = trim($statement);
            if ($statement === '') continue;
            try { $pdo->exec($statement); } catch (Throwable $_) { /* 重複系は無視 */ }
        }
    }
    return $pdo;
}

function startServer(string $root, string $bootstrap, int $port): mixed {
    $proc = proc_open(
        ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
        $pipes,
        $root
    );
    if (!is_resource($proc)) throw new RuntimeException('PHPサーバを起動できませんでした');
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
        if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx) !== false) return $proc;
    }
    proc_terminate($proc);
    proc_close($proc);
    throw new RuntimeException('PHPサーバが応答しません');
}

function httpJson(int $port, string $path, array $headers = []): array {
    $header = "Connection: close\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers));
    $ctx = stream_context_create(['http' => ['method' => 'GET', 'header' => $header, 'ignore_errors' => true, 'timeout' => 5]]);
    $raw = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    return ['status' => $http_response_header[0] ?? '', 'body' => json_decode((string)$raw, true)];
}

function resetData(PDO $pdo): void {
    $pdo->exec('DELETE FROM vouchers; DELETE FROM projects; DELETE FROM customers');
}

function insertCustomer(PDO $pdo, string $updatedAt, ?string $lastSyncedAt): int {
    $stmt = $pdo->prepare('INSERT INTO customers (code, name, updated_at, last_synced_at) VALUES (?, ?, ?, ?)');
    $stmt->execute(['C' . bin2hex(random_bytes(4)), 'テスト得意先', $updatedAt, $lastSyncedAt]);
    return (int)$pdo->lastInsertId();
}

function insertVoucher(PDO $pdo, int $customerId, string $updatedAt, ?string $lastSyncedAt, string $status = 'draft'): void {
    $stmt = $pdo->prepare("INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, updated_at, last_synced_at) VALUES (?, 'estimate', ?, ?, '2026-10-20', ?, ?)");
    $stmt->execute(['V' . bin2hex(random_bytes(4)), $status, $customerId, $updatedAt, $lastSyncedAt]);
}

$passed = 0; $failed = 0; $failures = [];
function runTest(string $name, callable $fn): void {
    global $passed, $failed, $failures;
    try { $fn(); echo "  [OK] $name\n"; $passed++; }
    catch (Throwable $e) { echo "  [NG] $name :: {$e->getMessage()}\n"; $failed++; $failures[] = "$name: {$e->getMessage()}"; }
}
function assertEq($expected, $actual, string $label): void {
    if ($expected !== $actual) throw new RuntimeException("$label expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
}
function assertTrue(bool $condition, string $label): void {
    if (!$condition) throw new RuntimeException($label);
}

$dbPath = __DIR__ . '/test_r0187_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_r0187_bootstrap.php';
$pdo = makeTestDb($ROOT, $dbPath);
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$port = 18187;
$proc = null;
try {
    $proc = startServer($ROOT, $bootstrap, $port);
    $since = '2026-10-20 12:00:00'; // UTCでは03:00:00

    echo "=== R-0187 GET /sync/changes ===\n";
    runTest('1. Beaverで更新した伝票を数える', function () use ($pdo, $port, $since) {
        resetData($pdo); $customerId = insertCustomer($pdo, '2026-10-20 02:00:00', '2026-10-20 02:00:00');
        insertVoucher($pdo, $customerId, '2026-10-20 04:00:00', '2026-10-20 03:30:00');
        assertEq(1, httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['vouchers'] ?? null, 'vouchers');
    });
    runTest('2. Accessがpushした伝票は数えない', function () use ($pdo, $port, $since) {
        resetData($pdo); $customerId = insertCustomer($pdo, '2026-10-20 02:00:00', '2026-10-20 02:00:00');
        insertVoucher($pdo, $customerId, '2026-10-20 04:00:00', '2026-10-20 04:00:00');
        assertEq(0, httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['vouchers'] ?? null, 'vouchers');
    });
    runTest('3. last_synced_atがNULLの伝票を数える', function () use ($pdo, $port, $since) {
        resetData($pdo); $customerId = insertCustomer($pdo, '2026-10-20 02:00:00', '2026-10-20 02:00:00');
        insertVoucher($pdo, $customerId, '2026-10-20 04:00:00', null);
        assertEq(1, httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['vouchers'] ?? null, 'vouchers');
    });
    runTest('4. since以前の伝票は数えない', function () use ($pdo, $port, $since) {
        resetData($pdo); $customerId = insertCustomer($pdo, '2026-10-20 02:00:00', '2026-10-20 02:00:00');
        insertVoucher($pdo, $customerId, '2026-10-20 03:00:00', null);
        assertEq(0, httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['vouchers'] ?? null, 'vouchers');
    });
    runTest('5. void済み伝票も条件を満たせば数える', function () use ($pdo, $port, $since) {
        resetData($pdo); $customerId = insertCustomer($pdo, '2026-10-20 02:00:00', '2026-10-20 02:00:00');
        insertVoucher($pdo, $customerId, '2026-10-20 04:00:00', null, 'void');
        assertEq(1, httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['vouchers'] ?? null, 'vouchers');
    });
    runTest('6. 得意先も伝票と同じ条件で数える', function () use ($pdo, $port, $since) {
        resetData($pdo);
        insertCustomer($pdo, '2026-10-20 04:00:00', '2026-10-20 03:30:00');
        insertCustomer($pdo, '2026-10-20 04:00:00', '2026-10-20 04:00:00');
        insertCustomer($pdo, '2026-10-20 05:00:00', null);
        insertCustomer($pdo, '2026-10-20 03:00:00', null);
        assertEq(2, httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['customers'] ?? null, 'customers');
    });
    runTest('7. 案件はupdated_atがsinceより後なら数える', function () use ($pdo, $port, $since) {
        resetData($pdo); $customerId = insertCustomer($pdo, '2026-10-20 02:00:00', '2026-10-20 02:00:00');
        $stmt = $pdo->prepare('INSERT INTO projects (customer_id, name, updated_at) VALUES (?, ?, ?)');
        $stmt->execute([$customerId, '新しい案件', '2026-10-20 04:00:00']);
        $stmt->execute([$customerId, '境界の案件', '2026-10-20 03:00:00']);
        assertEq(1, httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['projects'] ?? null, 'projects');
    });
    runTest('8. sinceなし・形式不正は400 Invalid since', function () use ($port) {
        foreach (['/sync/changes', '/sync/changes?since=invalid'] as $path) {
            $r = httpJson($port, $path);
            assertTrue(str_contains($r['status'], '400'), "HTTP 400: {$r['status']}");
            assertEq('Invalid since', $r['body']['error'] ?? null, 'error');
        }
    });
    runTest('9. server_timeはJSTの所定形式', function () use ($port, $since) {
        $timezone = new DateTimeZone('Asia/Tokyo');
        $beforeNow = new DateTime('now', $timezone);
        $before = DateTime::createFromFormat('!Y-m-d H:i:s', $beforeNow->format('Y-m-d H:i:s'), $timezone);
        $value = httpJson($port, '/sync/changes?since=' . urlencode($since))['body']['server_time'] ?? '';
        $afterNow = new DateTime('now', $timezone);
        $after = DateTime::createFromFormat('!Y-m-d H:i:s', $afterNow->format('Y-m-d H:i:s'), $timezone);
        $actual = DateTime::createFromFormat('!Y-m-d H:i:s', $value, $timezone);
        assertTrue($actual !== false && $actual->format('Y-m-d H:i:s') === $value, 'server_time形式');
        assertTrue($actual >= $before && $actual <= $after, 'server_timeが現在のJST');
    });
} finally {
    if (is_resource($proc)) { proc_terminate($proc); proc_close($proc); }
    @unlink($bootstrap); @unlink($dbPath);
}

$authDbPath = __DIR__ . '/test_r0187_auth_' . getmypid() . '.sqlite';
$authBootstrap = __DIR__ . '/_r0187_auth_bootstrap.php';
makeTestDb($ROOT, $authDbPath);
file_put_contents($authBootstrap, "<?php\ndefine('DB_PATH', " . var_export($authDbPath, true) . ");\ndefine('AUTH_DRIVER', 'shared');\ndefine('SYNC_TOKEN_REQUIRED', true);\ndefine('SYNC_API_TOKEN', 'unit-test-sync-token');\n");
$authPort = 18188; $authProc = null;
try {
    $authProc = startServer($ROOT, $authBootstrap, $authPort);
    runTest('10. df_session不要で同期トークンを必須とする', function () use ($authPort) {
        $path = '/sync/changes?since=' . urlencode('2026-10-20 12:00:00');
        $without = httpJson($authPort, $path);
        assertTrue(str_contains($without['status'], '401'), "トークンなしHTTP 401: {$without['status']}");
        $with = httpJson($authPort, $path, ['Authorization: Bearer unit-test-sync-token']);
        assertTrue(str_contains($with['status'], '200'), "正しいトークンHTTP 200: {$with['status']}");
    });
} finally {
    if (is_resource($authProc)) { proc_terminate($authProc); proc_close($authProc); }
    @unlink($authBootstrap); @unlink($authDbPath);
}

echo "\nPASSED: $passed\nFAILED: $failed\n";
if ($failed > 0) { foreach ($failures as $failure) echo " - $failure\n"; exit(1); }
