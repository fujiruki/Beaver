<?php
/**
 * R-0171: 売値の内訳（本体・金物・ガラス）を同期で正しく送受信する
 *
 * 起動: php api/tests/test_r0171_price_breakdown_sync.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_r0171_price_breakdown_sync_' . getmypid() . '.sqlite';
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

$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0)");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('sales', 0)");
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

function assertEq($expected, $actual, string $label = '', array $debug = []): void {
    if ($expected !== $actual) {
        $dbg = empty($debug) ? '' : ' debug=' . json_encode($debug, JSON_UNESCAPED_UNICODE);
        throw new RuntimeException(sprintf(
            "%s expected=%s actual=%s%s",
            $label,
            var_export($expected, true),
            var_export($actual, true),
            $dbg
        ));
    }
}

function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

$bootstrap = __DIR__ . '/_r0171_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18171;
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

function httpJson(int $port, string $path, string $method, ?array $body = null): array {
    $opts = [
        'method'  => $method,
        'header'  => "Content-Type: application/json\r\nConnection: close\r\n",
        'timeout' => 5,
        'ignore_errors' => true,
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

function findVoucherByAccessId(array $vouchers, int $accessVoucherId): ?array {
    foreach ($vouchers as $v) {
        if ((int)($v['access_voucher_id'] ?? 0) === $accessVoucherId) return $v;
    }
    return null;
}

function r0171Pdo(string $path): PDO {
    return new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

function pushVoucher(int $port, int $accessVoucherId, array $lines, ?string $linesMode = null): void {
    $body = [
        'access_voucher_id'  => $accessVoucherId,
        'voucher_type'       => 'estimate',
        'customer_access_no' => '',
        'voucher_date'       => '2026-10-01',
        'total_amount'       => 0,
        'lines'              => $lines,
    ];
    if ($linesMode !== null) $body['lines_mode'] = $linesMode;
    $res = httpJson($port, '/vouchers/sync', 'POST', $body);
    assertTrue(str_contains($res['status'], '200'), 'POST /vouchers/sync 200: ' . $res['status']);
}

function syncedLine(int $port, int $accessVoucherId): array {
    $get = httpJson($port, '/vouchers/sync', 'GET');
    $voucher = findVoucherByAccessId($get['body']['vouchers'], $accessVoucherId);
    assertTrue($voucher !== null, "access_voucher_id=$accessVoucherId の伝票が見つかる");
    assertEq(1, count($voucher['lines']), '明細1件');
    return $voucher['lines'][0];
}

function pricesByCode(array $prices): array {
    $out = [];
    foreach ($prices as $p) $out[$p['category_code']] = (float)$p['value'];
    return $out;
}

function lineIdOf(PDO $pdo, int $accessVoucherId): int {
    return (int)$pdo->query("SELECT l.id FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id WHERE v.access_voucher_id = $accessVoucherId")->fetchColumn();
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0171 売値の内訳を同期で送受信する ===\n";

    runTest('画面で prices を保存した行は /vouchers/sync で内訳の値を返し、旧形式の列も揃う', function () use ($port, $testDbPath) {
        pushVoucher($port, 71001, [
            ['line_no' => 1, 'access_line_id' => 9101, 'item_name' => '框戸', 'quantity' => 1,
             'price_body' => 100, 'price_hardware' => 200, 'price_glass' => 300, 'line_total' => 600, 'tax_category' => '課税'],
        ]);
        $pdo = r0171Pdo($testDbPath);
        $voucherId = (int)$pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 71001')->fetchColumn();
        $lineId = lineIdOf($pdo, 71001);
        $pdo = null;

        $put = httpJson($port, "/vouchers/$voucherId/lines/$lineId", 'PUT', [
            'line_total' => 38600,
            'prices' => [
                ['category_code' => 'MAIN',     'category_name' => '本体', 'measure_type' => 'money', 'value' => 35700, 'sort_order' => 1],
                ['category_code' => 'HARDWARE', 'category_name' => '金物', 'measure_type' => 'money', 'value' => 2900,  'sort_order' => 2],
            ],
        ]);
        assertTrue(str_contains($put['status'], '200'), 'PUT 200: ' . $put['status']);

        $line = syncedLine($port, 71001);
        assertEq(35700.0, (float)$line['price_body'], 'price_body');
        assertEq(2900.0, (float)$line['price_hardware'], 'price_hardware');
        assertEq(0.0, (float)$line['price_glass'], 'price_glass');

        $pdo = r0171Pdo($testDbPath);
        $row = $pdo->query("SELECT price_body, price_hardware, price_glass FROM voucher_lines WHERE id = $lineId")->fetch();
        assertEq(35700.0, (float)$row['price_body'], '旧形式 price_body');
        assertEq(2900.0, (float)$row['price_hardware'], '旧形式 price_hardware');
        assertEq(0.0, (float)$row['price_glass'], '旧形式 price_glass');
    });

    runTest('内訳テーブルの値と旧形式の列がずれていても /vouchers/sync は内訳テーブルの値を返す', function () use ($port, $testDbPath) {
        pushVoucher($port, 71002, [
            ['line_no' => 1, 'access_line_id' => 9201, 'item_name' => '引戸', 'quantity' => 1,
             'price_body' => 0, 'price_hardware' => 0, 'price_glass' => 0, 'line_total' => 0, 'tax_category' => '課税'],
        ]);
        $pdo = r0171Pdo($testDbPath);
        $lineId = lineIdOf($pdo, 71002);
        $pdo->exec("INSERT INTO voucher_line_prices (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
                    VALUES ($lineId, 'MAIN', '本体', 'money', 12000, 1), ($lineId, 'GLASS', 'ガラス', 'money', 800, 3)");
        $pdo = null;

        $line = syncedLine($port, 71002);
        assertEq(12000.0, (float)$line['price_body'], 'price_body');
        assertEq(0.0, (float)$line['price_hardware'], 'price_hardware');
        assertEq(800.0, (float)$line['price_glass'], 'price_glass');
    });

    runTest('内訳テーブルが無い行は旧形式の列の値を返す', function () use ($port) {
        pushVoucher($port, 71003, [
            ['line_no' => 1, 'access_line_id' => 9301, 'item_name' => '開き戸', 'quantity' => 1,
             'price_body' => 5000, 'price_hardware' => 700, 'price_glass' => 300, 'line_total' => 6000, 'tax_category' => '課税'],
        ]);
        $line = syncedLine($port, 71003);
        assertEq(5000.0, (float)$line['price_body'], 'price_body');
        assertEq(700.0, (float)$line['price_hardware'], 'price_hardware');
        assertEq(300.0, (float)$line['price_glass'], 'price_glass');
    });

    runTest('replace で受け取った price_* が内訳テーブルの MAIN/HARDWARE/GLASS に反映され、他コードの行は残る', function () use ($port, $testDbPath) {
        pushVoucher($port, 71004, [
            ['line_no' => 1, 'access_line_id' => 9401, 'item_name' => '框戸', 'quantity' => 1,
             'price_body' => 0, 'price_hardware' => 0, 'price_glass' => 0, 'line_total' => 0, 'tax_category' => '課税'],
        ]);
        $pdo = r0171Pdo($testDbPath);
        $voucherId = (int)$pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 71004')->fetchColumn();
        $lineId = lineIdOf($pdo, 71004);
        $pdo->exec("INSERT INTO voucher_line_prices (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
                    VALUES ($lineId, 'MAIN', '本体', 'money', 35700, 1),
                           ($lineId, 'HARDWARE', '金物', 'money', 2900, 2),
                           ($lineId, 'PAINT', '塗装', 'money', 1500, 4)");
        $pdo = null;

        pushVoucher($port, 71004, [
            ['line_no' => 1, 'access_line_id' => 9401, 'item_name' => '框戸', 'quantity' => 1,
             'price_body' => 40000, 'price_hardware' => 0, 'price_glass' => 1200, 'line_total' => 41200, 'tax_category' => '課税'],
        ], 'replace');

        $pdo = r0171Pdo($testDbPath);
        assertEq($lineId, lineIdOf($pdo, 71004), '行 id は維持される');
        $db = [];
        foreach ($pdo->query("SELECT category_code, value FROM voucher_line_prices WHERE voucher_line_id = $lineId")->fetchAll() as $r) {
            $db[$r['category_code']] = (float)$r['value'];
        }
        assertEq(40000.0, $db['MAIN'] ?? null, 'MAIN 更新', $db);
        assertEq(0.0, $db['HARDWARE'] ?? null, 'HARDWARE 更新', $db);
        assertEq(1200.0, $db['GLASS'] ?? null, 'GLASS 追加', $db);
        assertEq(1500.0, $db['PAINT'] ?? null, '他コードの行は残る', $db);
        $pdo = null;

        $detail = httpJson($port, "/vouchers/$voucherId", 'GET');
        assertTrue(str_contains($detail['status'], '200'), 'GET /vouchers/{id} 200: ' . $detail['status']);
        $prices = pricesByCode($detail['body']['lines'][0]['prices'] ?? []);
        assertEq(40000.0, $prices['MAIN'] ?? null, '画面の MAIN', $prices);
        assertEq(1200.0, $prices['GLASS'] ?? null, '画面の GLASS', $prices);
        assertEq(1500.0, $prices['PAINT'] ?? null, '画面の PAINT', $prices);
    });

    runTest('replace で値0のコードは内訳行が無ければ追加しない', function () use ($port, $testDbPath) {
        pushVoucher($port, 71005, [
            ['line_no' => 1, 'access_line_id' => 9501, 'item_name' => '框戸', 'quantity' => 1,
             'price_body' => 0, 'price_hardware' => 0, 'price_glass' => 0, 'line_total' => 0, 'tax_category' => '課税'],
        ]);
        $pdo = r0171Pdo($testDbPath);
        $lineId = lineIdOf($pdo, 71005);
        $pdo->exec("INSERT INTO voucher_line_prices (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
                    VALUES ($lineId, 'MAIN', '本体', 'money', 10000, 1)");
        $pdo = null;

        pushVoucher($port, 71005, [
            ['line_no' => 1, 'access_line_id' => 9501, 'item_name' => '框戸', 'quantity' => 1,
             'price_body' => 11000, 'price_hardware' => 0, 'price_glass' => 0, 'line_total' => 11000, 'tax_category' => '課税'],
        ], 'replace');

        $pdo = r0171Pdo($testDbPath);
        $rows = $pdo->query("SELECT category_code, value FROM voucher_line_prices WHERE voucher_line_id = $lineId")->fetchAll();
        assertEq(1, count($rows), '値0の HARDWARE/GLASS は追加されない', $rows);
        assertEq(11000.0, (float)$rows[0]['value'], 'MAIN 更新');
    });

    runTest('replace で内訳テーブルが無い行は内訳行を作らず旧形式の列だけ更新する', function () use ($port, $testDbPath) {
        pushVoucher($port, 71006, [
            ['line_no' => 1, 'access_line_id' => 9601, 'item_name' => '框戸', 'quantity' => 1,
             'price_body' => 100, 'price_hardware' => 0, 'price_glass' => 0, 'line_total' => 100, 'tax_category' => '課税'],
        ]);
        pushVoucher($port, 71006, [
            ['line_no' => 1, 'access_line_id' => 9601, 'item_name' => '框戸', 'quantity' => 1,
             'price_body' => 900, 'price_hardware' => 50, 'price_glass' => 0, 'line_total' => 950, 'tax_category' => '課税'],
        ], 'replace');

        $pdo = r0171Pdo($testDbPath);
        $lineId = lineIdOf($pdo, 71006);
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM voucher_line_prices WHERE voucher_line_id = $lineId")->fetchColumn(), '内訳行は作らない');
        $row = $pdo->query("SELECT price_body, price_hardware FROM voucher_lines WHERE id = $lineId")->fetch();
        assertEq(900.0, (float)$row['price_body'], '旧形式 price_body');
        assertEq(50.0, (float)$row['price_hardware'], '旧形式 price_hardware');
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
