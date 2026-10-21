<?php
/** R-0190: 伝票テキスト255文字制限 */
declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0190_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0190.php';
$port = 18190;
register_shutdown_function(function () use ($dbPath, $bootstrap): void { @unlink($dbPath); @unlink($bootstrap); });

$pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdo->exec('PRAGMA foreign_keys = ON');
$pdo->exec(file_get_contents($root . '/schema.sql'));
foreach (glob($root . '/migrations/*.sql') as $migration) {
    foreach (explode(';', (string)file_get_contents($migration)) as $sql) {
        $sql = trim((string)preg_replace('/^\s*--.*$/m', '', $sql));
        if ($sql === '') continue;
        try { $pdo->exec($sql); } catch (Throwable $_) { }
    }
}
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0), ('sales', 0)");
$pdo->exec("INSERT INTO customers (id, name, access_customer_no) VALUES (1, 'R-0190得意先', 'R0190-C')");

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$proc = proc_open(['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'], [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']], $pipes, $root);
if (!is_resource($proc)) throw new RuntimeException('テストサーバーを起動できません');

function requestR0190(int $port, string $method, string $path, array $body): array {
    $raw = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, stream_context_create(['http' => [
        'method' => $method, 'ignore_errors' => true, 'timeout' => 5,
        'header' => "Content-Type: application/json\r\nConnection: close\r\n",
        'content' => json_encode($body, JSON_UNESCAPED_UNICODE),
    ]]));
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s/', $statusLine, $matches);
    return ['status' => (int)($matches[1] ?? 0), 'body' => json_decode((string)$raw, true) ?? []];
}
function sameR0190($expected, $actual, string $message): void {
    if ($expected !== $actual) throw new RuntimeException("$message expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
}
function assertTooLongR0190(array $response, string $field): void {
    sameR0190(400, $response['status'], "$field HTTP状態");
    sameR0190(['error' => 'text_too_long', 'field' => $field, 'max' => 255], $response['body'], "$field エラー本文");
}

try {
    for ($i = 0; $i < 30; $i++) { usleep(100000); if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) break; }
    $text255 = str_repeat('全', 255);
    $text256 = str_repeat('全', 256);

    $created = requestR0190($port, 'POST', '/vouchers', ['voucher_type' => 'estimate', 'customer_id' => 1, 'description' => $text255]);
    sameR0190(201, $created['status'], '全角255文字の摘要を保存できる');
    $voucherId = (int)$created['body']['id'];
    $beforeDescription = $pdo->query("SELECT description FROM vouchers WHERE id = $voucherId")->fetchColumn();
    assertTooLongR0190(requestR0190($port, 'PUT', "/vouchers/$voucherId", ['description' => $text256]), 'description');
    sameR0190($beforeDescription, $pdo->query("SELECT description FROM vouchers WHERE id = $voucherId")->fetchColumn(), '摘要エラー時はDB不変');
    $voucherCount = (int)$pdo->query('SELECT COUNT(*) FROM vouchers')->fetchColumn();
    assertTooLongR0190(requestR0190($port, 'POST', '/vouchers', ['voucher_type' => 'estimate', 'customer_id' => 1, 'description' => $text256]), 'description');
    sameR0190($voucherCount, (int)$pdo->query('SELECT COUNT(*) FROM vouchers')->fetchColumn(), '伝票作成エラー時はDB不変');

    $lineFields = ['item_name', 'location_name', 'memo'];
    $validLine = array_fill_keys($lineFields, $text255);
    $lineCreated = requestR0190($port, 'POST', "/vouchers/$voucherId/lines", $validLine);
    sameR0190(201, $lineCreated['status'], '明細3項目の全角255文字を保存できる');
    $lineId = (int)$lineCreated['body']['id'];
    foreach ($lineFields as $field) {
        $before = $pdo->query("SELECT $field FROM voucher_lines WHERE id = $lineId")->fetchColumn();
        assertTooLongR0190(requestR0190($port, 'PUT', "/vouchers/$voucherId/lines/$lineId", [$field => $text256]), $field);
        sameR0190($before, $pdo->query("SELECT $field FROM voucher_lines WHERE id = $lineId")->fetchColumn(), "$field 更新エラー時はDB不変");
        $lineCount = (int)$pdo->query('SELECT COUNT(*) FROM voucher_lines')->fetchColumn();
        assertTooLongR0190(requestR0190($port, 'POST', "/vouchers/$voucherId/lines", [$field => $text256]), $field);
        sameR0190($lineCount, (int)$pdo->query('SELECT COUNT(*) FROM voucher_lines')->fetchColumn(), "$field 作成エラー時はDB不変");
    }

    $syncBase = ['access_voucher_id' => 190001, 'voucher_type' => 'estimate', 'customer_access_no' => 'R0190-C', 'voucher_date' => '2026-10-21'];
    $syncValid = requestR0190($port, 'POST', '/vouchers/sync', $syncBase + ['description' => $text255, 'lines' => [$validLine]]);
    sameR0190(200, $syncValid['status'], '同期でも全角255文字を保存できる');
    $syncVoucherId = (int)$syncValid['body']['voucher_id'];
    foreach (['description', ...$lineFields] as $field) {
        $payload = $syncBase + ['access_voucher_id' => 190010 + array_search($field, ['description', ...$lineFields], true)];
        if ($field === 'description') $payload['description'] = $text256;
        else $payload['lines'] = [[$field => $text256]];
        $beforeCount = (int)$pdo->query('SELECT COUNT(*) FROM vouchers')->fetchColumn();
        assertTooLongR0190(requestR0190($port, 'POST', '/vouchers/sync', $payload), $field);
        sameR0190($beforeCount, (int)$pdo->query('SELECT COUNT(*) FROM vouchers')->fetchColumn(), "$field 同期エラー時はDB不変");
    }
    sameR0190($text255, $pdo->query("SELECT description FROM vouchers WHERE id = $syncVoucherId")->fetchColumn(), '同期済み255文字を保持する');
    echo "R-0190 PHPテスト: PASS\n";
} finally {
    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    proc_terminate($proc); proc_close($proc);
}
