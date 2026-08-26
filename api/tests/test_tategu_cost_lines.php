<?php
/**
 * ADR-003 決定1: 建具台帳の原価行明細APIと固定集計列キャッシュのテスト
 *
 * 起動: php api/tests/test_tategu_cost_lines.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_tategu_cost_lines_' . getmypid() . '.sqlite';
foreach ([$testDbPath, $testDbPath . '-shm', $testDbPath . '-wal'] as $pathToRemove) {
    if (file_exists($pathToRemove)) {
        unlink($pathToRemove);
    }
}
register_shutdown_function(function () use ($testDbPath) {
    $GLOBALS['pdo'] = null;
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
$sawMigration021 = false;
foreach ($migrations as $m) {
    $base = basename($m);
    if (str_starts_with($base, '021_')) {
        $sawMigration021 = true;
        seedAggregationCategoriesFor021($pdo);
    }
    $sql = file_get_contents($m);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 既存migrationの重複は無視 */ }
    }
}
if (!$sawMigration021) {
    seedAggregationCategoriesFor021($pdo);
}

function seedAggregationCategoriesFor021(PDO $pdo): void {
    $exists = $pdo->query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'aggregation_category_master'")->fetchColumn();
    if (!$exists) return;
    $cols = $pdo->query('PRAGMA table_info(aggregation_category_master)')->fetchAll();
    $hasMerge = false;
    foreach ($cols as $col) {
        if ($col['name'] === 'merge_into_price_code') {
            $hasMerge = true;
            break;
        }
    }
    if (!$hasMerge) return;

    $stmt = $pdo->prepare('
        INSERT OR REPLACE INTO aggregation_category_master
            (code, name, measure_type, sort_order, is_active, synced_at, merge_into_price_code)
        VALUES (?, ?, ?, ?, 1, CURRENT_TIMESTAMP, ?)
    ');
    $rows = [
        ['body', '本体', 'money', 10, null],
        ['hardware', '金物', 'money', 20, null],
        ['glass', 'ガラス', 'money', 30, null],
        ['factory_hours', '工場時間', 'time', 40, null],
        ['site_hours', '現場時間', 'time', 50, 'hardware'],
    ];
    foreach ($rows as $row) {
        $stmt->execute($row);
    }
}

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

function assertNear(float $expected, float $actual, string $label = '', float $epsilon = 0.0001): void {
    if (abs($expected - $actual) > $epsilon) {
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

function createTateguItem(PDO $pdo, string $code): int {
    $pdo->prepare("
        INSERT INTO tategu_items
            (code, name, status, cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate)
        VALUES
            (?, 'ADR-003テスト建具', 'active', 999, 888, 777, 6, 5, 3000)
    ")->execute([$code]);
    return (int)$pdo->lastInsertId();
}

$bootstrap = __DIR__ . '/_server_bootstrap_tategu_cost_lines.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18086;
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
    throw new RuntimeException('PHPビルトインサーバーを起動できませんでした');
}

$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
    $r = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
    if ($r !== false) { $ready = true; break; }
}

function putJson(int $port, string $path, array $body): array {
    $ctx = stream_context_create(['http' => [
        'method'  => 'PUT',
        'header'  => "Content-Type: application/json\r\nConnection: close\r\n",
        'content' => json_encode($body, JSON_UNESCAPED_UNICODE),
        'ignore_errors' => true,
        'timeout' => 5,
    ]]);
    $rawBody = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    return [
        'status' => $http_response_header[0] ?? '',
        'body'   => json_decode((string)$rawBody, true),
        'raw'    => (string)$rawBody,
    ];
}

function getJson(int $port, string $path): array {
    $ctx = stream_context_create(['http' => ['ignore_errors' => true, 'timeout' => 5]]);
    $rawBody = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    return [
        'status' => $http_response_header[0] ?? '',
        'body'   => json_decode((string)$rawBody, true),
        'raw'    => (string)$rawBody,
    ];
}

function stopServer($serverProc, array $serverPipes): void {
    $pid = null;
    if (is_resource($serverProc)) {
        $status = proc_get_status($serverProc);
        $pid = $status['pid'] ?? null;
    }
    foreach ($serverPipes as $p) {
        if (is_resource($p)) fclose($p);
    }
    if (is_resource($serverProc)) {
        proc_terminate($serverProc);
        if ($pid && strtoupper(substr(PHP_OS, 0, 3)) === 'WIN') {
            @exec('taskkill /F /T /PID ' . (int)$pid . ' 2>NUL');
        }
        @proc_close($serverProc);
    }
}

try {
    if (!$ready) throw new RuntimeException('サーバーが応答しません');

    echo "=== ADR-003 建具台帳 原価行明細API ===\n";

    runTest('PUT /tategu-items/{id}/cost-lines は本体/金物/ガラス行を全件入れ替えし固定集計列を再計算する', function () use (&$pdo, $port) {
        $id = createTateguItem($pdo, 'ADR003-COST');

        $r = putJson($port, "/tategu-items/$id/cost-lines", ['lines' => [
            ['category_code' => 'MAIN', 'name' => 'ヒノキ材', 'quantity' => 2.5, 'unit_cost' => 1200, 'amount' => 3000, 'source' => 'manual', 'sort_order' => 2],
            ['category_code' => 'MAIN', 'name' => '木材計算', 'quantity' => 1, 'unit_cost' => 2500, 'amount' => 2500, 'source' => 'wood_calc', 'sort_order' => 1],
            ['category_code' => 'HARDWARE', 'name' => '丁番', 'quantity' => 4, 'unit_cost' => 300, 'amount' => 1200, 'sort_order' => 3],
            ['category_code' => 'GLASS', 'name' => '透明ガラス', 'quantity' => 1, 'unit_cost' => 1800, 'amount' => 1800, 'sort_order' => 4],
        ]]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status'] . ' body=' . $r['raw']);
        assertEq(true, $r['body']['ok'] ?? null, 'レスポンス ok');

        $item = $pdo->query("SELECT cost_body, cost_hardware, cost_glass FROM tategu_items WHERE id = $id")->fetch();
        assertNear(5500.0, (float)$item['cost_body'], 'cost_body');
        assertNear(1200.0, (float)$item['cost_hardware'], 'cost_hardware');
        assertNear(1800.0, (float)$item['cost_glass'], 'cost_glass');

        $lines = $pdo->query("SELECT category_code, name, source FROM tategu_item_cost_lines WHERE tategu_item_id = $id ORDER BY sort_order, id")->fetchAll();
        assertEq(4, count($lines), 'cost_lines count');
        assertEq('wood_calc', $lines[0]['source'], 'sort_order と source');
    });

    runTest('PUT /tategu-items/{id}/labor-lines は労務行を全件入れ替えし時間と加重平均単価を再計算する', function () use (&$pdo, $port) {
        $id = createTateguItem($pdo, 'ADR003-LABOR');

        $r = putJson($port, "/tategu-items/$id/labor-lines", ['lines' => [
            ['category_code' => 'FACTORY_TIME', 'process_name' => '製作', 'work_hours' => 2.5, 'labor_rate' => 4000, 'amount' => 10000, 'sort_order' => 1],
            ['category_code' => 'SITE_TIME', 'process_name' => '取付', 'work_hours' => 1.0, 'labor_rate' => 6500, 'amount' => 6500, 'sort_order' => 2],
        ]]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status'] . ' body=' . $r['raw']);

        $item = $pdo->query("SELECT cost_factory_hours, cost_site_hours, cost_labor_rate FROM tategu_items WHERE id = $id")->fetch();
        assertNear(2.5, (float)$item['cost_factory_hours'], 'cost_factory_hours');
        assertNear(1.0, (float)$item['cost_site_hours'], 'cost_site_hours');
        assertNear(16500.0 / 3.5, (float)$item['cost_labor_rate'], 'cost_labor_rate');
    });

    runTest('GET /tategu-items/{id} は cost_lines と labor_lines を返す', function () use (&$pdo, $port) {
        $id = createTateguItem($pdo, 'ADR003-GET');
        putJson($port, "/tategu-items/$id/cost-lines", ['lines' => [
            ['category_code' => 'HARDWARE', 'name' => '錠前', 'quantity' => 1, 'unit_cost' => 4200, 'amount' => 4200, 'sort_order' => 1],
        ]]);
        putJson($port, "/tategu-items/$id/labor-lines", ['lines' => [
            ['category_code' => 'FACTORY_TIME', 'process_name' => '見積', 'work_hours' => 0.5, 'labor_rate' => 5000, 'amount' => 2500, 'sort_order' => 1],
        ]]);

        $r = getJson($port, "/tategu-items/$id");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq(1, count($r['body']['cost_lines'] ?? []), 'cost_lines count');
        assertEq(1, count($r['body']['labor_lines'] ?? []), 'labor_lines count');
        assertEq('HARDWARE', $r['body']['cost_lines'][0]['category_code'] ?? null, 'cost_lines category');
        assertEq('見積', $r['body']['labor_lines'][0]['process_name'] ?? null, 'labor_lines process');
    });

    runTest('migration 021 は time型区分の未設定 merge_into_price_code だけ body にする', function () use (&$pdo) {
        $stmt = $pdo->query("SELECT code, merge_into_price_code FROM aggregation_category_master WHERE code IN ('factory_hours', 'site_hours') ORDER BY code");
        $rows = $stmt->fetchAll();
        $map = [];
        foreach ($rows as $row) {
            $map[$row['code']] = $row['merge_into_price_code'];
        }
        assertEq('body', $map['factory_hours'] ?? null, 'factory_hours merge_into_price_code');
        assertEq('hardware', $map['site_hours'] ?? null, 'site_hours は既存値を上書きしない');
    });
} finally {
    stopServer($serverProc, $serverPipes);
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
@unlink($testDbPath . '-shm');
@unlink($testDbPath . '-wal');
exit(0);
