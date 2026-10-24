<?php
/** R-0191 納期と納品日を別項目として扱う。 */
declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0191_due_date_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0191.php';
@unlink($dbPath);

$pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');
$pdo->exec(file_get_contents($root . '/schema.sql'));
$migrations = glob($root . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $migration) {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($migration));
    foreach (explode(';', $sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '') continue;
        try { $pdo->exec($statement); } catch (PDOException $e) {
            if (!str_contains($e->getMessage(), 'duplicate column name')) throw $e;
        }
    }
}
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0), ('sales', 0)");
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('R-0191得意先', 'R0191')");

function httpJsonR0191(int $port, string $method, string $path, ?array $body = null): array {
    $options = [
        'method' => $method,
        'header' => "Content-Type: application/json\r\nConnection: close\r\n",
        'ignore_errors' => true,
        'timeout' => 5,
    ];
    if ($body !== null) $options['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    $context = stream_context_create(['http' => $options]);
    $raw = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $context);
    return ['status' => $http_response_header[0] ?? '', 'body' => json_decode((string)$raw, true)];
}

function assertSameR0191(mixed $expected, mixed $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$label expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

function assertTrueR0191(bool $condition, string $label): void {
    if (!$condition) throw new RuntimeException($label);
}

$columns = array_column($pdo->query('PRAGMA table_info(vouchers)')->fetchAll(), 'name');
assertTrueR0191(in_array('due_date', $columns, true), 'vouchers.due_date列が存在する');

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$port = 18191;
$process = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $pipes,
    $root
);
if (!is_resource($process)) throw new RuntimeException('phpビルトインサーバーを起動できませんでした');
register_shutdown_function(function () use ($process, $bootstrap, $dbPath): void {
    proc_terminate($process);
    proc_close($process);
    @unlink($bootstrap);
    @unlink($dbPath);
});

$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) { $ready = true; break; }
}
if (!$ready) throw new RuntimeException('サーバーが応答しません');

$created = httpJsonR0191($port, 'POST', '/vouchers', [
    'voucher_type' => 'estimate',
    'customer_id' => 1,
    'voucher_date' => '2026-10-24',
    'due_date' => '2026-11-10',
    'delivery_date' => '2026-11-12',
]);
assertTrueR0191(str_contains($created['status'], '201'), '新規作成は201');
$id = (int)$created['body']['id'];
assertSameR0191('2026-11-10', $created['body']['due_date'] ?? null, 'POST応答のdue_date');
assertSameR0191('2026-11-12', $created['body']['delivery_date'] ?? null, 'POST応答のdelivery_date');

$updated = httpJsonR0191($port, 'PUT', "/vouchers/$id", ['due_date' => '2026-11-20']);
assertTrueR0191(str_contains($updated['status'], '200'), '更新は200');
assertSameR0191('2026-11-20', $updated['body']['due_date'] ?? null, 'PUT応答のdue_date');
assertSameR0191('2026-11-12', $updated['body']['delivery_date'] ?? null, '納期更新で納品日は不変');

$fetched = httpJsonR0191($port, 'GET', "/vouchers/$id");
assertSameR0191('2026-11-20', $fetched['body']['due_date'] ?? null, 'GET応答のdue_date');

$sync = httpJsonR0191($port, 'POST', '/vouchers/sync', [
    'access_voucher_id' => 9191,
    'voucher_type' => 'estimate',
    'customer_access_no' => 'R0191',
    'voucher_date' => '2026-10-24',
    'due_date' => '2099-12-31',
]);
assertTrueR0191(
    str_contains($sync['status'], '200'),
    '同期新規作成は200: ' . $sync['status'] . ' ' . json_encode($sync['body'], JSON_UNESCAPED_UNICODE)
);
$syncRow = $pdo->query('SELECT due_date FROM vouchers WHERE access_voucher_id = 9191')->fetch();
assertSameR0191(null, $syncRow['due_date'], '同期受信はdue_dateを無視');

$syncList = httpJsonR0191($port, 'GET', '/vouchers/sync');
foreach ($syncList['body']['vouchers'] as $voucher) {
    assertTrueR0191(!array_key_exists('due_date', $voucher), '同期送信にdue_dateを含めない');
}

echo "OK: R-0191\n";
