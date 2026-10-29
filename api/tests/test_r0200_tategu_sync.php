<?php
/**
 * R-0200 (C) 製品台帳の同期（Beaver側）API テスト
 *
 * 起動: php api/tests/test_r0200_tategu_sync.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$pid = getmypid();
$dbPath = __DIR__ . "/test_r0200_tategu_sync_$pid.sqlite";
$bootstrap = __DIR__ . "/_r0200_tategu_sync_bootstrap_$pid.php";
$bootstrapGate = __DIR__ . "/_r0200_tategu_sync_gate_bootstrap_$pid.php";
$createdDirs = [];
$procs = [];

function removeTree(string $dir): void {
    if (!is_dir($dir)) return;
    foreach (glob($dir . '/*') ?: [] as $f) { is_dir($f) ? removeTree($f) : @unlink($f); }
    @rmdir($dir);
}

register_shutdown_function(function () use ($dbPath, $bootstrap, $bootstrapGate, &$createdDirs, &$procs) {
    foreach ($procs as $p) {
        if (!is_resource($p)) continue;
        $st = proc_get_status($p);
        @proc_terminate($p);
        if (!empty($st['pid'])) @exec('taskkill /F /T /PID ' . (int)$st['pid'] . ' 2>NUL');
        @proc_close($p);
    }
    foreach ([$dbPath, $dbPath . '-shm', $dbPath . '-wal', $bootstrap, $bootstrapGate] as $f) @unlink($f);
    foreach ($createdDirs as $d) removeTree($d);
});

$pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');
$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $m) {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($m));
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}
$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0)");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('sales', 0)");

$passed = 0; $failed = 0;
function runTest(string $name, callable $fn): void {
    global $passed, $failed;
    try { $fn(); echo "  [OK] $name\n"; $passed++; }
    catch (Throwable $e) { echo "  [NG] $name :: " . $e->getMessage() . "\n"; $failed++; }
}
function assertEq($expected, $actual, string $label = ''): void {
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf('%s expected=%s actual=%s', $label, var_export($expected, true), var_export($actual, true)));
    }
}
function assertTrue($cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}
function assertStatus(int $code, array $r): void {
    assertTrue(str_contains($r['status'], (string)$code), "HTTP $code expected: {$r['status']} body=" . substr($r['raw'], 0, 300));
}

function http(int $port, string $method, string $path, ?string $body = null, array $headers = []): array {
    $ctx = stream_context_create(['http' => [
        'method' => $method,
        'header' => "Connection: close\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers)),
        'content' => $body ?? '',
        'timeout' => 10,
        'ignore_errors' => true,
    ]]);
    $raw = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    $hdr = $http_response_header ?? [];
    return ['status' => $hdr[0] ?? '', 'raw' => (string)$raw, 'body' => json_decode((string)$raw, true)];
}
function jsonReq(int $port, string $method, string $path, ?array $data = null, array $headers = []): array {
    $headers[] = 'Content-Type: application/json';
    return http($port, $method, $path, $data === null ? null : json_encode($data, JSON_UNESCAPED_UNICODE), $headers);
}
function uploadReq(int $port, string $path, string $content, string $filename = 'a.png'): array {
    $b = 'XBOUNDARYX';
    $body = "--$b\r\nContent-Disposition: form-data; name=\"file\"; filename=\"$filename\"\r\nContent-Type: application/octet-stream\r\n\r\n$content\r\n--$b--\r\n";
    return http($port, 'POST', $path, $body, ["Content-Type: multipart/form-data; boundary=$b"]);
}

function startServer(string $root, string $bootstrap, int $port, array &$procs): void {
    $proc = proc_open(
        ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-d', 'upload_max_filesize=20M', '-d', 'post_max_size=24M',
         '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
        $pipes, $root
    );
    if (!is_resource($proc)) throw new RuntimeException('サーバを起動できません');
    $procs[] = $proc;
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
        if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx) !== false) return;
    }
    throw new RuntimeException('サーバが応答しません');
}

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
file_put_contents($bootstrapGate, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPath, true) . ");\n"
    . "define('AUTH_DRIVER', 'shared');\n"
    . "define('SYNC_TOKEN_REQUIRED', true);\n"
    . "define('SYNC_API_TOKEN', 'unit-test-sync-token');\n"
    . "require_once dirname(__DIR__) . '/auth_client.php';\n"
    . "auth_configure(['verifier' => fn(string \$t): ?array => ['id' => 1, 'name' => 'テスト']]);\n");

$PNG = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
$JPEG = "\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xFF\xD9";

function cost(string $cat, string $name, int $unit, string $source = 'manual'): array {
    return ['category_code' => $cat, 'name' => $name, 'quantity' => 1, 'unit_cost' => $unit, 'amount' => $unit, 'source' => $source];
}
function newProduct(PDO $pdo, string $code): int {
    $pdo->prepare("INSERT INTO tategu_items (code, name, status) VALUES (?, '台帳', 'active')")->execute([$code]);
    return (int)$pdo->lastInsertId();
}

try {
    $port = 18110; $gatePort = 18111;
    startServer($ROOT, $bootstrap, $port, $procs);
    startServer($ROOT, $bootstrapGate, $gatePort, $procs);

    echo "=== R-0200 (C) 製品台帳の同期 ===\n";

    runTest('POST /tategu-items は code が空なら NULL のまま作る（採番しない）', function () use ($port, $pdo) {
        newProduct($pdo, '00500');
        $r = jsonReq($port, 'POST', '/tategu-items', ['name' => '採番待ち', 'code' => '']);
        assertStatus(201, $r);
        assertTrue(array_key_exists('code', $r['body']), 'code キーあり');
        assertEq(null, $r['body']['code'], 'code');
        $r2 = jsonReq($port, 'POST', '/tategu-items', ['name' => '採番待ち2']);
        assertStatus(201, $r2);
        assertEq(null, $r2['body']['code'], 'code 2件目（NULL重複可）');
    });

    runTest('GET /tategu-items/sync は明細行・労務行・drawing_sha256 込みで since より新しいものだけ返す', function () use ($port, $pdo) {
        $id = newProduct($pdo, '00601');
        $pdo->exec("UPDATE tategu_items SET drawing_sha256 = 'abc', updated_at = '2026-10-01 00:00:00' WHERE id = $id");
        $pdo->exec("INSERT INTO tategu_item_cost_lines (tategu_item_id, category_code, name, quantity, unit_cost, amount, source, sort_order) VALUES ($id, 'MAIN', '材', 1, 100, 100, 'manual', 0)");
        $pdo->exec("INSERT INTO tategu_item_labor_lines (tategu_item_id, process_name, category_code, work_hours, labor_rate, amount, sort_order) VALUES ($id, '製作', 'FACTORY_TIME', 2, 3000, 6000, 0)");
        $r = jsonReq($port, 'GET', '/tategu-items/sync?since=' . rawurlencode('2026-09-30 00:00:00') . '&limit=500');
        assertStatus(200, $r);
        $hit = null;
        foreach ($r['body']['data'] as $row) if ((int)$row['id'] === $id) $hit = $row;
        assertTrue($hit !== null, '対象の台帳が含まれる');
        assertEq('abc', $hit['drawing_sha256'], 'drawing_sha256');
        assertEq('材', $hit['cost_lines'][0]['name'] ?? null, 'cost_lines');
        assertEq('FACTORY_TIME', $hit['labor_lines'][0]['category_code'] ?? null, 'labor_lines');
        $r2 = jsonReq($port, 'GET', '/tategu-items/sync?since=' . rawurlencode('2099-01-01 00:00:00'));
        assertEq([], $r2['body']['data'], 'since が未来なら空');
    });

    runTest('POST /tategu-items/sync は code 必須。同じ code なら作らず既存を返す', function () use ($port, $pdo) {
        $r = jsonReq($port, 'POST', '/tategu-items/sync', ['name' => 'code無し']);
        assertStatus(400, $r);
        assertEq('code_required', $r['body']['error'] ?? null, 'error');

        $r = jsonReq($port, 'POST', '/tategu-items/sync', ['code' => 701, 'name' => '新規', 'cost_lines' => [cost('MAIN', '材A', 500)]]);
        assertStatus(201, $r);
        assertEq('00701', $r['body']['code'], 'code 5桁');
        assertEq(1, count($r['body']['cost_lines']), '明細');
        $id = $r['body']['id'];

        $r2 = jsonReq($port, 'POST', '/tategu-items/sync', ['code' => '00701', 'name' => '別名']);
        assertStatus(200, $r2);
        assertEq($id, $r2['body']['id'], '既存を返す');
        assertEq('新規', $r2['body']['name'], '上書きしない');
        assertEq(1, (int)$pdo->query("SELECT COUNT(*) FROM tategu_items WHERE CAST(code AS INTEGER) = 701")->fetchColumn(), '1件のまま');
    });

    runTest('PUT /tategu-items/{id}/sync は base_synced_at が古ければ何も書かず409 product_conflict', function () use ($port, $pdo) {
        $id = newProduct($pdo, '00801');
        $pdo->exec("UPDATE tategu_items SET updated_at = '2026-10-10 00:00:00' WHERE id = $id");
        // updated_at は UTC なので JST 2026-10-10 09:00。それより古い base で衝突させる
        $r = jsonReq($port, 'PUT', "/tategu-items/$id/sync", ['name' => '書き換え', 'base_synced_at' => '2026-10-10 08:59:00', 'cost_lines' => [cost('MAIN', '材', 1)]]);
        assertStatus(409, $r);
        assertEq('product_conflict', $r['body']['error'] ?? null, 'error');
        assertEq('台帳', $pdo->query("SELECT name FROM tategu_items WHERE id = $id")->fetchColumn(), 'name は変わらない');
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_item_cost_lines WHERE tategu_item_id = $id")->fetchColumn(), '明細は書かれない');
    });

    runTest('PUT /tategu-items/{id}/sync は base_synced_at が新しければ書いて updated_at を返す', function () use ($port, $pdo) {
        $id = newProduct($pdo, '00802');
        $pdo->exec("UPDATE tategu_items SET updated_at = '2026-10-10 00:00:00' WHERE id = $id");
        $r = jsonReq($port, 'PUT', "/tategu-items/$id/sync", [
            'name' => 'Access更新', 'description' => '備考', 'status' => 'archived', 'base_synced_at' => '2026-10-11 00:00:00',
            'cost_lines' => [cost('MAIN', '材B', 900), cost('GLASS', 'ガラス', 100)],
            'labor_lines' => [['process_name' => '製作', 'category_code' => 'FACTORY_TIME', 'work_hours' => 1.5, 'labor_rate' => 4000]],
        ]);
        assertStatus(200, $r);
        assertTrue(!empty($r['body']['updated_at']) && $r['body']['updated_at'] > '2026-10-11', 'updated_at が返る: ' . ($r['body']['updated_at'] ?? ''));
        $row = $pdo->query("SELECT name, status, cost_body, cost_glass, cost_factory_hours FROM tategu_items WHERE id = $id")->fetch();
        assertEq('Access更新', $row['name'], 'name');
        assertEq('archived', $row['status'], 'status');
        assertEq(900.0, (float)$row['cost_body'], 'cost_body 再計算');
        assertEq(100.0, (float)$row['cost_glass'], 'cost_glass 再計算');
        assertEq(1.5, (float)$row['cost_factory_hours'], 'cost_factory_hours');
    });

    runTest('PUT /tategu-items/{id}/sync は小数の unit_cost を400で拒否し既存行を変えない', function () use ($port, $pdo) {
        $id = newProduct($pdo, '00803');
        $r = jsonReq($port, 'PUT', "/tategu-items/$id/sync", ['name' => 'x', 'base_synced_at' => '2099-01-01 00:00:00', 'cost_lines' => [cost('MAIN', '材', 1)]]);
        assertStatus(200, $r);
        $bad = cost('MAIN', '小数', 1); $bad['unit_cost'] = 10.5;
        $r = jsonReq($port, 'PUT', "/tategu-items/$id/sync", ['name' => 'y', 'base_synced_at' => '2099-01-01 00:00:00', 'cost_lines' => [$bad]]);
        assertStatus(400, $r);
        assertEq('材', $pdo->query("SELECT name FROM tategu_item_cost_lines WHERE tategu_item_id = $id")->fetchColumn(), '既存行');
    });

    runTest('POST /tategu-items/sync/bulk は code で上書き・追加し、501件以上は拒否する', function () use ($port, $pdo) {
        $existing = newProduct($pdo, '00901');
        $r = jsonReq($port, 'POST', '/tategu-items/sync/bulk', ['items' => [
            ['code' => '901', 'name' => '上書き', 'cost_lines' => [cost('MAIN', '材', 10)]],
            ['code' => '902', 'name' => '追加'],
        ]]);
        assertStatus(200, $r);
        assertEq('上書き', $pdo->query("SELECT name FROM tategu_items WHERE id = $existing")->fetchColumn(), '上書き');
        assertEq('追加', $pdo->query("SELECT name FROM tategu_items WHERE CAST(code AS INTEGER) = 902")->fetchColumn(), '追加');

        $many = [];
        for ($i = 1; $i <= 501; $i++) $many[] = ['code' => 90000 + $i, 'name' => "n$i"];
        $r = jsonReq($port, 'POST', '/tategu-items/sync/bulk', ['items' => $many]);
        assertStatus(400, $r);
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_items WHERE CAST(code AS INTEGER) > 90000")->fetchColumn(), '1件も入らない');
    });

    runTest('PATCH /tategu-items/{id}/access-link は code が空なら入れ、別の code があれば409', function () use ($port, $pdo) {
        $pdo->exec("INSERT INTO tategu_items (name) VALUES ('番号待ち')");
        $id = (int)$pdo->lastInsertId();
        $r = jsonReq($port, 'PATCH', "/tategu-items/$id/access-link", ['code' => 1001]);
        assertStatus(200, $r);
        assertEq('01001', $r['body']['code'], 'code');
        assertStatus(200, jsonReq($port, 'PATCH', "/tategu-items/$id/access-link", ['code' => '01001']));
        assertStatus(409, jsonReq($port, 'PATCH', "/tategu-items/$id/access-link", ['code' => 1002]));
        assertEq('01001', $pdo->query("SELECT code FROM tategu_items WHERE id = $id")->fetchColumn(), 'code は変わらない');
        $other = newProduct($pdo, '01003');
        assertStatus(409, jsonReq($port, 'PATCH', "/tategu-items/$other/access-link", ['code' => 1001]));
    });

    echo "\n=== 製品図 ===\n";

    runTest('製品図: JPEG・PNG を受け、uploads/tategu/{id}/ に置き、GETで返し、DELETEで消す', function () use ($port, $pdo, $PNG, $JPEG, $ROOT, &$createdDirs) {
        $id = newProduct($pdo, '01101');
        $dir = $ROOT . "/uploads/tategu/$id";
        $createdDirs[] = $dir;
        $pdo->exec("UPDATE tategu_items SET updated_at = '2020-01-01 00:00:00' WHERE id = $id");

        assertStatus(200, uploadReq($port, "/tategu-items/$id/drawing", $PNG));
        $name = $pdo->query("SELECT building_image_path FROM tategu_items WHERE id = $id")->fetchColumn();
        assertTrue($name && is_file("$dir/$name"), 'ファイルが置かれる');
        assertEq(hash('sha256', $PNG), $pdo->query("SELECT drawing_sha256 FROM tategu_items WHERE id = $id")->fetchColumn(), 'drawing_sha256');
        assertTrue($pdo->query("SELECT updated_at FROM tategu_items WHERE id = $id")->fetchColumn() > '2020-01-01 00:00:00', 'updated_at 更新');

        $g = http($port, 'GET', "/tategu-items/$id/drawing");
        assertStatus(200, $g);
        assertEq($PNG, $g['raw'], 'GET の中身');

        assertStatus(200, uploadReq($port, "/tategu-items/$id/drawing", $JPEG, 'b.jpg'));
        assertEq(1, count(glob("$dir/*")), '古いファイルは消える');
        assertEq(hash('sha256', $JPEG), $pdo->query("SELECT drawing_sha256 FROM tategu_items WHERE id = $id")->fetchColumn(), 'JPEGのハッシュ');

        assertStatus(200, http($port, 'DELETE', "/tategu-items/$id/drawing"));
        assertEq(0, count(glob("$dir/*")), 'ファイルが消える');
        $row = $pdo->query("SELECT building_image_path, drawing_sha256 FROM tategu_items WHERE id = $id")->fetch();
        assertEq(null, $row['building_image_path'], 'path NULL');
        assertEq(null, $row['drawing_sha256'], 'sha NULL');
        assertStatus(404, http($port, 'GET', "/tategu-items/$id/drawing"));
    });

    runTest('製品図: JPEG・PNG 以外の中身と 10MB 超は拒否する（拡張子は見ない）', function () use ($port, $pdo, $PNG, $ROOT, &$createdDirs) {
        $id = newProduct($pdo, '01102');
        $createdDirs[] = $ROOT . "/uploads/tategu/$id";
        assertStatus(400, uploadReq($port, "/tategu-items/$id/drawing", "GIF89a" . str_repeat("\0", 20), 'a.png'));
        assertStatus(400, uploadReq($port, "/tategu-items/$id/drawing", "<?php echo 1;", 'a.png'));
        assertStatus(400, uploadReq($port, "/tategu-items/$id/drawing", $PNG . str_repeat("\0", 10 * 1024 * 1024), 'big.png'));
        assertEq(null, $pdo->query("SELECT building_image_path FROM tategu_items WHERE id = $id")->fetchColumn(), '何も保存されない');
    });

    runTest('uploads/tategu/.htaccess は Require all denied', function () use ($ROOT) {
        $f = $ROOT . '/uploads/tategu/.htaccess';
        assertTrue(is_file($f), '.htaccess がある');
        assertTrue(str_contains((string)file_get_contents($f), 'Require all denied'), 'Require all denied');
    });

    runTest('円未満の unit_cost は PUT cost-lines でも 400', function () use ($port, $pdo) {
        $id = newProduct($pdo, '01201');
        $bad = cost('MAIN', '小数', 1); $bad['unit_cost'] = 1.5;
        assertStatus(400, jsonReq($port, 'PUT', "/tategu-items/$id/cost-lines", ['lines' => [$bad]]));
    });

    runTest('GET /sync/changes に tategu_items の件数が入る', function () use ($port, $pdo) {
        $pdo->exec("UPDATE tategu_items SET updated_at = '2026-10-20 00:00:00' WHERE id = (SELECT MIN(id) FROM tategu_items)");
        $r = jsonReq($port, 'GET', '/sync/changes?since=' . rawurlencode('2026-10-19 00:00:00'));
        assertStatus(200, $r);
        assertTrue(($r['body']['tategu_items'] ?? 0) >= 1, 'tategu_items 件数: ' . $r['raw']);
        $r = jsonReq($port, 'GET', '/sync/changes?since=' . rawurlencode('2099-01-01 00:00:00'));
        assertEq(0, $r['body']['tategu_items'] ?? null, '未来は0');
    });

    runTest('GET /sync/changes の tategu_items は Access から届いた変更を数えず、画面の更新は数える', function () use ($port, $pdo) {
        $since = rawurlencode('2020-01-01 00:00:00');
        $count = fn() => jsonReq($port, 'GET', '/sync/changes?since=' . $since)['body']['tategu_items'] ?? null;
        $reset = fn() => $pdo->exec("UPDATE tategu_items SET updated_at = '2000-01-01 00:00:00'");

        $reset();
        $r = jsonReq($port, 'POST', '/tategu-items/sync', ['code' => 1501, 'name' => 'A新規']);
        assertStatus(201, $r);
        $id = (int)$r['body']['id'];
        assertEq(0, $count(), 'POST sync');

        $reset();
        $r = jsonReq($port, 'PUT', "/tategu-items/$id/sync", ['name' => 'A更新', 'base_synced_at' => '2099-01-01 00:00:00']);
        assertStatus(200, $r);
        assertEq(0, $count(), 'PUT sync');

        $reset();
        assertStatus(200, jsonReq($port, 'POST', '/tategu-items/sync/bulk', ['items' => [['code' => 1501, 'name' => 'A一括']]]));
        assertEq(0, $count(), 'POST sync/bulk');

        $reset();
        assertStatus(200, jsonReq($port, 'PATCH', "/tategu-items/$id/access-link", ['code' => 1501]));
        assertEq(0, $count(), 'PATCH access-link');

        $reset();
        assertStatus(200, jsonReq($port, 'PUT', "/tategu-items/$id", ['name' => '画面更新']));
        assertEq(1, $count(), '画面からの更新');
    });

    echo "\n=== 伝票の同期 ===\n";

    $voucher = fn(int $no, array $lines) => [
        'access_voucher_id' => $no, 'voucher_type' => 'estimate', 'customer_access_no' => '',
        'voucher_date' => '2026-10-01', 'total_amount' => 1000, 'lines' => $lines,
    ];
    $line = fn(int $accessLineId, array $extra = []) => array_merge([
        'access_line_id' => $accessLineId, 'line_no' => 1, 'item_name' => '框', 'quantity' => 1,
        'price_body' => 1000, 'price_hardware' => 0, 'price_glass' => 0, 'line_total' => 1000, 'tax_category' => '課税',
    ], $extra);
    $findLine = function (array $body, int $voucherNo): array {
        foreach ($body['vouchers'] as $v) if ((int)$v['access_voucher_id'] === $voucherNo) return $v['lines'][0];
        throw new RuntimeException("伝票 $voucherNo が無い");
    };

    runTest('伝票同期: tategu_code を tategu_item_id に変換し、GET で両方出る', function () use ($port, $pdo, $voucher, $line, $findLine) {
        $id = newProduct($pdo, '01301');
        assertStatus(200, jsonReq($port, 'POST', '/vouchers/sync', $voucher(50001, [$line(1, ['tategu_code' => '1301'])])));
        $got = $findLine(jsonReq($port, 'GET', '/vouchers/sync?limit=500')['body'], 50001);
        assertEq($id, (int)$got['tategu_item_id'], 'tategu_item_id');
        assertEq('01301', $got['tategu_code'], 'tategu_code');
    });

    runTest('伝票同期: 引けない tategu_code は伝票を書かず409 product_missing', function () use ($port, $pdo, $voucher, $line) {
        $r = jsonReq($port, 'POST', '/vouchers/sync', $voucher(50002, [$line(1, ['tategu_code' => '9999'])]));
        assertStatus(409, $r);
        assertEq('product_missing', $r['body']['error'] ?? null, 'error');
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM vouchers WHERE access_voucher_id = 50002")->fetchColumn(), '伝票は書かれない');
    });

    runTest('伝票同期: tategu_code のキーが無い再送では今の tategu_item_id を残す', function () use ($port, $pdo, $voucher, $line, $findLine) {
        $id = newProduct($pdo, '01302');
        jsonReq($port, 'POST', '/vouchers/sync', $voucher(50003, [$line(1, ['tategu_code' => '1302'])]));
        assertStatus(200, jsonReq($port, 'POST', '/vouchers/sync', array_merge($voucher(50003, [$line(1, ['item_name' => '框2'])]), ['base_synced_at' => '2099-01-01 00:00:00'])));
        $got = $findLine(jsonReq($port, 'GET', '/vouchers/sync?limit=500')['body'], 50003);
        assertEq('框2', $got['item_name'], '他の項目は更新される');
        assertEq($id, (int)$got['tategu_item_id'], 'tategu_item_id が残る');
    });

    echo "\n=== 認証（同期トークン） ===\n";

    runTest('同期窓口は同期トークンで通り、無ければ401', function () use ($gatePort, $pdo) {
        $id = newProduct($pdo, '01401');
        $tok = ['Authorization: Bearer unit-test-sync-token'];
        $cases = [
            ['GET', '/tategu-items/sync', null],
            ['POST', '/tategu-items/sync', ['code' => 1402, 'name' => 'x']],
            ['POST', '/tategu-items/sync/bulk', ['items' => []]],
            ['PUT', "/tategu-items/$id/sync", ['name' => 'x', 'base_synced_at' => '2099-01-01 00:00:00']],
            ['PATCH', "/tategu-items/$id/access-link", ['code' => 1403]],
            ['GET', "/tategu-items/$id/drawing", null],
        ];
        foreach ($cases as [$m, $p, $b]) {
            assertStatus(401, jsonReq($gatePort, $m, $p, $b));
            $ok = jsonReq($gatePort, $m, $p, $b, $tok);
            assertTrue(!str_contains($ok['status'], '401'), "$m $p トークン付きで401: " . $ok['raw']);
        }
    });

    runTest('製品台帳の通常API（GET /tategu-items）は同期トークンだけでは通らない', function () use ($gatePort) {
        assertStatus(401, jsonReq($gatePort, 'GET', '/tategu-items', null, ['Authorization: Bearer unit-test-sync-token']));
    });
} catch (Throwable $e) {
    echo "FATAL: " . $e->getMessage() . "\n";
    $failed++;
}

echo "\n========================================\nPASSED: $passed\nFAILED: $failed\n";
exit($failed > 0 ? 1 : 0);
