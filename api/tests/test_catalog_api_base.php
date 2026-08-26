<?php
/** 起動: php api/tests/test_catalog_api_base.php */
declare(strict_types=1);

$root = dirname(__DIR__);
$dbPath = __DIR__ . '/test_catalog_api_base_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_catalog_bootstrap.php';
$stubPort = 18121;
$beaverPort = 18120;

register_shutdown_function(function () use ($dbPath, $bootstrap): void {
    @unlink($dbPath);
    @unlink($bootstrap);
});

$pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec(file_get_contents($root . '/schema.sql'));
foreach (glob($root . '/migrations/*.sql') as $migration) {
    foreach (explode(';', (string)file_get_contents($migration)) as $sql) {
        $sql = trim((string)preg_replace('/^\s*--.*$/m', '', $sql));
        if ($sql === '') continue;
        try { $pdo->exec($sql); } catch (Throwable $_) { }
    }
}
$seededCategories = $pdo->query('SELECT code, name, measure_type, sort_order, is_active, synced_at FROM aggregation_category_master ORDER BY sort_order')->fetchAll(PDO::FETCH_ASSOC);
$expectedCategories = [
    ['code' => 'MAIN', 'name' => '本体', 'measure_type' => 'money', 'sort_order' => 1, 'is_active' => 1, 'synced_at' => null],
    ['code' => 'HARDWARE', 'name' => '金物', 'measure_type' => 'money', 'sort_order' => 2, 'is_active' => 1, 'synced_at' => null],
    ['code' => 'GLASS', 'name' => 'ガラス', 'measure_type' => 'money', 'sort_order' => 3, 'is_active' => 1, 'synced_at' => null],
    ['code' => 'FACTORY_TIME', 'name' => '工場時間', 'measure_type' => 'time', 'sort_order' => 4, 'is_active' => 1, 'synced_at' => null],
    ['code' => 'SITE_TIME', 'name' => '現場時間', 'measure_type' => 'time', 'sort_order' => 5, 'is_active' => 1, 'synced_at' => null],
];
if ($seededCategories !== $expectedCategories) {
    throw new RuntimeException('migration 027の集計区分シードが仕様と一致しません');
}
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\ndefine('CATALOG_API_BASE', 'http://127.0.0.1:$stubPort/custom-api');\n");

function startCatalogTestServer(array $command, string $cwd): array {
    $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']], $pipes, $cwd);
    if (!is_resource($process)) throw new RuntimeException('テストサーバーを起動できません');
    return [$process, $pipes];
}

function stopCatalogTestServer(&$process, array $pipes): void {
    if (!is_resource($process)) return;
    foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
    proc_terminate($process);
    proc_close($process);
    $process = null;
}

function waitCatalogTestServer(string $url): bool {
    for ($i = 0; $i < 30; $i++) {
        usleep(100000);
        if (@file_get_contents($url) !== false) return true;
    }
    return false;
}

function catalogRequest(int $port, string $method, string $path): array {
    $context = stream_context_create(['http' => ['method' => $method, 'ignore_errors' => true, 'timeout' => 5]]);
    $body = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $context);
    return json_decode((string)$body, true) ?? [];
}

[$stubProcess, $stubPipes] = startCatalogTestServer(['php', '-S', "127.0.0.1:$stubPort", __DIR__ . '/_catalog_stub.php'], __DIR__);
[$beaverProcess, $beaverPipes] = startCatalogTestServer(['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$beaverPort", '-t', $root, $root . '/index.php'], $root);

try {
    if (!waitCatalogTestServer("http://127.0.0.1:$stubPort/ready")) throw new RuntimeException('catalogスタブが応答しません');
    if (!waitCatalogTestServer("http://127.0.0.1:$beaverPort/contents/Beaver/api/health")) throw new RuntimeException('Beaverサーバーが応答しません');

    $proxy = catalogRequest($beaverPort, 'GET', '/catalog-proxy/items');
    if (($proxy['requested_path'] ?? null) !== '/custom-api/items') {
        throw new RuntimeException('catalog-proxyがCATALOG_API_BASEを使用していません');
    }

    $sync = catalogRequest($beaverPort, 'POST', '/aggregation-categories/sync');
    $factoryTime = null;
    foreach ($sync['categories'] ?? [] as $category) {
        if (($category['code'] ?? null) === 'FACTORY_TIME') $factoryTime = $category;
    }
    if (($factoryTime['measure_type'] ?? null) !== 'time' || empty($factoryTime['synced_at'])) {
        throw new RuntimeException('aggregation-categories同期がCATALOG_API_BASEを使用していません');
    }

    echo "集計区分・CATALOG_API_BASEテスト: 3 PASS / 0 FAIL\n";
} finally {
    stopCatalogTestServer($beaverProcess, $beaverPipes);
    stopCatalogTestServer($stubProcess, $stubPipes);
}
