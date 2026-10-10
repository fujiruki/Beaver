<?php
/**
 * R-0166 伝票の楽観的ロック。
 *
 * 起動: php api/tests/test_r0166_voucher_optimistic_lock.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0166_voucher_optimistic_lock_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0166.php';
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
$pdo->exec("INSERT INTO customers (name) VALUES ('R-0166テスト得意先')");
$customerId = (int)$pdo->lastInsertId();

function createVoucher(PDO $pdo, int $customerId, string $suffix, bool $withLine = false): array {
    $pdo->prepare("INSERT INTO vouchers
        (voucher_no, voucher_type, status, customer_id, voucher_date, description, updated_at)
        VALUES (?, 'sales', 'draft', ?, '2026-10-10', '変更前', '2026-10-10 00:00:00')")
        ->execute(["S-R0166-$suffix", $customerId]);
    $voucherId = (int)$pdo->lastInsertId();
    $lineId = null;
    if ($withLine) {
        $pdo->prepare("INSERT INTO voucher_lines
            (voucher_id, line_no, line_type, item_name, quantity, line_total, tax_category, updated_at)
            VALUES (?, 1, 'normal', '変更前明細', 1, 100, 'taxable', '2026-10-10 00:00:00')")
            ->execute([$voucherId]);
        $lineId = (int)$pdo->lastInsertId();
    }
    return [$voucherId, $lineId];
}

function fetchVoucher(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

function fetchLine(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM voucher_lines WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
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
$port = 18166;
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

runTest('1. 古いヘッダー更新は409でDBを変更しない', function () use ($pdo, $customerId, $port, $old): void {
    [$id] = createVoucher($pdo, $customerId, '001');
    $before = fetchVoucher($pdo, $id);
    $response = httpJson($port, 'PUT', "/vouchers/$id", ['description' => '上書き', 'expected_updated_at' => $old]);
    assertTrue(str_contains($response['status'], '409'), 'HTTP 409');
    assertSameValue('stale_voucher', $response['body']['error'] ?? null, 'error');
    assertSameValue('2026-10-10 09:00:00', $response['body']['voucher']['updated_at'] ?? null, '競合伝票のJST時刻');
    assertSameValue($before, fetchVoucher($pdo, $id), '伝票不変');
});

runTest('2. 同じ時刻のヘッダー更新は200で最新JST時刻を返す', function () use ($pdo, $customerId, $port, $same): void {
    [$id] = createVoucher($pdo, $customerId, '002');
    $response = httpJson($port, 'PUT', "/vouchers/$id", ['description' => '更新後', 'expected_updated_at' => $same]);
    assertTrue(str_contains($response['status'], '200'), 'HTTP 200');
    assertSameValue('更新後', $response['body']['description'] ?? null, 'description');
    assertTrue(isset($response['body']['updated_at']) && preg_match('/^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$/', $response['body']['updated_at']) === 1, 'updated_at JST');
});

runTest('3. expected_updated_at省略時は従来どおり更新できる', function () use ($pdo, $customerId, $port): void {
    [$id] = createVoucher($pdo, $customerId, '003');
    $response = httpJson($port, 'PUT', "/vouchers/$id", ['description' => '省略更新']);
    assertTrue(str_contains($response['status'], '200'), 'HTTP 200');
    assertSameValue('省略更新', fetchVoucher($pdo, $id)['description'], 'description');
});

runTest('4. 明細の追加・更新・削除は古ければ不変、同じなら時刻を返す', function () use ($pdo, $customerId, $port, $same, $old): void {
    [$id, $lineId] = createVoucher($pdo, $customerId, '004', true);
    $beforeVoucher = fetchVoucher($pdo, $id);
    $beforeLine = fetchLine($pdo, $lineId);

    $staleAdd = httpJson($port, 'POST', "/vouchers/$id/lines", ['item_name' => '追加', 'expected_updated_at' => $old]);
    assertTrue(str_contains($staleAdd['status'], '409'), '追加409');
    assertSameValue(1, (int)$pdo->query("SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = $id")->fetchColumn(), '追加なし');
    assertSameValue($beforeVoucher, fetchVoucher($pdo, $id), '追加時の伝票不変');

    $staleUpdate = httpJson($port, 'PUT', "/vouchers/$id/lines/$lineId", ['item_name' => '更新', 'expected_updated_at' => $old]);
    assertTrue(str_contains($staleUpdate['status'], '409'), '更新409');
    assertSameValue($beforeLine, fetchLine($pdo, $lineId), '明細更新なし');
    assertSameValue($beforeVoucher, fetchVoucher($pdo, $id), '更新時の伝票不変');

    $staleDelete = httpJson($port, 'DELETE', "/vouchers/$id/lines/$lineId", ['expected_updated_at' => $old]);
    assertTrue(str_contains($staleDelete['status'], '409'), '削除409');
    assertSameValue($beforeLine, fetchLine($pdo, $lineId), '明細削除なし');
    assertSameValue($beforeVoucher, fetchVoucher($pdo, $id), '削除時の伝票不変');

    $okUpdate = httpJson($port, 'PUT', "/vouchers/$id/lines/$lineId", ['item_name' => '更新成功', 'expected_updated_at' => $same]);
    assertTrue(str_contains($okUpdate['status'], '200'), '更新200');
    assertTrue(isset($okUpdate['body']['voucher_updated_at']), '更新応答時刻');
    $current = $okUpdate['body']['voucher_updated_at'];

    $okAdd = httpJson($port, 'POST', "/vouchers/$id/lines", ['item_name' => '追加成功', 'expected_updated_at' => $current]);
    assertTrue(str_contains($okAdd['status'], '201'), '追加201');
    assertTrue(isset($okAdd['body']['voucher_updated_at']), '追加応答時刻');
    $current = $okAdd['body']['voucher_updated_at'];

    $okDelete = httpJson($port, 'DELETE', "/vouchers/$id/lines/$lineId", ['expected_updated_at' => $current]);
    assertTrue(str_contains($okDelete['status'], '200'), '削除200');
    assertTrue(isset($okDelete['body']['voucher_updated_at']), '削除応答時刻');
});

runTest('5. 取消と原価再取得も古ければ409で変更しない', function () use ($pdo, $customerId, $port, $old): void {
    [$voidId, $lineId] = createVoucher($pdo, $customerId, '005', true);
    $beforeVoucher = fetchVoucher($pdo, $voidId);
    $beforeLine = fetchLine($pdo, $lineId);
    $void = httpJson($port, 'DELETE', "/vouchers/$voidId", ['reason' => '取消理由', 'expected_updated_at' => $old]);
    assertTrue(str_contains($void['status'], '409'), '取消409');
    assertSameValue($beforeVoucher, fetchVoucher($pdo, $voidId), '取消時の伝票不変');

    $reload = httpJson($port, 'POST', "/vouchers/$voidId/reload-snapshots", ['expected_updated_at' => $old]);
    assertTrue(str_contains($reload['status'], '409'), '再取得409');
    assertSameValue($beforeVoucher, fetchVoucher($pdo, $voidId), '再取得時の伝票不変');
    assertSameValue($beforeLine, fetchLine($pdo, $lineId), '再取得時の明細不変');
});

runTest('6. expected_updated_atの形式不正は400', function () use ($pdo, $customerId, $port): void {
    [$id] = createVoucher($pdo, $customerId, '006');
    $response = httpJson($port, 'PUT', "/vouchers/$id", ['description' => '更新', 'expected_updated_at' => '2026/10/10']);
    assertTrue(str_contains($response['status'], '400'), 'HTTP 400');
    assertSameValue('Invalid expected_updated_at format', $response['body']['error'] ?? null, 'error');
});

echo "PASS: $passed, FAIL: $failed\n";
exit($failed === 0 ? 0 : 1);
