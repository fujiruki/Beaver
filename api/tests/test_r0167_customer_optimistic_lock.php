<?php
/**
 * R-0167 得意先の楽観的ロック。
 *
 * 起動: php api/tests/test_r0167_customer_optimistic_lock.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0167_customer_optimistic_lock_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0167.php';
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

function createCustomer(PDO $pdo, string $suffix): int {
    $pdo->prepare("INSERT INTO customers (code, name, updated_at, last_synced_at)
        VALUES (?, '変更前', '2026-10-10 00:00:00', '2026-10-09 23:00:00')")
        ->execute(["R0167-$suffix"]);
    return (int)$pdo->lastInsertId();
}

function fetchCustomer(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
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
    $raw = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $context);
    return [
        'status' => $http_response_header[0] ?? '',
        'body' => json_decode((string)$raw, true),
    ];
}

function assertSameValue(mixed $expected, mixed $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$label expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

function assertTrue(bool $condition, string $label): void {
    if (!$condition) throw new RuntimeException($label);
}

$passed = 0;
$failed = 0;
function runTest(string $name, callable $test): void {
    global $passed, $failed;
    try { $test(); echo "[OK] $name\n"; $passed++; }
    catch (Throwable $e) { echo "[NG] $name: {$e->getMessage()}\n"; $failed++; }
}

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$port = 18167;
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

$same = '2026-10-10 09:00:00';
$old = '2026-10-10 08:59:59';

runTest('1. 古い更新は409で最新得意先を返しDBを変更しない', function () use ($pdo, $port, $old): void {
    $id = createCustomer($pdo, '001');
    $before = fetchCustomer($pdo, $id);
    $response = httpJson($port, 'PUT', "/customers/$id", ['name' => '上書き', 'expected_updated_at' => $old]);
    assertTrue(str_contains($response['status'], '409'), 'HTTP 409');
    assertSameValue('stale_customer', $response['body']['error'] ?? null, 'error');
    assertSameValue('変更前', $response['body']['customer']['name'] ?? null, '最新得意先');
    assertSameValue('2026-10-10 09:00:00', $response['body']['customer']['updated_at'] ?? null, 'updated_at JST');
    assertSameValue('2026-10-10 08:00:00', $response['body']['customer']['last_synced_at'] ?? null, 'last_synced_at JST');
    assertSameValue($before, fetchCustomer($pdo, $id), '得意先不変');
});

runTest('2. 同じ時刻の更新は200で最新JST時刻を返す', function () use ($pdo, $port, $same): void {
    $id = createCustomer($pdo, '002');
    $response = httpJson($port, 'PUT', "/customers/$id", ['name' => '更新後', 'expected_updated_at' => $same]);
    assertTrue(str_contains($response['status'], '200'), 'HTTP 200');
    assertSameValue('更新後', $response['body']['name'] ?? null, 'name');
    assertTrue(isset($response['body']['updated_at']) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $response['body']['updated_at']) === 1, 'updated_at JST');
    assertTrue(isset($response['body']['last_synced_at']) && preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $response['body']['last_synced_at']) === 1, 'last_synced_at JST');
});

runTest('3. expected_updated_at省略時は従来どおり更新できる', function () use ($pdo, $port): void {
    $id = createCustomer($pdo, '003');
    $response = httpJson($port, 'PUT', "/customers/$id", ['name' => '省略更新']);
    assertTrue(str_contains($response['status'], '200'), 'HTTP 200');
    assertSameValue('省略更新', fetchCustomer($pdo, $id)['name'], 'name');
});

runTest('4. 削除は古ければ不変、同じなら論理削除する', function () use ($pdo, $port, $same, $old): void {
    $id = createCustomer($pdo, '004');
    $stale = httpJson($port, 'DELETE', "/customers/$id", ['expected_updated_at' => $old]);
    assertTrue(str_contains($stale['status'], '409'), '古い削除409');
    assertSameValue('stale_customer', $stale['body']['error'] ?? null, 'error');
    assertSameValue(1, (int)fetchCustomer($pdo, $id)['is_active'], '古い削除では有効');

    $ok = httpJson($port, 'DELETE', "/customers/$id", ['expected_updated_at' => $same]);
    assertTrue(str_contains($ok['status'], '200'), '同じ時刻の削除200');
    assertSameValue(0, (int)fetchCustomer($pdo, $id)['is_active'], '論理削除済み');
});

runTest('5. expected_updated_atの形式不正は400', function () use ($pdo, $port): void {
    $putId = createCustomer($pdo, '005-put');
    $put = httpJson($port, 'PUT', "/customers/$putId", ['name' => '更新', 'expected_updated_at' => '2026/10/10']);
    assertTrue(str_contains($put['status'], '400'), 'PUT HTTP 400');
    assertSameValue('Invalid expected_updated_at format', $put['body']['error'] ?? null, 'PUT error');

    $deleteId = createCustomer($pdo, '005-delete');
    $delete = httpJson($port, 'DELETE', "/customers/$deleteId?expected_updated_at=invalid");
    assertTrue(str_contains($delete['status'], '400'), 'DELETE HTTP 400');
    assertSameValue('Invalid expected_updated_at format', $delete['body']['error'] ?? null, 'DELETE error');
});

echo "PASS: $passed, FAIL: $failed\n";
exit($failed === 0 ? 0 : 1);
