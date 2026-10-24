<?php
/**
 * R-0196: ロック済み売上伝票の案件変更テスト
 *
 * 実行: php api/tests/test_r0196_project_change_on_locked_vouchers.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0196_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_r0196_bootstrap.php';
@unlink($dbPath);
register_shutdown_function(static function () use ($dbPath, $bootstrap): void {
    @unlink($dbPath);
    @unlink($bootstrap);
});

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
        try { $pdo->exec($statement); } catch (Throwable $_) { /* 適用済み相当は無視 */ }
    }
}

$pdo->exec("INSERT INTO customers (id, name) VALUES (1, '得意先')");
$pdo->exec("INSERT INTO projects (id, customer_id, name, status) VALUES
    (1, 1, '旧案件', '進行中'), (2, 1, '新案件', '進行中')");
$insert = $pdo->prepare("INSERT INTO vouchers
    (id, voucher_no, voucher_type, status, project_id, customer_id, voucher_date, memo,
     access_billed_flag, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, '2026-10-24', '変更前', ?, '2020-01-01 00:00:00')");
$insert->execute([1, 'S0196-1', 'sales', 'billed', 0]);
$insert->execute([2, 'S0196-2', 'sales', 'approved', 1]);
$insert->execute([3, 'E0196-1', 'estimate', 'draft', 0]);
$insert->execute([4, 'S0196-3', 'sales', 'void', 0]);
// 売上に引用済みの見積。
$pdo->exec("UPDATE vouchers SET source_estimate_no = 'E0196-1' WHERE id = 1");

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$port = 18196;
$process = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $pipes,
    $root
);
if (!is_resource($process)) throw new RuntimeException('PHPサーバーを起動できませんでした');

function requestJson(int $port, int $id, array $body): array {
    $context = stream_context_create(['http' => [
        'method' => 'PUT',
        'header' => "Content-Type: application/json\r\nConnection: close\r\n",
        'content' => json_encode($body, JSON_UNESCAPED_UNICODE),
        'ignore_errors' => true,
        'timeout' => 5,
    ]]);
    $raw = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/vouchers/$id", false, $context);
    return ['status' => $http_response_header[0] ?? '', 'body' => json_decode((string)$raw, true)];
}

function assertSameValue(mixed $expected, mixed $actual, string $message): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$message expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

function row(PDO $pdo, int $id): array {
    return $pdo->query("SELECT project_id, memo, status, updated_at FROM vouchers WHERE id = $id")->fetch();
}

$passed = 0;
try {
    $ready = false;
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) { $ready = true; break; }
    }
    if (!$ready) throw new RuntimeException('PHPサーバーが応答しません');

    $cases = [
        '1. status=billedでも案件だけ変更できる' => function () use ($pdo, $port): void {
            $response = requestJson($port, 1, ['project_id' => 2]);
            assertSameValue(true, str_contains($response['status'], '200'), 'HTTP 200');
            $after = row($pdo, 1);
            assertSameValue(2, (int)$after['project_id'], 'project_id');
            assertSameValue('変更前', $after['memo'], '他項目は不変');
            assertSameValue('billed', $after['status'], 'statusは不変');
            assertSameValue(true, $after['updated_at'] !== '2020-01-01 00:00:00', 'updated_atが進む');
        },
        '2. access_billed_flag=1でも案件だけ変更できる' => function () use ($pdo, $port): void {
            $response = requestJson($port, 2, ['project_id' => 2]);
            assertSameValue(true, str_contains($response['status'], '200'), 'HTTP 200');
            assertSameValue(2, (int)row($pdo, 2)['project_id'], 'project_id');
        },
        '3. 売上に引用済みの見積でも案件だけ変更できる' => function () use ($pdo, $port): void {
            $response = requestJson($port, 3, ['project_id' => 2]);
            assertSameValue(true, str_contains($response['status'], '200'), 'HTTP 200');
            assertSameValue(2, (int)row($pdo, 3)['project_id'], 'project_id');
        },
        '4. 請求済みに別項目も送ると409で何も変わらない' => function () use ($pdo, $port): void {
            $before = row($pdo, 2);
            $response = requestJson($port, 2, ['project_id' => 1, 'memo' => '変更後']);
            assertSameValue(true, str_contains($response['status'], '409'), 'HTTP 409');
            assertSameValue($before, row($pdo, 2), '伝票は不変');
        },
        '5. void済みは案件だけでも409' => function () use ($pdo, $port): void {
            $before = row($pdo, 4);
            $response = requestJson($port, 4, ['project_id' => 2]);
            assertSameValue(true, str_contains($response['status'], '409'), 'HTTP 409');
            assertSameValue($before, row($pdo, 4), '伝票は不変');
        },
    ];
    foreach ($cases as $name => $test) {
        $test();
        $passed++;
        echo "[OK] $name\n";
    }
} finally {
    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    proc_terminate($process);
    proc_close($process);
}

echo "$passed tests passed\n";
