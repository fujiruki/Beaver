<?php
/**
 * R-0170 取消（void）した伝票を下書きに戻す（POST /vouchers/{id}/unvoid）
 *
 * 起動: php api/tests/test_r0170_voucher_unvoid.php
 *
 * docs/spec/R-0170_voucher_unvoid.md のテスト項目を検証する（test_r0154_voucher_void.php と同じ方式）。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_r0170_voucher_unvoid_' . getmypid() . '.sqlite';
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

require_once $ROOT . '/routes/sync_helpers.php';

$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先', '100')");
$customerId = (int)$pdo->lastInsertId();

const OLD_TS = '2020-01-01 00:00:00';

function createVoucher(PDO $pdo, array $o = []): int {
    static $seq = 0;
    $seq++;
    $stmt = $pdo->prepare("
        INSERT INTO vouchers
            (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type, description,
             total_amount, access_voucher_id, access_billed_flag, source_voucher_id, source_estimate_no, updated_at)
        VALUES (?, ?, ?, ?, '2026-10-01', 'exclusive', ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $o['voucher_no'] ?? sprintf('S-R0170-%03d', $seq),
        $o['voucher_type'] ?? 'sales',
        $o['status'] ?? 'draft',
        $o['customer_id'] ?? null,
        $o['description'] ?? null,
        $o['total_amount'] ?? 0,
        $o['access_voucher_id'] ?? null,
        $o['access_billed_flag'] ?? 0,
        $o['source_voucher_id'] ?? null,
        $o['source_estimate_no'] ?? null,
        OLD_TS,
    ]);
    return (int)$pdo->lastInsertId();
}

function createLine(PDO $pdo, int $voucherId, ?string $itemName, float $quantity = 1, float $price = 0, float $lineTotal = 0): int {
    static $lineNo = 0;
    $lineNo++;
    $pdo->prepare("
        INSERT INTO voucher_lines
            (voucher_id, line_no, line_type, item_name, quantity, price_body, line_total, tax_category)
        VALUES (?, ?, 'normal', ?, ?, ?, ?, '課税')
    ")->execute([$voucherId, $lineNo, $itemName, $quantity, $price, $lineTotal]);
    return (int)$pdo->lastInsertId();
}

function voucherRow(PDO $pdo, int $id): ?array {
    $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $s->execute([$id]);
    $r = $s->fetch();
    return $r ?: null;
}

function lineCount(PDO $pdo, int $voucherId): int {
    $s = $pdo->prepare('SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = ?');
    $s->execute([$voucherId]);
    return (int)$s->fetchColumn();
}

function historyRows(PDO $pdo, int $voucherId): array {
    $s = $pdo->prepare("SELECT * FROM record_history WHERE entity = 'vouchers' AND entity_id = ? ORDER BY id");
    $s->execute([$voucherId]);
    return $s->fetchAll();
}

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
$bootstrap = __DIR__ . '/_server_bootstrap_r0170.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18170;
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

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0170 取消した伝票を下書きに戻す ===
";

    runTest('1. void の伝票を unvoid → draft・updated_at前進・履歴に unvoid と理由', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['status' => 'void', 'total_amount' => 11000]);
        createLine($pdo, $id, '框戸', 1, 10000, 10000);

        $r = httpJson($port, 'POST', "/vouchers/$id/unvoid", ['reason' => '取消を誤った']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);

        $v = voucherRow($pdo, $id);
        assertEq('draft', $v['status'], 'status');
        assertTrue($v['updated_at'] > OLD_TS, 'updated_atが進む: ' . $v['updated_at']);

        $h = historyRows($pdo, $id);
        assertEq(1, count($h), '履歴件数');
        assertEq('unvoid', $h[0]['action'], 'action');
        $before = json_decode($h[0]['before_json'], true);
        $after  = json_decode((string)$h[0]['after_json'], true);
        assertEq('取消を誤った', $before['related']['reason'] ?? null, 'before_json.related.reason');
        assertEq('void', $before['row']['status'] ?? null, '戻す前status');
        assertEq('draft', $after['row']['status'] ?? null, '戻した後status');
    });

    runTest('2. 理由空欄でも戻せる（理由は空）', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['status' => 'void']);
        createLine($pdo, $id, '障子', 1, 2500, 2500);

        $r = httpJson($port, 'POST', "/vouchers/$id/unvoid");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('draft', voucherRow($pdo, $id)['status'], 'status');
        $before = json_decode(historyRows($pdo, $id)[0]['before_json'], true);
        assertEq('', $before['related']['reason'] ?? null, '理由は空');
    });

    foreach (['draft', 'billed'] as $status) {
        runTest("3. status=$status は 409・変更なし・履歴なし", function () use ($pdo, $port, $status) {
            $id = createVoucher($pdo, ['status' => $status]);
            $r = httpJson($port, 'POST', "/vouchers/$id/unvoid", ['reason' => 'x']);
            assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
            $v = voucherRow($pdo, $id);
            assertEq($status, $v['status'], 'status不変');
            assertEq(OLD_TS, $v['updated_at'], 'updated_at不変');
            assertEq(0, count(historyRows($pdo, $id)), '履歴なし');
        });
    }

    runTest('4. expected_updated_at が古い → 409 stale_voucher・変更なし', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['status' => 'void']);
        $r = httpJson($port, 'POST', "/vouchers/$id/unvoid", ['expected_updated_at' => '2019-01-01 09:00:00']);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('stale_voucher', $r['body']['error'] ?? null, 'error');
        assertEq('void', voucherRow($pdo, $id)['status'], 'status不変');
    });

    runTest('5. 存在しない伝票 → 404', function () use ($port) {
        $r = httpJson($port, 'POST', '/vouchers/999999/unvoid');
        assertTrue(str_contains($r['status'], '404'), 'HTTP 404: ' . $r['status']);
    });

    runTest('6. 戻したあとは下書きとして明細を追加できる', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['status' => 'void']);
        $r = httpJson($port, 'POST', "/vouchers/$id/unvoid");
        assertTrue(str_contains($r['status'], '200'), 'unvoid 200: ' . $r['status']);
        $add = httpJson($port, 'POST', "/vouchers/$id/lines", ['item_name' => '引戸', 'quantity' => 1, 'line_total' => 0]);
        assertTrue(str_contains($add['status'], '201') || str_contains($add['status'], '200'), '明細追加: ' . $add['status']);
        assertEq(1, lineCount($pdo, $id), '明細1件');
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

echo "
========================================
";
echo "PASSED: $passed
";
echo "FAILED: $failed
";
if ($failed > 0) {
    echo "----- failures -----
";
    foreach ($failures as $f) echo " - $f
";
    exit(1);
}
@unlink($testDbPath);
exit(0);
