<?php
/**
 * R-0143 A-B-04: POST /invoices/sync テスト
 *
 * 起動: php api/tests/test_invoices_sync.php
 *
 * - migration 031（access_receivable_id/access_cancelled_at）を前提に、
 *   AccessTategu からの請求書 push 受信（upsert）を検証する。
 * - php ビルトインサーバを起動して実際にHTTPで叩く（test_vouchers_sync_lines.php と同じ方式）
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_invoices_sync_' . getmypid() . '.sqlite';
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
    INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type, access_voucher_id)
    VALUES ('S-00001', 'sales', 'approved', $customerId, '2026-09-01', 'exclusive', 50001)
");
$voucherId1 = (int)$pdo->lastInsertId();
$pdo->exec("
    INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type, access_voucher_id)
    VALUES ('S-00002', 'sales', 'approved', $customerId, '2026-09-02', 'exclusive', 50002)
");
$voucherId2 = (int)$pdo->lastInsertId();

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
$bootstrap = __DIR__ . '/_server_bootstrap_invoices_sync.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18104;
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

    echo "=== R-0143 A-B-04 POST /invoices/sync ===\n";

    runTest('新規 access_receivable_id で INSERT され、customer_access_no が customer_id に解決される', function () use ($port, $testDbPath, $customerId) {
        $r = httpJson($port, 'POST', '/invoices/sync', [
            'access_receivable_id' => 90001,
            'customer_access_no'   => '100',
            'cutoff_day'            => '2026-09-05',
            'billing_date'          => '2026-09-10',
            'carry_forward'         => 1000,
            'sales_total'           => 5000,
            'tax_total'             => 500,
            'payment_received'      => 0,
            'invoice_total'         => 6500,
            'next_carry_forward'    => 6500,
        ]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq($customerId, (int)$r['body']['customer_id'], 'customer_access_no=100 が customer_id に解決される');
        assertEq('2026-09-05', $r['body']['cutoff_date'], 'cutoff_day が cutoff_date にマッピングされる');
        assertEq(6500.0, (float)$r['body']['invoice_total'], 'invoice_total');

        $pdo = dbConn($testDbPath);
        $count = (int)$pdo->query('SELECT COUNT(*) FROM invoices WHERE access_receivable_id = 90001')->fetchColumn();
        assertEq(1, $count, '1件だけ作成される');
    });

    runTest('同じ access_receivable_id を再送すると1件のまま内容が更新される（冪等性）', function () use ($port, $testDbPath) {
        $r = httpJson($port, 'POST', '/invoices/sync', [
            'access_receivable_id' => 90001,
            'customer_access_no'   => '100',
            'cutoff_day'            => '2026-09-05',
            'billing_date'          => '2026-09-10',
            'carry_forward'         => 1000,
            'sales_total'           => 8000,
            'tax_total'             => 800,
            'payment_received'      => 2000,
            'invoice_total'         => 9800,
            'next_carry_forward'    => 7800,
        ]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq(9800.0, (float)$r['body']['invoice_total'], '2回目送信の値で更新される');

        $pdo = dbConn($testDbPath);
        $count = (int)$pdo->query('SELECT COUNT(*) FROM invoices WHERE access_receivable_id = 90001')->fetchColumn();
        assertEq(1, $count, '再送しても1件のまま');
        $row = $pdo->query('SELECT sales_total, payment_received FROM invoices WHERE access_receivable_id = 90001')->fetch();
        assertEq(8000.0, (float)$row['sales_total'], 'DB上のsales_totalも更新されている');
        assertEq(2000.0, (float)$row['payment_received'], 'DB上のpayment_receivedも更新されている');
    });

    runTest('cancelled_at が access_cancelled_at として保存・返却される', function () use ($port, $testDbPath) {
        $r = httpJson($port, 'POST', '/invoices/sync', [
            'access_receivable_id' => 90002,
            'customer_access_no'   => '100',
            'billing_date'          => '2026-09-15',
            'invoice_total'         => 3000,
            'cancelled_at'          => '2026-09-16 10:00:00',
        ]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('2026-09-16 10:00:00', $r['body']['access_cancelled_at'], '応答に access_cancelled_at が含まれる');

        $pdo = dbConn($testDbPath);
        $val = $pdo->query('SELECT access_cancelled_at FROM invoices WHERE access_receivable_id = 90002')->fetchColumn();
        assertEq('2026-09-16 10:00:00', $val, 'DBにも保存されている');
    });

    runTest('未知の customer_access_no は422になり、請求書が作られない', function () use ($port, $testDbPath) {
        $before = (int)dbConn($testDbPath)->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
        $r = httpJson($port, 'POST', '/invoices/sync', [
            'access_receivable_id' => 90003,
            'customer_access_no'   => '999999',
            'billing_date'          => '2026-09-20',
            'invoice_total'         => 1000,
        ]);
        assertTrue(str_contains($r['status'], '422'), 'HTTP 422: ' . $r['status']);
        assertTrue(isset($r['body']['error']), 'errorキーが存在する');
        assertEq('999999', $r['body']['customer_access_no'] ?? null, 'customer_access_noがエコーされる');

        $after = (int)dbConn($testDbPath)->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
        assertEq($before, $after, '請求書は作成されない');
    });

    runTest('voucher_access_ids[] が invoice_vouchers に正しく紐付けられる', function () use ($port, $testDbPath, $voucherId1, $voucherId2) {
        $r = httpJson($port, 'POST', '/invoices/sync', [
            'access_receivable_id' => 90004,
            'customer_access_no'   => '100',
            'billing_date'          => '2026-09-25',
            'invoice_total'         => 4000,
            'voucher_access_ids'    => [50001, 50002],
        ]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $invoiceId = (int)$r['body']['id'];

        $pdo = dbConn($testDbPath);
        $rows = $pdo->query("SELECT voucher_id FROM invoice_vouchers WHERE invoice_id = $invoiceId ORDER BY voucher_id")->fetchAll(PDO::FETCH_COLUMN);
        sort($rows);
        $expected = [$voucherId1, $voucherId2];
        sort($expected);
        assertEq($expected, array_map('intval', $rows), '2件の伝票が紐付けられる');

        // 再送すると一旦削除してから登録し直される（1件のみに絞り込み）
        $r2 = httpJson($port, 'POST', '/invoices/sync', [
            'access_receivable_id' => 90004,
            'customer_access_no'   => '100',
            'billing_date'          => '2026-09-25',
            'invoice_total'         => 4000,
            'voucher_access_ids'    => [50001],
        ]);
        assertTrue(str_contains($r2['status'], '200'), 'HTTP 200 (再送): ' . $r2['status']);
        $rows2 = $pdo->query("SELECT voucher_id FROM invoice_vouchers WHERE invoice_id = $invoiceId")->fetchAll(PDO::FETCH_COLUMN);
        assertEq([$voucherId1], array_map('intval', $rows2), '再送で1件に絞り込まれる');
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
