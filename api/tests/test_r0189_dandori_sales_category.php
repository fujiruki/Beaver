<?php
/** R-0189: 段取り案件一覧の売上種別 */
declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_r0189_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0189.php';
$port = 18189;

register_shutdown_function(function () use ($dbPath, $bootstrap): void {
    @unlink($dbPath);
    @unlink($bootstrap);
});

$pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys = ON');
$pdo->exec(file_get_contents($root . '/schema.sql'));
foreach (glob($root . '/migrations/*.sql') as $migration) {
    foreach (explode(';', (string)file_get_contents($migration)) as $sql) {
        $sql = trim((string)preg_replace('/^\s*--.*$/m', '', $sql));
        if ($sql === '') continue;
        try { $pdo->exec($sql); } catch (Throwable $_) { }
    }
}

$pdo->exec("INSERT INTO customers (id, name) VALUES (1, 'R-0189得意先')");
$pdo->exec("INSERT INTO projects (id, project_code, customer_id, name, status) VALUES
    (1, 'R0189-1', 1, '最新種別確認', '進行中'),
    (2, 'R0189-2', 1, '種別なし確認', '進行中')");
$pdo->exec("INSERT OR REPLACE INTO sales_categories (id, name) VALUES (1, '地元建具'), (2, '地元家具'), (3, '県外家具')");
$pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, project_id, voucher_date, sales_category_id) VALUES
    ('E-R189-OLD', 'estimate', 'draft', 1, 1, '2026-01-01', 1),
    ('E-R189-VOID', 'estimate', 'void', 1, 1, '2026-12-31', 3),
    ('E-R189-NULL', 'estimate', 'draft', 1, 1, '2026-11-30', NULL),
    ('E-R189-NEW', 'estimate', 'draft', 1, 1, '2026-02-01', 2),
    ('E-R189-NONE', 'estimate', 'draft', 1, 2, '2026-03-01', NULL)");

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$proc = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $pipes,
    $root,
);
if (!is_resource($proc)) throw new RuntimeException('テストサーバーを起動できません');

function getJson(int $port, string $path): array {
    $raw = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, stream_context_create(['http' => [
        'ignore_errors' => true,
        'timeout' => 5,
        'header' => "Connection: close\r\n",
    ]]));
    return json_decode((string)$raw, true) ?? [];
}

function assertSameValue($expected, $actual, string $message): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$message expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

try {
    for ($i = 0; $i < 30; $i++) {
        usleep(100000);
        if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) break;
    }

    $projects = getJson($port, '/projects');
    $byId = [];
    foreach ($projects as $project) $byId[(int)$project['id']] = $project;
    assertSameValue(2, (int)$byId[1]['sales_category_id'], '最新の有効な種別あり伝票を採用する');
    assertSameValue(null, $byId[2]['sales_category_id'], '該当伝票がなければnullを返す');

    $sync = getJson($port, '/projects/sync?include_cancelled=true');
    assertSameValue(false, array_key_exists('sales_category_id', $sync['projects'][0]), '同期一覧の契約は変更しない');
    echo "R-0189 PHPテスト: PASS\n";
} finally {
    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    proc_terminate($proc);
    proc_close($proc);
}
