<?php
/**
 * AccessTategu連携契約 R-0143 A-B-09: push系応答にlast_synced_atを必ず含める
 *
 * 起動: php api/tests/test_push_responses_last_synced_at.php
 *
 * 対象5経路:
 *   1. POST /vouchers/sync
 *   2. POST /projects/{id}/vouchers/sync
 *   3. PATCH /projects/{id}/vouchers/{no}/shipped
 *   4. PATCH /projects/{id}/customer
 *   5. POST /customers（既存レコード更新・新規作成の両分岐）
 *
 * php ビルトインサーバを起動して実際にHTTPで叩く（test_customers_sync.phpと同じ方式）。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_push_last_synced_at_' . getmypid() . '.sqlite';
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
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");

$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先A', '100')");
$customerAId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO projects (project_code, customer_id, name, status) VALUES ('P00001', $customerAId, 'テスト案件1', '進行中')");
$projectId = (int)$pdo->lastInsertId();
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

// DB_PATH を上書きするための bootstrap を生成
$bootstrap = __DIR__ . '/_push_last_synced_at_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18097;
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

/**
 * JSON body付きリクエストを送るヘルパ（POST/PATCH/PUT共通）。
 */
function httpRequest(string $method, string $url, ?array $body = null): array {
    $ctx = stream_context_create(['http' => [
        'method'        => $method,
        'header'        => "Content-Type: application/json\r\nConnection: close\r\n",
        'content'       => $body !== null ? json_encode($body, JSON_UNESCAPED_UNICODE) : '',
        'timeout'       => 5,
        'ignore_errors' => true,
    ]]);
    $resBody = false; $hdr = [];
    for ($t = 0; $t < 3 && $resBody === false; $t++) {
        if ($t > 0) usleep(200000);
        $resBody = @file_get_contents($url, false, $ctx);
        if (isset($http_response_header)) $hdr = $http_response_header;
    }
    return ['body' => (string)$resBody, 'status' => $hdr[0] ?? ''];
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    $base = "http://127.0.0.1:$port/contents/Beaver/api";

    // ============================================================
    // 1. POST /vouchers/sync
    // ============================================================
    echo "=== 1. POST /vouchers/sync ===\n";

    runTest('応答にlast_synced_atキーが存在し、DBのvouchers.last_synced_atと一致する', function () use ($base, $testDbPath) {
        $r = httpRequest('POST', "$base/vouchers/sync", [
            'access_voucher_id' => 20001,
            'voucher_type'      => 'estimate',
            'customer_access_no'=> '',
            'voucher_date'      => '2026-09-01',
            'total_amount'      => 1000,
        ]);
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status'] . ' body=' . $r['body']);
        $data = json_decode($r['body'], true);
        assertTrue(array_key_exists('last_synced_at', $data), 'last_synced_atキーが存在すること');
        assertTrue($data['last_synced_at'] !== null, 'last_synced_atが非null');

        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $row = $tmpPdo->query('SELECT last_synced_at FROM vouchers WHERE access_voucher_id = 20001')->fetch(PDO::FETCH_ASSOC);
        assertTrue($row !== false, '対象伝票が存在すること');
        $expectedJst = (new DateTime($row['last_synced_at'], new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('Asia/Tokyo'))->format('Y-m-d H:i:s');
        assertEq($expectedJst, $data['last_synced_at'], '応答のlast_synced_atがDB値(JST変換)と一致する');
    });

    // ============================================================
    // 2. POST /projects/{id}/vouchers/sync
    // ============================================================
    echo "\n=== 2. POST /projects/{id}/vouchers/sync ===\n";

    runTest('応答にlast_synced_atキーが存在し、DBのvouchers.last_synced_atと一致する', function () use ($base, $testDbPath, $projectId) {
        $r = httpRequest('POST', "$base/projects/$projectId/vouchers/sync", [
            'access_voucher_id' => 20002,
            'voucher_type'      => 'sales',
            'customer_access_no'=> '100',
            'voucher_date'      => '2026-09-02',
            'total_amount'      => 2000,
        ]);
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status'] . ' body=' . $r['body']);
        $data = json_decode($r['body'], true);
        assertTrue(array_key_exists('last_synced_at', $data), 'last_synced_atキーが存在すること');

        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $row = $tmpPdo->query('SELECT last_synced_at FROM vouchers WHERE access_voucher_id = 20002')->fetch(PDO::FETCH_ASSOC);
        $expectedJst = (new DateTime($row['last_synced_at'], new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('Asia/Tokyo'))->format('Y-m-d H:i:s');
        assertEq($expectedJst, $data['last_synced_at'], '応答のlast_synced_atがDB値(JST変換)と一致する');
    });

    // ============================================================
    // 3. PATCH /projects/{id}/vouchers/{no}/shipped
    // ============================================================
    echo "\n=== 3. PATCH /projects/{id}/vouchers/{no}/shipped ===\n";

    runTest('応答にlast_synced_atキーが存在し、DBのvouchers.last_synced_atと一致する', function () use ($base, $testDbPath, $projectId) {
        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $tmpPdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, project_id, customer_id, voucher_date, total_amount, access_voucher_no)
                       VALUES ('SHIP001', 'sales', 'approved', $projectId, 1, '2026-09-03', 3000, 'A-SHIP001')");
        $tmpPdo = null;

        $r = httpRequest('PATCH', "$base/projects/$projectId/vouchers/A-SHIP001/shipped", [
            'shipped'    => true,
            'shipped_at' => '2026-09-03T10:00:00+09:00',
        ]);
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status'] . ' body=' . $r['body']);
        $data = json_decode($r['body'], true);
        assertTrue(array_key_exists('last_synced_at', $data), 'last_synced_atキーが存在すること');

        $tmpPdo2 = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $row = $tmpPdo2->query("SELECT last_synced_at FROM vouchers WHERE access_voucher_no = 'A-SHIP001'")->fetch(PDO::FETCH_ASSOC);
        assertTrue($row['last_synced_at'] !== null, 'DBのlast_synced_atが非NULLに更新されていること');
        $expectedJst = (new DateTime($row['last_synced_at'], new DateTimeZone('UTC')))
            ->setTimezone(new DateTimeZone('Asia/Tokyo'))->format('Y-m-d H:i:s');
        assertEq($expectedJst, $data['last_synced_at'], '応答のlast_synced_atがDB値(JST変換)と一致する');
    });

    // ============================================================
    // 4. PATCH /projects/{id}/customer
    // ============================================================
    echo "\n=== 4. PATCH /projects/{id}/customer ===\n";

    runTest('応答にlast_synced_atキーが存在する（projectsにDB列は無いためサーバ現在時刻を返す）', function () use ($base, $projectId) {
        // 秒未満の誤差で前後関係が崩れないよう、秒精度に丸めてから比較する。
        $before = DateTime::createFromFormat('Y-m-d H:i:s', (new DateTime('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s'), new DateTimeZone('Asia/Tokyo'));
        $r = httpRequest('PATCH', "$base/projects/$projectId/customer", [
            'customer_access_no' => '100',
        ]);
        $after = DateTime::createFromFormat('Y-m-d H:i:s', (new DateTime('now', new DateTimeZone('Asia/Tokyo')))->modify('+1 second')->format('Y-m-d H:i:s'), new DateTimeZone('Asia/Tokyo'));
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status'] . ' body=' . $r['body']);
        $data = json_decode($r['body'], true);
        assertTrue(array_key_exists('last_synced_at', $data), 'last_synced_atキーが存在すること');
        $returned = DateTime::createFromFormat('Y-m-d H:i:s', $data['last_synced_at'], new DateTimeZone('Asia/Tokyo'));
        assertTrue($returned !== false, 'last_synced_atがY-m-d H:i:s形式でパースできる');
        assertTrue($returned >= $before && $returned <= $after, 'last_synced_atがリクエスト前後のサーバ現在時刻範囲内である');
    });

    // ============================================================
    // 5. POST /customers
    // ============================================================
    echo "\n=== 5. POST /customers ===\n";

    runTest('新規作成時からcustomers.last_synced_atが入る', function () use ($base, $testDbPath) {
        $r = httpRequest('POST', "$base/customers", [
            'access_customer_no' => '500',
            'name'                => '新規得意先500',
        ]);
        assertTrue(str_contains($r['status'], '200') || str_contains($r['status'], '201'), 'expected 200/201 got: ' . $r['status'] . ' body=' . $r['body']);

        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $row = $tmpPdo->query("SELECT last_synced_at FROM customers WHERE access_customer_no = '500'")->fetch(PDO::FETCH_ASSOC);
        assertTrue($row !== false, '新規得意先が作成されていること');
        assertTrue($row['last_synced_at'] !== null, '新規作成時にlast_synced_atが非NULLであること');
    });

    runTest('既存レコード更新後、customers.last_synced_atが更新されている', function () use ($base, $testDbPath) {
        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $tmpPdo->exec("UPDATE customers SET last_synced_at = '2020-01-01 00:00:00' WHERE access_customer_no = '500'");
        $beforeRow = $tmpPdo->query("SELECT last_synced_at FROM customers WHERE access_customer_no = '500'")->fetch(PDO::FETCH_ASSOC);
        $tmpPdo = null;

        $r = httpRequest('POST', "$base/customers", [
            'access_customer_no' => '500',
            'name'                => '新規得意先500（更新済み）',
        ]);
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status'] . ' body=' . $r['body']);
        $data = json_decode($r['body'], true);
        assertTrue(array_key_exists('last_synced_at', $data), '応答にlast_synced_atキーが存在すること');

        $tmpPdo2 = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $afterRow = $tmpPdo2->query("SELECT last_synced_at FROM customers WHERE access_customer_no = '500'")->fetch(PDO::FETCH_ASSOC);
        assertTrue($afterRow['last_synced_at'] !== $beforeRow['last_synced_at'], '更新前後でlast_synced_atが変化していること');
        assertEq($afterRow['last_synced_at'], $data['last_synced_at'], '応答のlast_synced_atがDB値と一致する（生UTCのまま）');
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
