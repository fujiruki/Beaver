<?php
/** 起動: php api/tests/test_r0119_voucher_fixes.php */
declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0119_' . getmypid() . '.sqlite';
register_shutdown_function(function () use ($dbPath): void { @unlink($dbPath); });
$pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec(file_get_contents($root . '/schema.sql'));
foreach (glob($root . '/migrations/*.sql') as $migration) {
    foreach (explode(';', (string)file_get_contents($migration)) as $sql) {
        $sql = trim((string)preg_replace('/^\s*--.*$/m', '', $sql));
        if ($sql === '') continue;
        try { $pdo->exec($sql); } catch (Throwable $_) { }
    }
}
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0), ('sales', 0)");
$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT INTO customers (name) VALUES ('R-0119得意先')");
$customerId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO sales_categories (name) VALUES ('R-0119売上種別')");
$salesCategoryId = (int)$pdo->lastInsertId();

$bootstrap = __DIR__ . '/_server_bootstrap_r0119.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$port = 18119;
$proc = proc_open(['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'], [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']], $pipes, $root);
if (!is_resource($proc)) throw new RuntimeException('テストサーバーを起動できません');

function requestJson(int $port, string $method, string $path, ?array $body = null): array {
    $options = ['method' => $method, 'ignore_errors' => true, 'timeout' => 5, 'header' => "Content-Type: application/json\r\nConnection: close\r\n"];
    if ($body !== null) $options['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    $raw = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, stream_context_create(['http' => $options]));
    return json_decode((string)$raw, true) ?? [];
}
function same($expected, $actual, string $message): void {
    if ($expected !== $actual) throw new RuntimeException("$message expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
}

try {
    for ($i = 0; $i < 30; $i++) {
        usleep(100000);
        if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) break;
    }
    $created = requestJson($port, 'POST', '/vouchers', ['voucher_type' => 'sales', 'customer_id' => $customerId, 'sales_category_id' => $salesCategoryId]);
    $voucherId = (int)$created['id'];
    $fetched = requestJson($port, 'GET', "/vouchers/$voucherId");
    same($salesCategoryId, (int)$fetched['sales_category_id'], '作成時の sales_category_id');
    requestJson($port, 'PUT', "/vouchers/$voucherId", ['sales_category_id' => null]);
    $fetched = requestJson($port, 'GET', "/vouchers/$voucherId");
    same(null, $fetched['sales_category_id'], '更新時の sales_category_id');

    $categoryValue = ['category_code' => 'body', 'category_name' => '本体', 'measure_type' => 'money', 'value' => 5000, 'sort_order' => 1];
    $line = requestJson($port, 'POST', "/vouchers/$voucherId/lines", ['line_total' => 10000, 'tax_category' => 'taxable', 'costs' => [$categoryValue], 'prices' => [$categoryValue]]);
    $lineId = (int)$line['id'];
    $voucher = requestJson($port, 'GET', "/vouchers/$voucherId");
    same(1000, (int)$voucher['tax_amount'], 'taxable 行の税額');
    requestJson($port, 'PUT', "/vouchers/$voucherId/lines/$lineId", ['costs' => [], 'prices' => []]);
    same(0, (int)$pdo->query("SELECT COUNT(*) FROM voucher_line_costs WHERE voucher_line_id = $lineId")->fetchColumn(), 'costs 空配列クリア');
    same(0, (int)$pdo->query("SELECT COUNT(*) FROM voucher_line_prices WHERE voucher_line_id = $lineId")->fetchColumn(), 'prices 空配列クリア');

    require_once $root . '/routes/sync_helpers.php';
    $pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type) VALUES ('E-R119-SYNC', 'estimate', 'draft', $customerId, '2026-08-26', 'exclusive')");
    $syncVoucherId = (int)$pdo->lastInsertId();
    $error = insertSyncedLines($pdo, $syncVoucherId, [['tax_category' => '課税', 'line_total' => 100]]);
    same(null, $error, '同期明細の受信');
    same('taxable', $pdo->query("SELECT tax_category FROM voucher_lines WHERE voucher_id = $syncVoucherId")->fetchColumn(), '同期受信後のDB正準値');
    $sync = requestJson($port, 'GET', '/vouchers/sync');
    $syncVoucher = array_values(array_filter($sync['vouchers'], fn(array $v): bool => (int)$v['id'] === $syncVoucherId))[0];
    same('課税', $syncVoucher['lines'][0]['tax_category'], '同期応答の日本語値');
    echo "R-0119 PHPテスト: 8 PASS / 0 FAIL\n";
} finally {
    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    proc_terminate($proc);
    proc_close($proc);
    @unlink($bootstrap);
}
