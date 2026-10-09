<?php
/**
 * R-0157: POST /customers の競合判定（base_synced_at / force）と
 * PATCH /customers/{id}/carry-forward が updated_at を進めないことのテスト
 *
 * 起動: php api/tests/test_r0157_customer_push_conflict.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_r0157_customer_push_conflict_' . getmypid() . '.sqlite';
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

// 得意先を1件作り直す。updated_at は UTC 生値で固定する
function seedCustomer(PDO $pdo, ?string $acn, string $code, string $name, string $updatedAtUtc): int {
    $pdo->prepare('DELETE FROM customers WHERE code = ? OR access_customer_no = ?')->execute([$code, $acn ?? $code]);
    $pdo->prepare("INSERT INTO customers (code, name, access_customer_no, carry_forward_balance) VALUES (?, ?, ?, 1000)")
        ->execute([$code, $name, $acn]);
    $id = (int)$pdo->lastInsertId();
    $pdo->prepare('UPDATE customers SET updated_at = ? WHERE id = ?')->execute([$updatedAtUtc, $id]);
    return $id;
}

function fetchRow(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

$bootstrap = __DIR__ . '/_r0157_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\ndefine('BILLING_EDIT_ENABLED', true);\n");

$port = 18157;
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

$base = "http://127.0.0.1:$port/contents/Beaver/api/customers";

function request(string $method, string $url, array $payload): array {
    $ctx = stream_context_create(['http' => [
        'method'        => $method,
        'header'        => "Content-Type: application/json\r\nConnection: close\r\n",
        'content'       => json_encode($payload),
        'timeout'       => 5,
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents($url, false, $ctx);
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s?/', $statusLine, $m);
    return ['status' => isset($m[1]) ? (int)$m[1] : 0, 'body' => json_decode((string)$body, true), 'raw' => (string)$body];
}

// UTC 2026-10-01 03:00:00 = JST 2026-10-01 12:00:00
$UTC = '2026-10-01 03:00:00';

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    runTest('受入条件1: updated_at > base_synced_at、force なし → 409 customer_conflict、DB不変', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, '700', '700', 'Beaver版', $UTC);
        $before = fetchRow($pdo, $id);
        $r = request('POST', $base, [
            'access_customer_no' => '700', 'code' => '700', 'name' => 'Access版',
            'base_synced_at' => '2026-10-01 11:59:59',
        ]);
        assertEq(409, $r['status'], 'status');
        assertEq('customer_conflict', $r['body']['error'] ?? null, 'error');
        $c = $r['body']['customer'] ?? [];
        assertEq($id, (int)($c['id'] ?? 0), 'customer.id');
        assertEq('Beaver版', $c['name'] ?? null, 'customer.name');
        assertEq('2026-10-01 12:00:00', $c['updated_at'] ?? null, 'customer.updated_at(JST)');
        assertTrue(array_key_exists('last_synced_at', $c), 'last_synced_at キーがある');
        assertTrue(!array_key_exists('carry_forward_balance', $c), 'carry_forward_balance は含まない（sync と同じ形）');
        foreach (['access_customer_no', 'code', 'name_kana', 'honorific_type', 'gender', 'postal_code', 'address1',
                  'address2', 'tel', 'mobile', 'fax', 'email', 'cutoff_day', 'memo', 'is_active'] as $k) {
            assertTrue(array_key_exists($k, $c), "$k キーがある");
        }
        assertEq($before, fetchRow($pdo, $id), 'DBは変わらない');
    });

    runTest('受入条件2: updated_at == base_synced_at → 上書き200', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, '701', '701', 'Beaver版', $UTC);
        $r = request('POST', $base, [
            'access_customer_no' => '701', 'code' => '701', 'name' => 'Access版',
            'base_synced_at' => '2026-10-01 12:00:00',
        ]);
        assertEq(200, $r['status'], 'status');
        assertEq('Access版', fetchRow($pdo, $id)['name'], 'name が上書きされる');
    });

    runTest('受入条件3: updated_at < base_synced_at → 上書き200', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, '702', '702', 'Beaver版', $UTC);
        $r = request('POST', $base, [
            'access_customer_no' => '702', 'code' => '702', 'name' => 'Access版',
            'base_synced_at' => '2026-10-01 12:00:01',
        ]);
        assertEq(200, $r['status'], 'status');
        assertEq('Access版', fetchRow($pdo, $id)['name'], 'name が上書きされる');
    });

    runTest('受入条件4: base_synced_at なし → 上書き200', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, '703', '703', 'Beaver版', $UTC);
        $r = request('POST', $base, ['access_customer_no' => '703', 'code' => '703', 'name' => 'Access版']);
        assertEq(200, $r['status'], 'status');
        assertEq('Access版', fetchRow($pdo, $id)['name'], 'name が上書きされる');
    });

    runTest('受入条件5: force=true なら updated_at が新しくても上書き200（時刻はJSTで返る）', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, '704', '704', 'Beaver版', $UTC);
        $r = request('POST', $base, [
            'access_customer_no' => '704', 'code' => '704', 'name' => 'Access版',
            'base_synced_at' => '2026-09-01 00:00:00', 'force' => true,
        ]);
        assertEq(200, $r['status'], 'status');
        $row = fetchRow($pdo, $id);
        assertEq('Access版', $row['name'], 'name が上書きされる');
        $jst = (new DateTime($row['updated_at'], new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Tokyo'))->format('Y-m-d H:i:s');
        assertEq($jst, $r['body']['updated_at'] ?? null, '応答の updated_at はJST');
        $jstSynced = (new DateTime($row['last_synced_at'], new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Asia/Tokyo'))->format('Y-m-d H:i:s');
        assertEq($jstSynced, $r['body']['last_synced_at'] ?? null, '応答の last_synced_at はJST');
    });

    runTest('受入条件6: base_synced_at の形式不正 → 400、DB不変', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, '705', '705', 'Beaver版', $UTC);
        $before = fetchRow($pdo, $id);
        foreach (['2026/10/01 12:00:00', '2026-10-01 25:00:00', '2026-10-01', 'not-a-date', '2026-10-01T12:00:00'] as $bad) {
            $r = request('POST', $base, [
                'access_customer_no' => '705', 'code' => '705', 'name' => 'Access版',
                'base_synced_at' => $bad,
            ]);
            assertEq(400, $r['status'], "status ($bad)");
        }
        assertEq($before, fetchRow($pdo, $id), 'DBは変わらない');
    });

    runTest('受入条件7: code フォールバックで見つかった既存行にも同じ判定が効く', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, null, '710', 'Beaver版', $UTC);
        $before = fetchRow($pdo, $id);
        $r = request('POST', $base, [
            'access_customer_no' => '710', 'code' => '710', 'name' => 'Access版',
            'base_synced_at' => '2026-10-01 11:00:00',
        ]);
        assertEq(409, $r['status'], 'status');
        assertEq('customer_conflict', $r['body']['error'] ?? null, 'error');
        assertEq($id, (int)($r['body']['customer']['id'] ?? 0), 'customer.id');
        assertEq($before, fetchRow($pdo, $id), 'DBは変わらない');

        $r2 = request('POST', $base, [
            'access_customer_no' => '710', 'code' => '710', 'name' => 'Access版',
            'base_synced_at' => '2026-10-01 12:00:00',
        ]);
        assertEq(200, $r2['status'], 'base が同時刻なら200');
        assertEq('710', fetchRow($pdo, $id)['access_customer_no'], 'access_customer_no が入る');
    });

    runTest('受入条件8: 新規作成は base_synced_at があっても201', function () use ($pdo, $base) {
        $r = request('POST', $base, [
            'access_customer_no' => '720', 'code' => '720', 'name' => '新規',
            'base_synced_at' => '2026-10-01 12:00:00',
        ]);
        assertEq(201, $r['status'], 'status');
        assertEq('720', $r['body']['access_customer_no'] ?? null, 'access_customer_no');
    });

    runTest('受入条件9: 既存のUNIQUE違反409は本文・状態コードとも変わらない', function () use ($pdo, $base, $UTC) {
        seedCustomer($pdo, '999', '730', '別の得意先', $UTC);
        $r = request('POST', $base, [
            'access_customer_no' => '730', 'name' => '重複',
            'base_synced_at' => '2026-10-01 12:00:00',
        ]);
        assertEq(409, $r['status'], 'status');
        assertEq(['error' => 'code が既に存在します', 'code' => '730'], $r['body'], 'body');
    });

    runTest('受入条件10: carry-forward で updated_at が変わらず、carry_forward_balance は更新される', function () use ($pdo, $base, $UTC) {
        $id = seedCustomer($pdo, '740', '740', '繰越', $UTC);
        $r = request('PATCH', "$base/$id/carry-forward", ['carry_forward_balance' => 12345]);
        assertEq(200, $r['status'], 'status');
        $row = fetchRow($pdo, $id);
        assertEq(12345.0, (float)$row['carry_forward_balance'], 'carry_forward_balance');
        assertEq($UTC, $row['updated_at'], 'updated_at は変わらない');
    });

    runTest('受入条件11: 日付をまたぐJST/UTCで同じ瞬間なら競合にならない', function () use ($pdo, $base) {
        // UTC 2026-09-30 20:00:00 = JST 2026-10-01 05:00:00
        $id = seedCustomer($pdo, '750', '750', 'Beaver版', '2026-09-30 20:00:00');
        $r = request('POST', $base, [
            'access_customer_no' => '750', 'code' => '750', 'name' => 'Access版',
            'base_synced_at' => '2026-10-01 05:00:00',
        ]);
        assertEq(200, $r['status'], 'status');
        assertEq('Access版', fetchRow($pdo, $id)['name'], 'name が上書きされる');

        $id2 = seedCustomer($pdo, '751', '751', 'Beaver版', '2026-09-30 20:00:00');
        $r2 = request('POST', $base, [
            'access_customer_no' => '751', 'code' => '751', 'name' => 'Access版',
            'base_synced_at' => '2026-10-01 04:59:59',
        ]);
        assertEq(409, $r2['status'], '1秒前のbaseなら409');
        assertEq('Beaver版', fetchRow($pdo, $id2)['name'], 'DBは変わらない');
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
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
    foreach ($failures as $f) echo " - $f\n";
    exit(1);
}
@unlink($testDbPath);
exit(0);
