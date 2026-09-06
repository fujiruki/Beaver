<?php
/**
 * AccessTategu連携契約 A-B-03: GET/POST /vouchers/sync に lines[] を追加するテスト
 *
 * 起動: php api/tests/test_vouchers_sync_lines.php
 *
 * - php ビルトインサーバを起動して実際にHTTPで叩く（test_projects_sync.php と同じ方式）
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_vouchers_sync_lines_' . getmypid() . '.sqlite';
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

$bootstrap = __DIR__ . '/_vouchers_sync_lines_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18098;
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

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== A-B-03 POST/GET /vouchers/sync に lines[] の往復一致 ===\n";

    runTest('POST /vouchers/sync で lines を送信すると、GET /vouchers/sync で line_no・item_name・quantity・price・updated_at が往復一致する', function () use ($port) {
        $lines = [
            ['line_no' => 1, 'item_name' => '框戸A', 'quantity' => 2, 'line_total' => 12000, 'tax_category' => '課税'],
            ['line_no' => 2, 'item_name' => '把手B', 'quantity' => 1, 'line_total' => 3000,  'tax_category' => '課税'],
        ];
        $post = httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id'  => 40001,
            'voucher_type'       => 'estimate',
            'customer_access_no' => '',
            'voucher_date'       => '2026-09-01',
            'total_amount'       => 15000,
            'lines'              => $lines,
        ]);
        assertTrue(str_contains($post['status'], '200'), 'POST 200: ' . $post['status']);

        $get = httpJson($port, '/vouchers/sync', 'GET');
        assertTrue(str_contains($get['status'], '200'), 'GET 200: ' . $get['status']);
        $voucher = findVoucherByAccessId($get['body']['vouchers'], 40001);
        assertTrue($voucher !== null, 'access_voucher_id=40001 の伝票が見つかる');
        assertEq(2, count($voucher['lines']), '明細2件');

        foreach ($lines as $i => $expected) {
            $actual = $voucher['lines'][$i];
            assertEq($expected['line_no'], (int)$actual['line_no'], "line_no[$i] 往復一致");
            assertEq($expected['item_name'], $actual['item_name'], "item_name[$i] 往復一致");
            assertEq((float)$expected['quantity'], (float)$actual['quantity'], "quantity[$i] 往復一致");
            assertTrue(array_key_exists('price', $actual), "price[$i] キーが存在する");
            assertEq((float)$expected['line_total'], (float)$actual['price'], "price[$i] = line_total が往復一致");
            assertTrue(array_key_exists('updated_at', $actual) && $actual['updated_at'] !== null, "updated_at[$i] が非nullで存在する");
        }
    });

    echo "\n=== A-B-03 lines_mode 自動判定（replace/merge） ===\n";

    runTest('edited_in_beaverの行が無い状態でlines_mode未指定の再pushは自動的に全置換される', function () use ($port) {
        // 1回目push: 初期明細2件
        httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id'  => 40002,
            'voucher_type'       => 'estimate',
            'customer_access_no' => '',
            'voucher_date'       => '2026-09-01',
            'total_amount'       => 5000,
            'lines' => [
                ['line_no' => 1, 'item_name' => '旧明細A', 'quantity' => 1, 'line_total' => 2000, 'tax_category' => '課税'],
                ['line_no' => 2, 'item_name' => '旧明細B', 'quantity' => 1, 'line_total' => 3000, 'tax_category' => '課税'],
            ],
        ]);

        // 2回目push（lines_mode未指定・edited_in_beaver=1の行なし）: 別内容の明細1件
        $post2 = httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id'  => 40002,
            'voucher_type'       => 'estimate',
            'customer_access_no' => '',
            'voucher_date'       => '2026-09-02',
            'total_amount'       => 9000,
            'lines' => [
                ['line_no' => 1, 'item_name' => '新明細C', 'quantity' => 1, 'line_total' => 9000, 'tax_category' => '課税'],
            ],
        ]);
        assertTrue(str_contains($post2['status'], '200'), 'POST(2回目) 200: ' . $post2['status']);

        $get = httpJson($port, '/vouchers/sync', 'GET');
        $voucher = findVoucherByAccessId($get['body']['vouchers'], 40002);
        assertTrue($voucher !== null, '伝票が見つかる');
        assertEq(1, count($voucher['lines']), '自動replaceにより明細1件のみになる');
        assertEq('新明細C', $voucher['lines'][0]['item_name'], '新しいpayloadの明細に置き換わる');
    });

    runTest('edited_in_beaver=1の行がある状態でlines_mode未指定の再pushは既存明細を保護する', function () use ($port, $testDbPath) {
        // 1回目push: 初期明細2件
        httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id'  => 40003,
            'voucher_type'       => 'estimate',
            'customer_access_no' => '',
            'voucher_date'       => '2026-09-01',
            'total_amount'       => 5000,
            'lines' => [
                ['line_no' => 1, 'item_name' => '保護対象A', 'quantity' => 1, 'line_total' => 2000, 'tax_category' => '課税'],
                ['line_no' => 2, 'item_name' => '保護対象B', 'quantity' => 1, 'line_total' => 3000, 'tax_category' => '課税'],
            ],
        ]);

        // Beaver側で1行を編集した状態を模擬（edited_in_beaver=1）
        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $voucherId = (int)$tmpPdo->query("SELECT id FROM vouchers WHERE access_voucher_id = 40003")->fetchColumn();
        $tmpPdo->exec("UPDATE voucher_lines SET edited_in_beaver = 1, item_name = 'Beaver編集後A' WHERE voucher_id = $voucherId AND line_no = 1");
        $tmpPdo = null;

        // 2回目push（lines_mode未指定）: 別内容の明細で上書きしようとする
        $post2 = httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id'  => 40003,
            'voucher_type'       => 'estimate',
            'customer_access_no' => '',
            'voucher_date'       => '2026-09-02',
            'total_amount'       => 9000,
            'lines' => [
                ['line_no' => 1, 'item_name' => '新明細D', 'quantity' => 1, 'line_total' => 9000, 'tax_category' => '課税'],
            ],
        ]);
        assertTrue(str_contains($post2['status'], '200'), 'POST(2回目) 200: ' . $post2['status']);

        $get = httpJson($port, '/vouchers/sync', 'GET');
        $voucher = findVoucherByAccessId($get['body']['vouchers'], 40003);
        assertTrue($voucher !== null, '伝票が見つかる');
        assertEq(2, count($voucher['lines']), '保護により既存2件のまま変化しない');
        $itemNames = array_column($voucher['lines'], 'item_name');
        assertTrue(in_array('Beaver編集後A', $itemNames, true), 'Beaver編集済み明細が保持される');
        assertTrue(in_array('保護対象B', $itemNames, true), '未編集の既存明細も保持される（保護は伝票単位）');
        assertTrue(!in_array('新明細D', $itemNames, true), '新しいpayloadの明細で上書きされない');
    });

    runTest('明示的にlines_mode=replaceを送るとedited_in_beaver=1の行があっても全置換される', function () use ($port, $testDbPath) {
        // 1回目push: 初期明細1件
        httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id'  => 40004,
            'voucher_type'       => 'estimate',
            'customer_access_no' => '',
            'voucher_date'       => '2026-09-01',
            'total_amount'       => 2000,
            'lines' => [
                ['line_no' => 1, 'item_name' => '編集済み明細', 'quantity' => 1, 'line_total' => 2000, 'tax_category' => '課税'],
            ],
        ]);

        // Beaver側で編集済みの状態を模擬
        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $voucherId = (int)$tmpPdo->query("SELECT id FROM vouchers WHERE access_voucher_id = 40004")->fetchColumn();
        $tmpPdo->exec("UPDATE voucher_lines SET edited_in_beaver = 1 WHERE voucher_id = $voucherId");
        $tmpPdo = null;

        // lines_mode=replace を明示指定して再push
        $post2 = httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id'  => 40004,
            'voucher_type'       => 'estimate',
            'customer_access_no' => '',
            'voucher_date'       => '2026-09-02',
            'total_amount'       => 5000,
            'lines_mode'         => 'replace',
            'lines' => [
                ['line_no' => 1, 'item_name' => 'Access強制置換後', 'quantity' => 1, 'line_total' => 5000, 'tax_category' => '課税'],
            ],
        ]);
        assertTrue(str_contains($post2['status'], '200'), 'POST(2回目) 200: ' . $post2['status']);

        $get = httpJson($port, '/vouchers/sync', 'GET');
        $voucher = findVoucherByAccessId($get['body']['vouchers'], 40004);
        assertTrue($voucher !== null, '伝票が見つかる');
        assertEq(1, count($voucher['lines']), '明示的replaceで1件に置き換わる');
        assertEq('Access強制置換後', $voucher['lines'][0]['item_name'], '明示的replaceでedited_in_beaver=1でも上書きされる');
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
