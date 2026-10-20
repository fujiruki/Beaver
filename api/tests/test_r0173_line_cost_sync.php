<?php
/**
 * R-0173: 明細の取付場所・原価・時間・労務単価を同期で送受信する
 *
 * 起動: php api/tests/test_r0173_price_breakdown_sync.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_r0173_price_breakdown_sync_' . getmypid() . '.sqlite';
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

$bootstrap = __DIR__ . '/_r0173_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18173;
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

function r0173Pdo(string $path): PDO {
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
        'base_synced_at'     => '2099-12-31 23:59:59',
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

function lineIdOf(PDO $pdo, int $accessVoucherId): int {
    return (int)$pdo->query("SELECT l.id FROM voucher_lines l JOIN vouchers v ON v.id = l.voucher_id WHERE v.access_voucher_id = $accessVoucherId")->fetchColumn();
}

function costRows(PDO $pdo, int $lineId): array {
    $out = [];
    foreach ($pdo->query("SELECT category_code, category_name, measure_type, value, sort_order FROM voucher_line_costs WHERE voucher_line_id = $lineId")->fetchAll() as $r) {
        $out[$r['category_code']] = $r;
    }
    return $out;
}

function costCols(PDO $pdo, int $lineId): array {
    $row = $pdo->query("SELECT location_name, cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate FROM voucher_lines WHERE id = $lineId")->fetch();
    foreach ($row as $k => $v) if ($k !== 'location_name') $row[$k] = (float)$v;
    return $row;
}

function basePushLine(int $accessLineId): array {
    return ['line_no' => 1, 'access_line_id' => $accessLineId, 'item_name' => '框戸', 'quantity' => 1,
            'price_body' => 1000, 'price_hardware' => 0, 'price_glass' => 0, 'line_total' => 1000, 'tax_category' => '課税'];
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0173 明細の取付場所・原価・時間・労務単価を同期で送受信する ===\n";

    runTest('画面で costs・労務単価・取付場所を保存した行は /vouchers/sync で7キーとも返り、旧列も揃う', function () use ($port, $testDbPath) {
        pushVoucher($port, 73001, [basePushLine(7301)]);
        $pdo = r0173Pdo($testDbPath);
        $voucherId = (int)$pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 73001')->fetchColumn();
        $lineId = lineIdOf($pdo, 73001);
        $pdo = null;

        $put = httpJson($port, "/vouchers/$voucherId/lines/$lineId", 'PUT', [
            'location_name'   => '1F 洋室',
            'cost_labor_rate' => 4500,
            'costs' => [
                ['category_code' => 'MAIN',         'category_name' => '本体',     'measure_type' => 'money', 'value' => 20000, 'sort_order' => 1],
                ['category_code' => 'HARDWARE',     'category_name' => '金物',     'measure_type' => 'money', 'value' => 3000,  'sort_order' => 2],
                ['category_code' => 'GLASS',        'category_name' => 'ガラス',   'measure_type' => 'money', 'value' => 1200,  'sort_order' => 3],
                ['category_code' => 'FACTORY_TIME', 'category_name' => '工場時間', 'measure_type' => 'time',  'value' => 3.5,   'sort_order' => 4],
                ['category_code' => 'SITE_TIME',    'category_name' => '現場時間', 'measure_type' => 'time',  'value' => 1.5,   'sort_order' => 5],
            ],
        ]);
        assertTrue(str_contains($put['status'], '200'), 'PUT 200: ' . $put['status']);

        $line = syncedLine($port, 73001);
        assertEq('1F 洋室', $line['location_name'] ?? null, 'location_name');
        assertEq(20000.0, (float)($line['cost_body'] ?? -1), 'cost_body');
        assertEq(3000.0, (float)($line['cost_hardware'] ?? -1), 'cost_hardware');
        assertEq(1200.0, (float)($line['cost_glass'] ?? -1), 'cost_glass');
        assertEq(3.5, (float)($line['cost_factory_hours'] ?? -1), 'cost_factory_hours');
        assertEq(1.5, (float)($line['cost_site_hours'] ?? -1), 'cost_site_hours');
        assertEq(4500.0, (float)($line['cost_labor_rate'] ?? -1), 'cost_labor_rate');

        $cols = costCols(r0173Pdo($testDbPath), $lineId);
        assertEq(20000.0, $cols['cost_body'], '旧列 cost_body');
        assertEq(3000.0, $cols['cost_hardware'], '旧列 cost_hardware');
        assertEq(1200.0, $cols['cost_glass'], '旧列 cost_glass');
        assertEq(3.5, $cols['cost_factory_hours'], '旧列 cost_factory_hours');
        assertEq(1.5, $cols['cost_site_hours'], '旧列 cost_site_hours');
    });

    runTest('画面で一部のコードだけ costs を保存すると、無いコードの旧列は0になり sync も0を返す', function () use ($port, $testDbPath) {
        pushVoucher($port, 73002, [basePushLine(7302)]);
        $pdo = r0173Pdo($testDbPath);
        $voucherId = (int)$pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 73002')->fetchColumn();
        $lineId = lineIdOf($pdo, 73002);
        $pdo->exec("UPDATE voucher_lines SET cost_hardware = 999, cost_site_hours = 9 WHERE id = $lineId");
        $pdo = null;

        $put = httpJson($port, "/vouchers/$voucherId/lines/$lineId", 'PUT', [
            'costs' => [
                ['category_code' => 'MAIN', 'category_name' => '本体', 'measure_type' => 'money', 'value' => 8000, 'sort_order' => 1],
            ],
        ]);
        assertTrue(str_contains($put['status'], '200'), 'PUT 200: ' . $put['status']);

        $line = syncedLine($port, 73002);
        assertEq(8000.0, (float)$line['cost_body'], 'cost_body');
        assertEq(0.0, (float)$line['cost_hardware'], 'cost_hardware');
        assertEq(0.0, (float)$line['cost_site_hours'], 'cost_site_hours');
        $cols = costCols(r0173Pdo($testDbPath), $lineId);
        assertEq(0.0, $cols['cost_hardware'], '旧列 cost_hardware');
        assertEq(0.0, $cols['cost_site_hours'], '旧列 cost_site_hours');
    });

    runTest('replace の新規行は受け取った7キーを旧列に入れ、内訳テーブルは作らず、sync は旧列の値を返す', function () use ($port, $testDbPath) {
        pushVoucher($port, 73003, [basePushLine(7303) + [
            'location_name' => '2F 和室', 'cost_body' => 5000, 'cost_hardware' => 600, 'cost_glass' => 0,
            'cost_factory_hours' => 2, 'cost_site_hours' => 0.5, 'cost_labor_rate' => 4000,
        ]], 'replace');

        $pdo = r0173Pdo($testDbPath);
        $lineId = lineIdOf($pdo, 73003);
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM voucher_line_costs WHERE voucher_line_id = $lineId")->fetchColumn(), '内訳行は作らない');
        $pdo = null;

        $line = syncedLine($port, 73003);
        assertEq('2F 和室', $line['location_name'] ?? null, 'location_name');
        assertEq(5000.0, (float)$line['cost_body'], 'cost_body');
        assertEq(600.0, (float)$line['cost_hardware'], 'cost_hardware');
        assertEq(0.0, (float)$line['cost_glass'], 'cost_glass');
        assertEq(2.0, (float)$line['cost_factory_hours'], 'cost_factory_hours');
        assertEq(0.5, (float)$line['cost_site_hours'], 'cost_site_hours');
        assertEq(4000.0, (float)$line['cost_labor_rate'], 'cost_labor_rate');
    });

    runTest('取付場所が未設定の行は location_name を null で返す', function () use ($port) {
        pushVoucher($port, 73004, [basePushLine(7304)]);
        $line = syncedLine($port, 73004);
        assertTrue(array_key_exists('location_name', $line), 'location_name キーがある');
        assertEq(null, $line['location_name'], 'location_name');
    });

    runTest('replace で7キーを受け取ると、内訳を持つ行の該当コードと旧列が更新され、他コードは残る', function () use ($port, $testDbPath) {
        pushVoucher($port, 73005, [basePushLine(7305)]);
        $pdo = r0173Pdo($testDbPath);
        $lineId = lineIdOf($pdo, 73005);
        $pdo->exec("INSERT INTO voucher_line_costs (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
                    VALUES ($lineId, 'MAIN', '本体', 'money', 10000, 1),
                           ($lineId, 'FACTORY_TIME', '工場時間', 'time', 4, 4),
                           ($lineId, 'PAINT', '塗装', 'money', 700, 6)");
        $pdo = null;

        pushVoucher($port, 73005, [basePushLine(7305) + [
            'location_name' => '玄関', 'cost_body' => 12000, 'cost_hardware' => 0, 'cost_glass' => 900,
            'cost_factory_hours' => 5, 'cost_site_hours' => 2.5, 'cost_labor_rate' => 5000,
        ]], 'replace');

        $pdo = r0173Pdo($testDbPath);
        assertEq($lineId, lineIdOf($pdo, 73005), '行 id は維持される');
        $rows = costRows($pdo, $lineId);
        assertEq(12000.0, (float)($rows['MAIN']['value'] ?? -1), 'MAIN 更新', $rows);
        assertEq(5.0, (float)($rows['FACTORY_TIME']['value'] ?? -1), 'FACTORY_TIME 更新', $rows);
        assertEq(900.0, (float)($rows['GLASS']['value'] ?? -1), 'GLASS 追加', $rows);
        assertEq('ガラス', $rows['GLASS']['category_name'] ?? null, 'GLASS 名称');
        assertEq('money', $rows['GLASS']['measure_type'] ?? null, 'GLASS 種別');
        assertEq(3, (int)($rows['GLASS']['sort_order'] ?? -1), 'GLASS 並び順');
        assertEq(2.5, (float)($rows['SITE_TIME']['value'] ?? -1), 'SITE_TIME 追加', $rows);
        assertEq('現場時間', $rows['SITE_TIME']['category_name'] ?? null, 'SITE_TIME 名称');
        assertEq('time', $rows['SITE_TIME']['measure_type'] ?? null, 'SITE_TIME 種別');
        assertEq(5, (int)($rows['SITE_TIME']['sort_order'] ?? -1), 'SITE_TIME 並び順');
        assertTrue(!isset($rows['HARDWARE']), '値0の HARDWARE は追加しない');
        assertEq(700.0, (float)($rows['PAINT']['value'] ?? -1), '他コードの行は残る', $rows);

        $cols = costCols($pdo, $lineId);
        assertEq('玄関', $cols['location_name'], '旧列 location_name');
        assertEq(12000.0, $cols['cost_body'], '旧列 cost_body');
        assertEq(0.0, $cols['cost_hardware'], '旧列 cost_hardware');
        assertEq(900.0, $cols['cost_glass'], '旧列 cost_glass');
        assertEq(5.0, $cols['cost_factory_hours'], '旧列 cost_factory_hours');
        assertEq(2.5, $cols['cost_site_hours'], '旧列 cost_site_hours');
        assertEq(5000.0, $cols['cost_labor_rate'], '旧列 cost_labor_rate');
        $pdo = null;

        $line = syncedLine($port, 73005);
        assertEq(12000.0, (float)$line['cost_body'], 'sync cost_body');
        assertEq(900.0, (float)$line['cost_glass'], 'sync cost_glass');
        assertEq(2.5, (float)$line['cost_site_hours'], 'sync cost_site_hours');
    });

    runTest('replace でキーが無いときは原価・時間・労務単価・取付場所が変わらない', function () use ($port, $testDbPath) {
        pushVoucher($port, 73006, [basePushLine(7306)]);
        $pdo = r0173Pdo($testDbPath);
        $lineId = lineIdOf($pdo, 73006);
        $pdo->exec("UPDATE voucher_lines SET location_name = '勝手口', cost_body = 3000, cost_hardware = 400, cost_glass = 50,
                    cost_factory_hours = 1.5, cost_site_hours = 0.5, cost_labor_rate = 4200 WHERE id = $lineId");
        $pdo->exec("INSERT INTO voucher_line_costs (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
                    VALUES ($lineId, 'MAIN', '本体', 'money', 3000, 1), ($lineId, 'SITE_TIME', '現場時間', 'time', 0.5, 5)");
        $beforeCols = costCols($pdo, $lineId);
        $beforeRows = costRows($pdo, $lineId);
        $pdo = null;

        pushVoucher($port, 73006, [basePushLine(7306)], 'replace');

        $pdo = r0173Pdo($testDbPath);
        assertEq($beforeCols, costCols($pdo, $lineId), '旧列は変わらない');
        assertEq($beforeRows, costRows($pdo, $lineId), '内訳は変わらない');
    });

    runTest('画面で空の costs を保存すると旧列も0になる（改訂 2026-10-11）', function () use ($port, $testDbPath) {
        pushVoucher($port, 73007, [basePushLine(7307)]);
        $pdo = r0173Pdo($testDbPath);
        $voucherId = (int)$pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 73007')->fetchColumn();
        $lineId = lineIdOf($pdo, 73007);
        $pdo->exec("UPDATE voucher_lines SET cost_body = 3000, cost_hardware = 400, cost_glass = 50,
                    cost_factory_hours = 1.5, cost_site_hours = 0.5, cost_labor_rate = 4200 WHERE id = $lineId");
        $pdo = null;

        $put = httpJson($port, "/vouchers/$voucherId/lines/$lineId", 'PUT', ['costs' => []]);
        assertTrue(str_contains($put['status'], '200'), 'PUT 200: ' . $put['status']);

        $pdo = r0173Pdo($testDbPath);
        $cols = costCols($pdo, $lineId);
        assertEq(0.0, $cols['cost_body'], '旧列 cost_body');
        assertEq(0.0, $cols['cost_hardware'], '旧列 cost_hardware');
        assertEq(0.0, $cols['cost_glass'], '旧列 cost_glass');
        assertEq(0.0, $cols['cost_factory_hours'], '旧列 cost_factory_hours');
        assertEq(0.0, $cols['cost_site_hours'], '旧列 cost_site_hours');
        assertEq(4200.0, $cols['cost_labor_rate'], '労務単価は変えない');
        $pdo = null;

        $line = syncedLine($port, 73007);
        assertEq(0.0, (float)$line['cost_body'], 'sync cost_body');
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
