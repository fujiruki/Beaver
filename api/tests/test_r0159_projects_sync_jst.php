<?php
/**
 * R-0159: GET /projects/sync の updated_at をJSTで返すテスト
 *
 * 起動: php api/tests/test_r0159_projects_sync_jst.php
 *
 * updated_after は strtotime で解釈されるため、本番と同じく date.timezone=Asia/Tokyo でサーバを起動する。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_r0159_projects_sync_jst_' . getmypid() . '.sqlite';
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

$pdo->exec("INSERT INTO customers (id, name, honorific_type) VALUES (1, 'テスト得意先', '御中')");
$pdo->exec("INSERT INTO projects (id, project_code, customer_id, name, status, updated_at, deleted_at)
            VALUES (1, 'PJ001', 1, '案件A', '進行中', '2026-10-01 03:00:00', NULL),
                   (2, 'PJ002', 1, '案件B', '進行中', '2026-10-01 05:00:00', NULL),
                   (3, 'PJ003', 1, '案件C', 'キャンセル', '2026-10-01 06:00:00', '2026-10-01 06:00:00')");
$pdo = null;

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

function assertSame($expected, $actual, string $label = ''): void {
    if ($expected !== $actual) {
        throw new RuntimeException($label . ' expected=' . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

$bootstrap = __DIR__ . '/_r0159_projects_sync_jst_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18160;
$serverProc = proc_open(
    [
        'php',
        '-d', 'auto_prepend_file=' . $bootstrap,
        '-d', 'date.timezone=Asia/Tokyo',
        '-S', "127.0.0.1:$port",
        '-t', $ROOT,
        $ROOT . '/index.php',
    ],
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
    $r   = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
    if ($r !== false) { $ready = true; break; }
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    $base = "http://127.0.0.1:$port/contents/Beaver/api/projects/sync";
    $get = function (string $query) use ($base): array {
        $ctx = stream_context_create(['http' => [
            'header'  => "Connection: close\r\n",
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);
        $body = false;
        for ($t = 0; $t < 3 && $body === false; $t++) {
            if ($t > 0) usleep(200000);
            $body = @file_get_contents($base . $query, false, $ctx);
        }
        return json_decode((string)$body, true) ?? [];
    };
    $byId = function (array $data): array {
        $map = [];
        foreach ($data['projects'] ?? [] as $p) $map[(int)$p['id']] = $p;
        return $map;
    };

    runTest('条件1: 各行のupdated_atがJST（UTC+9時間）で返る', function () use ($get, $byId) {
        $rows = $byId($get('?include_cancelled=true'));
        assertSame('2026-10-01 12:00:00', $rows[1]['updated_at'] ?? null, '案件A');
        assertSame('2026-10-01 14:00:00', $rows[2]['updated_at'] ?? null, '案件B');
        assertSame('2026-10-01 15:00:00', $rows[3]['updated_at'] ?? null, '案件C');
    });

    runTest('条件2: 応答のupdated_atをupdated_afterに渡すとその行は返らない', function () use ($get, $byId) {
        $first = $byId($get(''));
        $updatedAt = $first[1]['updated_at'] ?? '';
        $rows = $byId($get('?updated_after=' . rawurlencode($updatedAt)));
        assertSame(false, isset($rows[1]), '案件Aは返らない');
        assertSame(true, isset($rows[2]), '案件Bは返る');
    });

    runTest('条件3: deleted_atはJSTで返る', function () use ($get, $byId) {
        $rows = $byId($get('?include_cancelled=true'));
        assertSame('2026-10-01 15:00:00', $rows[3]['deleted_at'] ?? null, '案件C');
        assertSame(true, array_key_exists('deleted_at', $rows[1]) && $rows[1]['deleted_at'] === null, '案件Aはnull');
    });

    runTest('条件3: next_cursor_atはJSTで返る', function () use ($get) {
        $data = $get('?limit=1');
        assertSame(1, $data['next_cursor'] ?? null, 'next_cursor');
        assertSame('2026-10-01 14:00:00', $data['next_cursor_at'] ?? null, 'next_cursor_at');
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
