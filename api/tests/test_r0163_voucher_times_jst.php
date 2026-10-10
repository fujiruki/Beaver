<?php
/**
 * R-0163 伝票詳細の時刻をJSTで返す。
 *
 * 起動: php api/tests/test_r0163_voucher_times_jst.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$testDbPath = __DIR__ . '/test_r0163_voucher_times_jst_' . getmypid() . '.sqlite';
@unlink($testDbPath);
register_shutdown_function(function () use ($testDbPath): void { @unlink($testDbPath); });

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
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
$pdo->exec("INSERT INTO customers (name) VALUES ('R-0163テスト得意先')");
$customerId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO vouchers
    (voucher_no, voucher_type, status, customer_id, voucher_date, created_at, updated_at, last_synced_at)
    VALUES
    ('S-R0163-001', 'sales', 'draft', $customerId, '2026-10-10', '2026-10-10 01:02:03', '2026-10-10 04:05:06', '2026-10-10 07:08:09'),
    ('S-R0163-002', 'sales', 'draft', $customerId, '2026-10-10', '2026-10-10 10:11:12', '2026-10-10 13:14:15', NULL)");
$firstId = (int)$pdo->query("SELECT id FROM vouchers WHERE voucher_no = 'S-R0163-001'")->fetchColumn();
$secondId = (int)$pdo->query("SELECT id FROM vouchers WHERE voucher_no = 'S-R0163-002'")->fetchColumn();

$bootstrap = __DIR__ . '/_server_bootstrap_r0163.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");
register_shutdown_function(function () use ($bootstrap): void { @unlink($bootstrap); });

$port = 18163;
$proc = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $ROOT, $ROOT . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $pipes,
    $ROOT
);
if (!is_resource($proc)) throw new RuntimeException('php ビルトインサーバを起動できませんでした');
register_shutdown_function(function () use ($proc): void { proc_terminate($proc); proc_close($proc); });

$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) { $ready = true; break; }
}
if (!$ready) throw new RuntimeException('サーバが応答しません');

function getVoucher(int $port, int $id): array {
    $raw = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/vouchers/$id");
    if ($raw === false) throw new RuntimeException('GETに失敗しました');
    return json_decode($raw, true, flags: JSON_THROW_ON_ERROR);
}

$passed = 0;
$failed = 0;
function runTest(string $name, callable $test): void {
    global $passed, $failed;
    try { $test(); echo "[OK] $name\n"; $passed++; }
    catch (Throwable $e) { echo "[NG] $name: {$e->getMessage()}\n"; $failed++; }
}
function assertSameValue(mixed $expected, mixed $actual, string $name): void {
    if ($expected !== $actual) throw new RuntimeException("$name expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
}

runTest('GET /vouchers/{id} は3つの時刻をUTCからJSTへ変換する', function () use ($port, $firstId): void {
    $body = getVoucher($port, $firstId);
    assertSameValue('2026-10-10 10:02:03', $body['created_at'], 'created_at');
    assertSameValue('2026-10-10 13:05:06', $body['updated_at'], 'updated_at');
    assertSameValue('2026-10-10 16:08:09', $body['last_synced_at'], 'last_synced_at');
});

runTest('last_synced_atがNULLならNULLのまま返す', function () use ($port, $secondId): void {
    $body = getVoucher($port, $secondId);
    assertSameValue(null, $body['last_synced_at'], 'last_synced_at');
});

@unlink($bootstrap);
@unlink($testDbPath);
echo "PASS: $passed, FAIL: $failed\n";
exit($failed === 0 ? 0 : 1);
