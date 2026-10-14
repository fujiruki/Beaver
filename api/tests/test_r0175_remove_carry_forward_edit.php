<?php
/**
 * R-0175 繰越残高をBeaverで編集できないことのテスト。
 *
 * 起動: php api/tests/test_r0175_remove_carry_forward_edit.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0175_remove_carry_forward_edit_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0175_' . getmypid() . '.php';
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

$pdo->exec("INSERT INTO customers (code, name, carry_forward_balance, updated_at)
    VALUES ('R0175', '繰越残高テスト', 1000, '2026-10-14 00:00:00')");
$customerId = (int)$pdo->lastInsertId();

function httpJson(int $port, string $method, string $path, array $body): array {
    $context = stream_context_create(['http' => [
        'method' => $method,
        'header' => "Content-Type: application/json\r\nConnection: close\r\n",
        'content' => json_encode($body, JSON_UNESCAPED_UNICODE),
        'ignore_errors' => true,
        'timeout' => 5,
    ]]);
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

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\ndefine('BILLING_EDIT_ENABLED', true);\n");
$port = 18175;
$process = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $pipes,
    $root
);
if (!is_resource($process)) throw new RuntimeException('phpビルトインサーバーを起動できませんでした');

try {
    $ready = false;
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) {
            $ready = true;
            break;
        }
    }
    if (!$ready) throw new RuntimeException('サーバーが応答しません');

    $before = $pdo->query("SELECT carry_forward_balance, updated_at FROM customers WHERE id = $customerId")->fetch();
    $response = httpJson($port, 'PATCH', "/customers/$customerId/carry-forward", ['carry_forward_balance' => 9999]);
    $after = $pdo->query("SELECT carry_forward_balance, updated_at FROM customers WHERE id = $customerId")->fetch();

    assertSameValue(true, str_contains($response['status'], '403'), 'HTTP 403');
    assertSameValue('carry_forward_is_access_owned', $response['body']['error'] ?? null, 'error');
    assertSameValue($before, $after, '繰越残高とupdated_atは変わらない');
    echo "PASS: 1, FAIL: 0\n";
} catch (Throwable $e) {
    echo "PASS: 0, FAIL: 1\n";
    echo "[NG] {$e->getMessage()}\n";
    $exitCode = 1;
} finally {
    proc_terminate($process);
    proc_close($process);
    @unlink($bootstrap);
    @unlink($dbPath);
}

exit($exitCode ?? 0);
