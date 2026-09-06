<?php
/**
 * AccessTategu連携契約 A-B-07: GET /projects/sync に deleted_at を追加するテスト
 *
 * 起動: php api/tests/test_projects_sync.php
 *
 * - php ビルトインサーバを起動して実際にHTTPで叩く（test_customers_sync.php と同じ方式）
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_projects_sync_' . getmypid() . '.sqlite';
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
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");
$pdo->exec("INSERT INTO projects (project_code, customer_id, name, status) VALUES ('PD001', 1, '削除対象案件', '進行中')");
$deletedProjectId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO projects (project_code, customer_id, name, status) VALUES ('PD002', 1, '未削除案件', '進行中')");
$activeProjectId = (int)$pdo->lastInsertId();
$pdo = null;

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

function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

$bootstrap = __DIR__ . '/_projects_sync_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18094;
$serverProc = proc_open(
    [
        'php',
        '-d', 'auto_prepend_file=' . $bootstrap,
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

    $base  = "http://127.0.0.1:$port/contents/Beaver/api/projects";
    $fetch = function (string $url, string $method = 'GET') {
        $ctx = stream_context_create(['http' => [
            'method'  => $method,
            'header'  => "Connection: close\r\n",
            'timeout' => 5,
            'ignore_errors' => true,
        ]]);
        $body = false; $hdr = [];
        for ($t = 0; $t < 3 && $body === false; $t++) {
            if ($t > 0) usleep(200000);
            $body = @file_get_contents($url, false, $ctx);
            if (isset($http_response_header)) $hdr = $http_response_header;
        }
        return ['body' => (string)$body, 'status' => $hdr[0] ?? ''];
    };

    // DELETE /projects/{id} で論理削除しておく（?hard=1 は付けない）
    $delRes = $fetch($base . '/' . $deletedProjectId, 'DELETE');
    assertTrue(str_contains($delRes['status'], '200'), 'DELETE応答が200: ' . $delRes['status']);

    runTest('削除済み案件はdeleted_at付き（JST日時文字列）で返る', function () use ($fetch, $base, $deletedProjectId) {
        // DELETEはstatusを"キャンセル"にするため、既定のsyncでは除外される。include_cancelled=trueで取得する。
        $data = json_decode($fetch($base . '/sync?include_cancelled=true')['body'], true);
        $rows = array_values(array_filter($data['projects'], fn($p) => (int)$p['id'] === $deletedProjectId));
        assertTrue(count($rows) === 1, '削除済み案件がinclude_cancelled=trueで1件返る');
        $deletedAt = $rows[0]['deleted_at'] ?? null;
        assertTrue($deletedAt !== null, 'deleted_atがnullでない');
        $dt = DateTime::createFromFormat('Y-m-d H:i:s', $deletedAt);
        assertTrue($dt !== false, 'deleted_atがY-m-d H:i:s形式でパースできる: ' . $deletedAt);
    });

    runTest('未削除案件はdeleted_at:nullで返る', function () use ($fetch, $base, $activeProjectId) {
        $data = json_decode($fetch($base . '/sync')['body'], true);
        $rows = array_values(array_filter($data['projects'], fn($p) => (int)$p['id'] === $activeProjectId));
        assertTrue(count($rows) === 1, '未削除案件が1件返る');
        assertTrue(array_key_exists('deleted_at', $rows[0]), 'deleted_atキーが存在する');
        assertTrue($rows[0]['deleted_at'] === null, '未削除案件のdeleted_atはnull');
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

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
