<?php
/** R-0193 日付印字フラグの新規作成時の既定値。 */
declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0193_print_date_default_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0193.php';
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
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('R-0193得意先', 'R0193')");

function httpJsonR0193(int $port, string $method, string $path, ?array $body = null): array {
    $options = [
        'method' => $method,
        'header' => "Content-Type: application/json\r\nConnection: close\r\n",
        'ignore_errors' => true,
        'timeout' => 5,
    ];
    if ($body !== null) $options['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    $raw = file_get_contents(
        "http://127.0.0.1:$port/contents/Beaver/api$path",
        false,
        stream_context_create(['http' => $options])
    );
    return ['status' => $http_response_header[0] ?? '', 'body' => json_decode((string)$raw, true)];
}

function assertSameR0193(mixed $expected, mixed $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$label expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$port = 18193;
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
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) break;
}

$omitted = httpJsonR0193($port, 'POST', '/vouchers', [
    'customer_id' => 1,
    'voucher_date' => '2026-10-24',
]);
assertSameR0193(0, (int)$omitted['body']['print_date_flag'], '通常作成の省略時');

$specified = httpJsonR0193($port, 'POST', '/vouchers', [
    'customer_id' => 1,
    'voucher_date' => '2026-10-24',
    'print_date_flag' => 1,
]);
assertSameR0193(1, (int)$specified['body']['print_date_flag'], '通常作成の明示値');

$syncOmitted = httpJsonR0193($port, 'POST', '/vouchers/sync', [
    'access_voucher_id' => 919301,
    'voucher_type' => 'estimate',
    'customer_access_no' => 'R0193',
    'voucher_date' => '2026-10-24',
]);
$syncOmittedRow = $pdo->query('SELECT print_date_flag FROM vouchers WHERE access_voucher_id = 919301')->fetch();
assertSameR0193(0, (int)$syncOmittedRow['print_date_flag'], '同期作成の省略時');

$syncSpecified = httpJsonR0193($port, 'POST', '/vouchers/sync', [
    'access_voucher_id' => 919302,
    'voucher_type' => 'estimate',
    'customer_access_no' => 'R0193',
    'voucher_date' => '2026-10-24',
    'print_date_flag' => 1,
]);
$syncSpecifiedRow = $pdo->query('SELECT print_date_flag FROM vouchers WHERE access_voucher_id = 919302')->fetch();
assertSameR0193(1, (int)$syncSpecifiedRow['print_date_flag'], '同期作成の明示値');

httpJsonR0193($port, 'POST', '/vouchers/sync', [
    'access_voucher_id' => 919302,
    'base_synced_at' => '2099-12-31 23:59:59',
    'voucher_type' => 'estimate',
    'customer_access_no' => 'R0193',
    'voucher_date' => '2026-10-25',
]);
$syncUpdatedRow = $pdo->query('SELECT print_date_flag FROM vouchers WHERE access_voucher_id = 919302')->fetch();
assertSameR0193(1, (int)$syncUpdatedRow['print_date_flag'], '同期更新の省略時は保持');

echo "OK: R-0193\n";
