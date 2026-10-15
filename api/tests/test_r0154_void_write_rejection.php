<?php
/**
 * R-0154 追加仕様3: 取消済み伝票の書き込み拒否
 *
 * 起動: php api/tests/test_r0154_void_write_rejection.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0154_void_write_rejection_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0154_void_write_rejection.php';
foreach ([$dbPath, $bootstrap] as $path) {
    if (file_exists($path)) unlink($path);
}

$pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');
$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $migration) {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($migration));
    foreach (explode(';', $sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '') continue;
        try { $pdo->exec($statement); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}

$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('取消拒否テスト得意先', 'R0154-WR')");
$customerId = (int)$pdo->lastInsertId();

function createVoidVoucher(PDO $pdo, int $customerId, string $type = 'sales'): array {
    static $seq = 0;
    $seq++;
    $voucherNo = sprintf('%s-R0154-WR-%03d', $type === 'estimate' ? 'E' : 'S', $seq);
    $pdo->prepare("INSERT INTO vouchers
        (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type, description, total_amount, updated_at)
        VALUES (?, ?, 'void', ?, '2026-10-01', 'exclusive', '取消前件名', 1100, '2026-10-15 01:00:00')")
        ->execute([$voucherNo, $type, $customerId]);
    $voucherId = (int)$pdo->lastInsertId();
    $pdo->prepare("INSERT INTO voucher_lines
        (voucher_id, line_no, line_type, item_name, quantity, price_body, line_total, tax_category)
        VALUES (?, 1, 'normal', '取消前明細', 1, 1000, 1000, '課税')")
        ->execute([$voucherId]);
    return ['id' => $voucherId, 'line_id' => (int)$pdo->lastInsertId(), 'voucher_no' => $voucherNo];
}

function voucherSnapshot(PDO $pdo, int $voucherId): string {
    $v = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $v->execute([$voucherId]);
    $l = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY id');
    $l->execute([$voucherId]);
    return json_encode(['voucher' => $v->fetch(), 'lines' => $l->fetchAll()], JSON_UNESCAPED_UNICODE);
}

function httpJson(int $port, string $method, string $path, ?array $body = null): array {
    $options = [
        'method' => $method,
        'header' => "Content-Type: application/json\r\nConnection: close\r\n",
        'ignore_errors' => true,
        'timeout' => 5,
    ];
    if ($body !== null) $options['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    $context = stream_context_create(['http' => $options]);
    $raw = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $context);
    return ['status' => $http_response_header[0] ?? '', 'body' => json_decode((string)$raw, true)];
}

function assertSameValue(mixed $expected, mixed $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$label expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

function assertContains(string $needle, string $actual, string $label): void {
    if (!str_contains($actual, $needle)) throw new RuntimeException("$label: $actual");
}

$passed = 0;
$failed = 0;
$failures = [];
function runTest(string $name, callable $test): void {
    global $passed, $failed, $failures;
    try {
        $test();
        echo "  [OK] $name\n";
        $passed++;
    } catch (Throwable $e) {
        echo "  [NG] $name :: {$e->getMessage()}\n";
        $failed++;
        $failures[] = "$name: {$e->getMessage()}";
    }
}

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\ndefine('BILLING_EDIT_ENABLED', true);\n");
$port = 18155;
$server = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $ROOT, $ROOT . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $pipes,
    $ROOT
);

try {
    if (!is_resource($server)) throw new RuntimeException('php ビルトインサーバを起動できませんでした');
    $ready = false;
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        $health = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health");
        if ($health !== false) { $ready = true; break; }
    }
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== void伝票の通常書き込み拒否 ===\n";
    $cases = [
        ['PUT /vouchers/{id}', 'PUT', fn(array $v) => "/vouchers/{$v['id']}", ['description' => '変更後件名']],
        ['POST /vouchers/{id}/lines', 'POST', fn(array $v) => "/vouchers/{$v['id']}/lines", ['item_name' => '追加明細', 'quantity' => 1]],
        ['PUT /vouchers/{id}/lines/{lineId}', 'PUT', fn(array $v) => "/vouchers/{$v['id']}/lines/{$v['line_id']}", ['item_name' => '変更後明細']],
        ['DELETE /vouchers/{id}/lines/{lineId}', 'DELETE', fn(array $v) => "/vouchers/{$v['id']}/lines/{$v['line_id']}", null],
        ['POST /vouchers/{id}/reload-snapshots', 'POST', fn(array $v) => "/vouchers/{$v['id']}/reload-snapshots", []],
        ['DELETE /vouchers/{id}', 'DELETE', fn(array $v) => "/vouchers/{$v['id']}", ['reason' => '再取消']],
    ];
    foreach ($cases as [$name, $method, $path, $body]) {
        runTest("$name はexpected_updated_atなしでも409・変更なし", function () use ($pdo, $port, $customerId, $method, $path, $body) {
            $voucher = createVoidVoucher($pdo, $customerId);
            $before = voucherSnapshot($pdo, $voucher['id']);
            $response = httpJson($port, $method, $path($voucher), $body);
            assertContains('409', $response['status'], 'HTTP 409');
            assertSameValue('無効化済みの伝票は編集できません', $response['body']['error'] ?? null, 'error');
            assertSameValue($before, voucherSnapshot($pdo, $voucher['id']), '伝票・明細不変');
        });
    }

    runTest('取消前のexpected_updated_atなら先に409 stale_voucher', function () use ($pdo, $port, $customerId) {
        $voucher = createVoidVoucher($pdo, $customerId);
        $before = voucherSnapshot($pdo, $voucher['id']);
        $response = httpJson($port, 'PUT', "/vouchers/{$voucher['id']}", [
            'description' => '変更後件名',
            'expected_updated_at' => '2020-01-01 09:00:00',
        ]);
        assertContains('409', $response['status'], 'HTTP 409');
        assertSameValue('stale_voucher', $response['body']['error'] ?? null, 'error');
        assertSameValue($before, voucherSnapshot($pdo, $voucher['id']), '伝票・明細不変');
    });

    echo "\n=== void伝票の派生書き込み拒否 ===\n";
    runTest('voidの見積は売上変換409・売上を作らない', function () use ($pdo, $port, $customerId) {
        $voucher = createVoidVoucher($pdo, $customerId, 'estimate');
        $before = (int)$pdo->query("SELECT COUNT(*) FROM vouchers WHERE voucher_type = 'sales'")->fetchColumn();
        $response = httpJson($port, 'POST', "/vouchers/{$voucher['id']}/convert-to-sales");
        assertContains('409', $response['status'], 'HTTP 409');
        assertSameValue('無効化済みの伝票は引用できません', $response['body']['error'] ?? null, 'error');
        $after = (int)$pdo->query("SELECT COUNT(*) FROM vouchers WHERE voucher_type = 'sales'")->fetchColumn();
        assertSameValue($before, $after, '売上件数不変');
    });

    runTest('請求編集有効でもvoid伝票を含む請求作成は409・全て不変', function () use ($pdo, $port, $customerId) {
        $voucher = createVoidVoucher($pdo, $customerId);
        $invoiceBefore = (int)$pdo->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
        $linkBefore = (int)$pdo->query('SELECT COUNT(*) FROM invoice_vouchers')->fetchColumn();
        $response = httpJson($port, 'POST', '/invoices', [
            'customer_id' => $customerId,
            'invoice_date' => '2026-10-15',
            'cutoff_date' => '2026-10-15',
            'billing_date' => '2026-10-31',
            'invoice_total' => 1100,
            'voucher_ids' => [$voucher['id']],
        ]);
        assertContains('409', $response['status'], 'HTTP 409');
        assertSameValue('無効化済みの伝票は請求できません', $response['body']['error'] ?? null, 'error');
        assertSameValue([$voucher['id']], $response['body']['voucher_ids'] ?? null, 'voucher_ids');
        assertSameValue($invoiceBefore, (int)$pdo->query('SELECT COUNT(*) FROM invoices')->fetchColumn(), '請求書件数不変');
        assertSameValue($linkBefore, (int)$pdo->query('SELECT COUNT(*) FROM invoice_vouchers')->fetchColumn(), '紐付け件数不変');
        assertSameValue('void', $pdo->query("SELECT status FROM vouchers WHERE id = {$voucher['id']}")->fetchColumn(), '伝票はvoidのまま');
    });

    runTest('unvoidは従来どおり通る', function () use ($pdo, $port, $customerId) {
        $voucher = createVoidVoucher($pdo, $customerId);
        $response = httpJson($port, 'POST', "/vouchers/{$voucher['id']}/unvoid", ['reason' => '取消解除']);
        assertContains('200', $response['status'], 'HTTP 200');
        assertSameValue('unvoided', $response['body']['result'] ?? null, 'result');
        assertSameValue('draft', $pdo->query("SELECT status FROM vouchers WHERE id = {$voucher['id']}")->fetchColumn(), 'status');
    });
} finally {
    if (is_resource($server)) {
        foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
        proc_terminate($server);
        proc_close($server);
    }
    @unlink($bootstrap);
    @unlink($dbPath);
}

echo "\n結果: $passed PASS / $failed FAIL\n";
if ($failed > 0) {
    foreach ($failures as $failure) echo "  - $failure\n";
    exit(1);
}
