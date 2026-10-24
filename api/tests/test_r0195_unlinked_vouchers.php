<?php
/**
 * R-0195: 案件未割り当て伝票一覧の受け入れテスト
 *
 * 起動: php api/tests/test_r0195_unlinked_vouchers.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$testDbPath = __DIR__ . '/test_r0195_unlinked_vouchers_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) unlink($testDbPath);
register_shutdown_function(function () use ($testDbPath) {
    if (file_exists($testDbPath)) @unlink($testDbPath);
});

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');
$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $migration) {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($migration));
    foreach (explode(';', $sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '') continue;
        try { $pdo->exec($statement); } catch (Throwable $_) { /* 適用済み相当は無視 */ }
    }
}

$pdo->exec("INSERT INTO customers (id, name) VALUES (1, '山田建具'), (2, '佐藤工務店')");
$pdo->exec("INSERT INTO projects (id, customer_id, name, status) VALUES (1, 1, '割当済み案件', '進行中')");
$insert = $pdo->prepare('INSERT INTO vouchers
    (id, voucher_no, voucher_type, status, project_id, customer_id, voucher_date, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
$insert->execute([101, 'E0195-1', 'estimate', 'draft', null, 1, '2026-10-23', '古い摘要']);
$insert->execute([102, 'S0195-1', 'sales', 'approved', null, 2, '2026-10-24', '新しい摘要A']);
$insert->execute([103, 'E0195-2', 'estimate', 'draft', null, null, '2026-10-24', '新しい摘要B']);
$insert->execute([104, 'E0195-V', 'estimate', 'void', null, 1, '2026-10-25', '取消済み']);
$insert->execute([105, 'E0195-P', 'estimate', 'draft', 1, 1, '2026-10-26', '割当済み']);

$bootstrap = __DIR__ . '/_r0195_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");
$port = 18195;
$serverProc = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $ROOT, $ROOT . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $serverPipes,
    $ROOT
);
if (!is_resource($serverProc)) {
    @unlink($bootstrap);
    throw new RuntimeException('php ビルトインサーバを起動できませんでした');
}

$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) {
        $ready = true;
        break;
    }
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');
    $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/vouchers?no_project=1");
    $rows = json_decode($body, true, 512, JSON_THROW_ON_ERROR);

    if (array_column($rows, 'id') !== [103, 102, 101]) {
        throw new RuntimeException('案件なし・void除外・日付DESC/id DESCの順になっていません: ' . json_encode(array_column($rows, 'id')));
    }
    if (($rows[1]['customer_name'] ?? null) !== '佐藤工務店') {
        throw new RuntimeException('得意先名が応答に含まれていません');
    }
    if (($rows[1]['description'] ?? null) !== '新しい摘要A') {
        throw new RuntimeException('摘要が応答に含まれていません');
    }
    echo "[OK] 受入条件1: 案件なし・void以外を日付/id降順で返し、得意先名と摘要を含む\n";
} finally {
    foreach ($serverPipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    proc_terminate($serverProc);
    proc_close($serverProc);
    @unlink($bootstrap);
}

exit(0);
