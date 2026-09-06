<?php
/**
 * R-0143 A-B-06: POST /sync/heartbeat・GET /sync/status 単体・統合テスト
 *
 * 起動: php api/tests/test_sync_status.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

function makeTestDb(string $root, string $dbPath): void {
    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec(file_get_contents($root . '/schema.sql'));
    $migrations = glob($root . '/migrations/*.sql');
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
}

function startServer(string $root, string $bootstrap, int $port): mixed {
    $proc = proc_open(
        ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
        $pipes,
        $root
    );
    if (!is_resource($proc)) throw new RuntimeException('php ビルトインサーバを起動できませんでした');
    $ready = false;
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
        $r = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
        if ($r !== false) { $ready = true; break; }
    }
    if (!$ready) { proc_terminate($proc); proc_close($proc); throw new RuntimeException('サーバが応答しません'); }
    return $proc;
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

// ============================================================
// (1) 機能テスト: AUTH_DRIVER=none（heartbeat未実施→null、heartbeat後→値が入る）
// ============================================================
$dbPath1 = __DIR__ . '/test_sync_status_func_' . getmypid() . '.sqlite';
if (file_exists($dbPath1)) unlink($dbPath1);
makeTestDb($ROOT, $dbPath1);
$bootstrap1 = __DIR__ . '/_sync_status_func_bootstrap.php';
file_put_contents($bootstrap1, "<?php\ndefine('DB_PATH', " . var_export($dbPath1, true) . ");\n");

$port1 = 18102;
$proc1 = null;
try {
    $proc1 = startServer($ROOT, $bootstrap1, $port1);

    echo "=== R-0143 A-B-06 GET /sync/status（heartbeat未実施） ===\n";
    runTest('heartbeat未実施はlast_synced_at=null', function () use ($port1) {
        $r = httpJson($port1, 'GET', '/sync/status');
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('Beaver', $r['body']['app_id'] ?? null, 'app_id');
        assertTrue(array_key_exists('last_synced_at', $r['body']), 'last_synced_atキーが存在する');
        assertEq(null, $r['body']['last_synced_at'], 'last_synced_at');
        assertTrue(array_key_exists('source', $r['body']), 'sourceキーが存在する');
        assertEq(null, $r['body']['source'], 'source');
    });

    echo "\n=== R-0143 A-B-06 POST /sync/heartbeat ===\n";
    runTest('heartbeatを送るとsync_heartbeatsが更新される', function () use ($port1) {
        $r = httpJson($port1, 'POST', '/sync/heartbeat', ['synced_at' => '2026-09-06 03:00:00', 'source' => 'access']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('ok', $r['body']['status'] ?? null, 'status');
    });

    runTest('heartbeat後のGET /sync/statusにJST変換された時刻とsourceが反映される', function () use ($port1) {
        $r = httpJson($port1, 'GET', '/sync/status');
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('2026-09-06 12:00:00', $r['body']['last_synced_at'] ?? null, 'last_synced_at (UTC 03:00 -> JST 12:00)');
        assertEq('access', $r['body']['source'] ?? null, 'source');
    });
} finally {
    if (is_resource($proc1)) { proc_terminate($proc1); proc_close($proc1); }
    @unlink($bootstrap1);
    @unlink($dbPath1);
}

// ============================================================
// (2) 認証テスト: AUTH_DRIVER=shared・df_sessionクッキー無し → 401
// ============================================================
$dbPath2 = __DIR__ . '/test_sync_status_auth_' . getmypid() . '.sqlite';
if (file_exists($dbPath2)) unlink($dbPath2);
makeTestDb($ROOT, $dbPath2);
$bootstrap2 = __DIR__ . '/_sync_status_auth_bootstrap.php';
file_put_contents($bootstrap2, "<?php\ndefine('DB_PATH', " . var_export($dbPath2, true) . ");\ndefine('AUTH_DRIVER', 'shared');\n");

$port2 = 18103;
$proc2 = null;
try {
    $proc2 = startServer($ROOT, $bootstrap2, $port2);

    echo "\n=== R-0143 A-B-06 GET /sync/status 認証（df_session無しで401） ===\n";
    runTest('AUTH_DRIVER=shared・df_session無しで401', function () use ($port2) {
        $r = httpJson($port2, 'GET', '/sync/status');
        assertTrue(str_contains($r['status'], '401'), 'HTTP 401: ' . $r['status']);
    });
} finally {
    if (is_resource($proc2)) { proc_terminate($proc2); proc_close($proc2); }
    @unlink($bootstrap2);
    @unlink($dbPath2);
}

echo "\n========================================\n";
echo "PASSED: $passed\n";
echo "FAILED: $failed\n";
if ($failed > 0) {
    echo "----- failures -----\n";
    foreach ($failures as $f) echo " - $f\n";
    exit(1);
}
exit(0);
