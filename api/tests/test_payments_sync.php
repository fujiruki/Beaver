<?php
/**
 * R-0143 A-B-04: POST /payments/sync テスト
 *
 * 起動: php api/tests/test_payments_sync.php
 *
 * - migration 032（access_payment_no/origin）を前提に、
 *   AccessTategu からの入金 push 受信（upsert）を検証する。
 * - php ビルトインサーバを起動して実際にHTTPで叩く（test_invoices_sync.php と同じ方式）
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_payments_sync_' . getmypid() . '.sqlite';
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

$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('得意先A', '100')");
$customerId = (int)$pdo->lastInsertId();

$pdo->exec("
    INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date,
                           carry_forward, sales_total, tax_total, payment_received, invoice_total, next_carry_forward,
                           access_receivable_id)
    VALUES ('I-00001', $customerId, '2026-09-01', '2026-09-05', '2026-09-10', 0, 5000, 500, 0, 5500, 5500, 90001)
");
$invoiceId = (int)$pdo->lastInsertId();

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

// ============================================================
// HTTP サーバ起動
// ============================================================
$bootstrap = __DIR__ . '/_server_bootstrap_payments_sync.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18105;
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

/** @return array{status:string, body:mixed} */
function httpJson(int $port, string $method, string $path, ?array $body = null): array {
    $opts = [
        'method'  => $method,
        'header'  => "Content-Type: application/json\r\nConnection: close\r\n",
        'ignore_errors' => true,
        'timeout' => 5,
    ];
    if ($body !== null) {
        $opts['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    $ctx = stream_context_create(['http' => $opts]);
    $rawBody = false; $hdr = [];
    for ($t = 0; $t < 3 && $rawBody === false; $t++) {
        if ($t > 0) usleep(200000);
        $rawBody = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
        if (isset($http_response_header)) $hdr = $http_response_header;
    }
    return [
        'status' => $hdr[0] ?? '',
        'body'   => json_decode((string)$rawBody, true),
    ];
}

function dbConn(string $testDbPath): PDO {
    $pdo = new PDO('sqlite:' . $testDbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    return $pdo;
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0143 A-B-04 POST /payments/sync ===\n";

    runTest('新規 access_payment_no で INSERT され、receivable_id が invoice_id に解決される', function () use ($port, $testDbPath, $customerId, $invoiceId) {
        $r = httpJson($port, 'POST', '/payments/sync', [
            'access_payment_no'  => 70001,
            'customer_access_no' => '100',
            'payment_date'        => '2026-09-11',
            'amount'              => 2000,
            'memo'                => 'Access入金1',
            'receivable_id'       => 90001,
        ]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq($customerId, (int)$r['body']['customer_id'], 'customer_access_no=100 が customer_id に解決される');
        assertEq($invoiceId, (int)$r['body']['invoice_id'], 'receivable_id=90001 が invoice_id に解決される');
        assertEq('access', $r['body']['origin'], 'originはaccess');

        $pdo = dbConn($testDbPath);
        $count = (int)$pdo->query('SELECT COUNT(*) FROM payments WHERE access_payment_no = 70001')->fetchColumn();
        assertEq(1, $count, '1件だけ作成される');
    });

    runTest('同じ access_payment_no を再送すると1件のまま内容が更新される（冪等性）', function () use ($port, $testDbPath) {
        $r = httpJson($port, 'POST', '/payments/sync', [
            'access_payment_no'  => 70001,
            'customer_access_no' => '100',
            'payment_date'        => '2026-09-12',
            'amount'              => 3500,
            'memo'                => 'Access入金1（訂正）',
            'receivable_id'       => 90001,
        ]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq(3500.0, (float)$r['body']['amount'], '2回目送信の値で更新される');

        $pdo = dbConn($testDbPath);
        $count = (int)$pdo->query('SELECT COUNT(*) FROM payments WHERE access_payment_no = 70001')->fetchColumn();
        assertEq(1, $count, '再送しても1件のまま');
        $row = $pdo->query('SELECT amount, memo, payment_date FROM payments WHERE access_payment_no = 70001')->fetch();
        assertEq(3500.0, (float)$row['amount'], 'DB上のamountも更新されている');
        assertEq('Access入金1（訂正）', $row['memo'], 'DB上のmemoも更新されている');
        assertEq('2026-09-12', $row['payment_date'], 'DB上のpayment_dateも更新されている');
    });

    runTest('未知の customer_access_no は422になり、入金が作られない', function () use ($port, $testDbPath) {
        $before = (int)dbConn($testDbPath)->query('SELECT COUNT(*) FROM payments')->fetchColumn();
        $r = httpJson($port, 'POST', '/payments/sync', [
            'access_payment_no'  => 70002,
            'customer_access_no' => '999999',
            'payment_date'        => '2026-09-13',
            'amount'              => 1000,
        ]);
        assertTrue(str_contains($r['status'], '422'), 'HTTP 422: ' . $r['status']);
        assertTrue(isset($r['body']['error']), 'errorキーが存在する');
        assertEq('999999', $r['body']['customer_access_no'] ?? null, 'customer_access_noがエコーされる');

        $after = (int)dbConn($testDbPath)->query('SELECT COUNT(*) FROM payments')->fetchColumn();
        assertEq($before, $after, '入金は作成されない');
    });

    runTest('receivable_id が解決できない場合はエラーにならず invoice_id=NULL で保存される', function () use ($port, $testDbPath) {
        $r = httpJson($port, 'POST', '/payments/sync', [
            'access_payment_no'  => 70003,
            'customer_access_no' => '100',
            'payment_date'        => '2026-09-14',
            'amount'              => 500,
            'receivable_id'       => 999999,
        ]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200（422にならない）: ' . $r['status']);
        assertTrue(array_key_exists('invoice_id', $r['body']), 'invoice_idキーが存在する');
        assertEq(null, $r['body']['invoice_id'], 'invoice_idはnull');

        $pdo = dbConn($testDbPath);
        $val = $pdo->query('SELECT invoice_id FROM payments WHERE access_payment_no = 70003')->fetchColumn();
        assertTrue($val === false || $val === null, 'DB上のinvoice_idもNULL');
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
