<?php
/**
 * R-0109 認証ゲート統合テスト
 *
 * 起動: php api/tests/test_auth_gate.php
 *
 * php ビルトインサーバを2つ起動し、実HTTPリクエストで検証する:
 *   - AUTH_DRIVER=shared（verifierをスタブ化し、df_sessionクッキーの有無でログイン状態を切替）
 *   - AUTH_DRIVER=none（ローカル開発の既定。ゲートを素通しする）
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

function httpPost(int $port, string $path, array $bodyData, array $headers = []): array {
    $header = "Connection: close\r\nContent-Type: application/json\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers));
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => $header, 'content' => json_encode($bodyData),
        'timeout' => 5, 'ignore_errors' => true,
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

echo "=== R-0109 認証ゲート統合テスト ===\n\n";

// ============================================================
// AUTH_DRIVER=shared（verifierスタブでログイン状態を制御）
// ============================================================
$sharedDbPath = __DIR__ . '/test_auth_gate_shared_' . getmypid() . '.sqlite';
if (file_exists($sharedDbPath)) unlink($sharedDbPath);
makeTestDb($ROOT, $sharedDbPath);

$sharedBootstrap = __DIR__ . '/_auth_gate_shared_bootstrap.php';
file_put_contents($sharedBootstrap, "<?php\n"
    . "define('DB_PATH', " . var_export($sharedDbPath, true) . ");\n"
    . "define('AUTH_DRIVER', 'shared');\n"
    . "require_once dirname(__DIR__) . '/auth_client.php';\n"
    . "auth_configure(['verifier' => fn(string \$t): ?array => ['id' => 1, 'name' => 'テスト太郎']]);\n"
);

$sharedPort = 18085;
$sharedProc = null;

try {
    $sharedProc = startServer($ROOT, $sharedBootstrap, $sharedPort);

    runTest('未ログインで保護対象パスは401 + loginUrl', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/customers');
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status']);
        $data = json_decode($res['body'], true);
        assertTrue(($data['error'] ?? null) === 'unauthenticated', 'error=unauthenticated: ' . $res['body']);
        assertTrue(str_contains($data['loginUrl'] ?? '', '/contents/auth/login'), 'loginUrlにログイン画面URLが含まれる: ' . $res['body']);
    });

    runTest('df_sessionクッキーがあれば保護対象パスも通る', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/customers', ['Cookie: df_session=dummy-token']);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('GET /me はログイン中のユーザー情報を返す', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/me', ['Cookie: df_session=dummy-token']);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = json_decode($res['body'], true);
        assertTrue($data['id'] === 1 && $data['name'] === 'テスト太郎', 'ユーザー情報が一致する: ' . $res['body']);
    });

    runTest('GET /me は未ログインなら401', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/me');
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status']);
    });

    runTest('GET /health は未ログインでも200', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/health');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
    });

    runTest('GET /admin/feedback は未ログインでもX-Admin-Tokenがあれば通る（既存認証のまま）', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/admin/feedback', ['X-Admin-Token: dev-local-token-change-me']);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('GET /projects/sync はAccessTategu連携用のため未ログインでも200', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/projects/sync');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    // --- R-0110 番頭AI向けAPIトークン ---

    runTest('番頭AIトークン一致のBearerヘッダーがあれば未ログインでも保護対象パス(GET)が通る', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/customers', ['Authorization: Bearer dev-local-banto-token-change-me']);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('番頭AIトークン一致のBearerヘッダーがあれば未ログインでもPOST /customersが成功する', function () use ($sharedPort) {
        $res = httpPost($sharedPort, '/customers', ['name' => '番頭AIテスト得意先'], ['Authorization: Bearer dev-local-banto-token-change-me']);
        assertTrue(str_contains($res['status'], '201') || str_contains($res['status'], '200'), 'expected 200/201 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('番頭AIトークン不一致なら未ログイン扱いで401 + loginUrl', function () use ($sharedPort) {
        $res = httpGet($sharedPort, '/customers', ['Authorization: Bearer wrong-token']);
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status']);
        $data = json_decode($res['body'], true);
        assertTrue(($data['error'] ?? null) === 'unauthenticated', 'error=unauthenticated: ' . $res['body']);
    });

} finally {
    if (is_resource($sharedProc)) { proc_terminate($sharedProc); proc_close($sharedProc); }
    @unlink($sharedBootstrap);
    @unlink($sharedDbPath);
}

// ============================================================
// AUTH_DRIVER=none（ローカル開発既定。ゲートを素通しする）
// ============================================================
$noneDbPath = __DIR__ . '/test_auth_gate_none_' . getmypid() . '.sqlite';
if (file_exists($noneDbPath)) unlink($noneDbPath);
makeTestDb($ROOT, $noneDbPath);

$noneBootstrap = __DIR__ . '/_auth_gate_none_bootstrap.php';
file_put_contents($noneBootstrap, "<?php\n"
    . "define('DB_PATH', " . var_export($noneDbPath, true) . ");\n"
    . "define('AUTH_DRIVER', 'none');\n"
);

$nonePort = 18086;
$noneProc = null;

try {
    $noneProc = startServer($ROOT, $noneBootstrap, $nonePort);

    runTest('AUTH_DRIVER=noneでは未ログインでも保護対象パスが通る（既存動作維持）', function () use ($nonePort) {
        $res = httpGet($nonePort, '/customers');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('AUTH_DRIVER=noneでは GET /me も認証なしで通り、未ログイン(null)を返す', function () use ($nonePort) {
        $res = httpGet($nonePort, '/me');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        assertTrue(trim($res['body']) === 'null', 'body=null: ' . $res['body']);
    });

} finally {
    if (is_resource($noneProc)) { proc_terminate($noneProc); proc_close($noneProc); }
    @unlink($noneBootstrap);
    @unlink($noneDbPath);
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
