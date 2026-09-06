<?php
/**
 * R-0143 A-B-08 認証ゲート統合テスト（AccessTategu同期API）
 *
 * 起動: php api/tests/test_auth_gate_sync.php
 *
 * php ビルトインサーバを起動し、実HTTPリクエストで検証する:
 *   - /vouchers/synchronize（偽装パス）が免除されないこと
 *   - SYNC_TOKEN_REQUIRED=true でのトークン必須化
 *   - /sync/status は df_session 必須のまま
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

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

function assertTrue($cond, string $label = ''): void {
    if (!$cond) {
        throw new RuntimeException($label !== '' ? $label : 'assertion failed');
    }
}

function httpGet(int $port, string $path, array $headers = []): array {
    $header = "Connection: close\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers));
    $ctx = stream_context_create(['http' => [
        'header' => $header, 'timeout' => 5, 'ignore_errors' => true,
    ]]);
    $body = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    $status = $http_response_header[0] ?? '';
    return ['status' => $status, 'body' => (string)$body];
}

function startServer(string $root, string $bootstrap, int $port): mixed {
    $proc = proc_open(
        ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
        $pipes,
        $root
    );
    if (!is_resource($proc)) {
        throw new RuntimeException('php ビルトインサーバを起動できませんでした');
    }
    $ready = false;
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
        $r = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
        if ($r !== false) { $ready = true; break; }
    }
    if (!$ready) {
        proc_terminate($proc);
        proc_close($proc);
        throw new RuntimeException('サーバが応答しません');
    }
    return $proc;
}

function makeTestDb(string $root, string $dbPath): void {
    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
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

echo "=== R-0143 A-B-08 認証ゲート統合テスト ===\n\n";

// AUTH_DRIVER=shared（verifierスタブ）+ SYNC_TOKEN_REQUIRED=true で検証する。
// df_sessionログインの要否とSYNC_API_TOKENの要否を同時に確認できる組み合わせ。
$dbPath = __DIR__ . '/test_auth_gate_sync_' . getmypid() . '.sqlite';
if (file_exists($dbPath)) unlink($dbPath);
makeTestDb($ROOT, $dbPath);

$bootstrap = __DIR__ . '/_auth_gate_sync_bootstrap.php';
file_put_contents($bootstrap, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPath, true) . ");\n"
    . "define('AUTH_DRIVER', 'shared');\n"
    . "define('SYNC_TOKEN_REQUIRED', true);\n"
    . "define('SYNC_API_TOKEN', 'unit-test-sync-token');\n"
    . "require_once dirname(__DIR__) . '/auth_client.php';\n"
    . "auth_configure(['verifier' => fn(string \$t): ?array => ['id' => 1, 'name' => 'テスト太郎']]);\n"
);

$port = 18087;
$proc = null;

try {
    $proc = startServer($ROOT, $bootstrap, $port);

    runTest('偽装パス /vouchers/synchronize は免除されず、未ログインで401', function () use ($port) {
        $res = httpGet($port, '/vouchers/synchronize');
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('SYNC_TOKEN_REQUIRED=true でトークン無しの /vouchers/sync は401', function () use ($port) {
        $res = httpGet($port, '/vouchers/sync');
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('SYNC_TOKEN_REQUIRED=true でも不一致トークンの /vouchers/sync は401', function () use ($port) {
        $res = httpGet($port, '/vouchers/sync', ['Authorization: Bearer wrong-token']);
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('正しいSYNC_API_TOKENを付けた /vouchers/sync は200', function () use ($port) {
        $res = httpGet($port, '/vouchers/sync', ['Authorization: Bearer unit-test-sync-token']);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('/sync/status は免除されず、df_session無しで401', function () use ($port) {
        $res = httpGet($port, '/sync/status');
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status'] . ' body=' . $res['body']);
    });

} finally {
    if (is_resource($proc)) { proc_terminate($proc); proc_close($proc); }
    @unlink($bootstrap);
    @unlink($dbPath);
}

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
