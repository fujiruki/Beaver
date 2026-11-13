<?php
/**
 * R-0268 木材原価の同期（Beaver 第1段階）テスト
 *
 * 起動: php api/tests/test_r0268_wood_sync.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$pid = getmypid();
$dbPath = __DIR__ . "/test_r0268_wood_sync_$pid.sqlite";
$bootstrap = __DIR__ . "/_r0268_wood_sync_bootstrap_$pid.php";
$bootstrapGate = __DIR__ . "/_r0268_wood_sync_gate_bootstrap_$pid.php";
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


function uid(int $n): string { return sprintf('00000000-0000-4000-8000-%012d', $n); }
function newProduct(PDO $pdo, string $code): int {
    $pdo->prepare("INSERT INTO tategu_items (code, name, status) VALUES (?, '台帳', 'active')")->execute([$code]);
    return (int)$pdo->lastInsertId();
}
function wline(string $usage = '框', float $qty = 2): array {
    return ['usage' => $usage, 'mitsuke_mm' => 45, 'mikomi_mm' => 30, 'length_mm' => 1800, 'qty' => $qty, 'margin_mm' => 3,
        'tateds_part_key' => null, 'sort_order' => 0];
}
function wset(string $uid, string $part = '本体', ?array $lines = null, array $extra = []): array {
    return array_merge([
        'uid' => $uid, 'part_name' => $part, 'species_access_id' => 2, 'species_name' => '杉',
        'unit_price_man' => 60, 'length_allowance_mm' => 100, 'amount' => 11084, 'sort_order' => 0,
        'tateds_design_id' => null, 'tateds_revision' => null, 'tateds_imported_lines' => null,
        'lines' => $lines ?? [wline()],
    ], $extra);
}
function wcost(string $uid, int $unit = 11084, float $qty = 2, ?int $amount = null): array {
    return ['category_code' => 'MAIN', 'name' => '本体　杉', 'quantity' => $qty, 'unit_cost' => $unit,
        'amount' => $amount ?? (int)($unit * $qty), 'source' => 'wood_calc', 'wood_set_uid' => $uid, 'sort_order' => 0];
}
function putSync(int $port, int $id, array $body): array {
    return jsonReq($port, 'PUT', "/tategu-items/$id/sync", array_merge(['name' => '台帳', 'base_synced_at' => '2099-01-01 00:00:00'], $body));
}
function countSets(PDO $pdo, int $id): int {
    return (int)$pdo->query("SELECT COUNT(*) FROM tategu_wood_sets WHERE tategu_item_id = $id")->fetchColumn();
}
function countLines(PDO $pdo): int {
    return (int)$pdo->query('SELECT COUNT(*) FROM tategu_wood_lines')->fetchColumn();
}
function findSync(int $port, int $id): ?array {
    $g = jsonReq($port, 'GET', '/tategu-items/sync?since=' . rawurlencode('2000-01-01 00:00:00') . '&limit=500');
    foreach ($g['body']['data'] ?? [] as $x) if ((int)$x['id'] === $id) return $x;
    return null;
}

try {
    $port = 18120; $gatePort = 18121;
    startServer($ROOT, $bootstrap, $port, $procs);
    startServer($ROOT, $bootstrapGate, $gatePort, $procs);

    echo "=== R-0268 木材の部位の同期 ===\n";

    runTest('POST sync で部位・明細・wood_set_uid を保存し、GET の JSON は決まった並びで返る', function () use ($port, $pdo) {
        $r = jsonReq($port, 'POST', '/tategu-items/sync', ['code' => 2601, 'name' => '片引格子戸',
            'cost_lines' => [wcost(uid(1))], 'labor_lines' => [], 'wood_sets' => [wset(uid(1))]]);
        assertStatus(201, $r);
        $row = findSync($port, (int)$r['body']['id']);
        assertTrue($row !== null, '台帳が返る');
        $keys = array_keys($row);
        assertTrue(!in_array('tateds_design_json', $keys, true), 'tateds_design_json は出さない');
        assertTrue(in_array('design_sha256', $keys, true), 'design_sha256');
        assertTrue(array_search('design_sha256', $keys) < array_search('cost_lines', $keys), 'design_sha256 は cost_lines より前');
        assertEq('wood_sets', end($keys), 'wood_sets は最後');
        assertTrue(array_search('labor_lines', $keys) < array_search('wood_sets', $keys), 'wood_sets は labor_lines より後');
        assertEq(uid(1), $row['cost_lines'][0]['wood_set_uid'], 'wood_set_uid');
        $s = $row['wood_sets'][0];
        assertEq(uid(1), $s['uid'], 'uid');
        assertEq('本体', $s['part_name'], 'part_name');
        assertEq(11084, $s['amount'], 'amount');
        assertEq(60.0, (float)$s['unit_price_man'], 'unit_price_man');
        assertEq(2, $s['species_access_id'], 'species_access_id');
        assertEq(1, count($s['lines']), '明細');
        assertEq('框', $s['lines'][0]['usage'], 'usage');
        assertEq(1800.0, (float)$s['lines'][0]['length_mm'], 'length_mm');
        assertTrue(!array_key_exists('species_id', $s['lines'][0]), '明細に樹種は持たない');
    });

    runTest('wood_sets のキーが無い PUT（今の Access）では部位と明細が残る', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02602');
        assertStatus(200, putSync($port, $id, ['cost_lines' => [wcost(uid(2))], 'wood_sets' => [wset(uid(2))]]));
        $lines = countLines($pdo);
        $r = putSync($port, $id, ['name' => '改名', 'cost_lines' => [wcost(uid(2))]]);
        assertStatus(200, $r);
        assertEq(1, countSets($pdo, $id), '部位が残る');
        assertEq($lines, countLines($pdo), '明細が残る');
        assertEq(1, count($r['body']['wood_sets']), '応答にも出る');
        $r = putSync($port, $id, ['cost_lines' => [['category_code' => 'MAIN', 'name' => '手', 'quantity' => 1, 'unit_cost' => 5, 'amount' => 5, 'source' => 'wood_calc']]]);
        assertStatus(200, $r);
        assertEq(null, $r['body']['cost_lines'][0]['wood_set_uid'], 'uid が null の wood_calc は今までの行として受ける');
        assertEq(1, countSets($pdo, $id), '部位はまだ残る');
    });

    runTest('uid で突き合わせる: 書き換え・追加・来なかった部位の削除・明細の全件入れ替え', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02603');
        assertStatus(200, putSync($port, $id, ['wood_sets' => [wset(uid(3), '本体', [wline('框'), wline('桟')]), wset(uid(4), '鏡板')]]));
        assertEq(2, countSets($pdo, $id), '2部位');
        $idA = (int)$pdo->query("SELECT id FROM tategu_wood_sets WHERE uid = '" . uid(3) . "'")->fetchColumn();
        $r = putSync($port, $id, ['wood_sets' => [wset(uid(3), '本体改', [wline('縦框')], ['amount' => 5000]), wset(uid(5), '腰板', [])]]);
        assertStatus(200, $r);
        assertEq(2, countSets($pdo, $id), '4 は消えて 5 が増える');
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_wood_sets WHERE uid = '" . uid(4) . "'")->fetchColumn(), '4 なし');
        assertEq($idA, (int)$pdo->query("SELECT id FROM tategu_wood_sets WHERE uid = '" . uid(3) . "'")->fetchColumn(), '同じ行を書き換える');
        $a = $pdo->query("SELECT part_name, amount FROM tategu_wood_sets WHERE id = $idA")->fetch();
        assertEq('本体改', $a['part_name'], 'part_name');
        assertEq(5000, (int)$a['amount'], 'amount');
        assertEq(['縦框'], $pdo->query("SELECT usage FROM tategu_wood_lines WHERE wood_set_id = $idA")->fetchAll(PDO::FETCH_COLUMN), '明細は入れ替わる');
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_wood_lines WHERE wood_set_id NOT IN (SELECT id FROM tategu_wood_sets)")->fetchColumn(), '消した部位の明細は残らない');
    });

    runTest('wood_sets: [] は部位をすべて消す（部位の消去）', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02604');
        assertStatus(200, putSync($port, $id, ['wood_sets' => [wset(uid(6)), wset(uid(7), '鏡板')]]));
        assertEq(2, countSets($pdo, $id), '2部位');
        assertStatus(200, putSync($port, $id, ['wood_sets' => []]));
        assertEq(0, countSets($pdo, $id), '全部消える');
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_wood_lines WHERE wood_set_id NOT IN (SELECT id FROM tategu_wood_sets)")->fetchColumn(), '明細も消える');
    });

    runTest('uid が別の台帳の部位なら409 wood_set_uid_conflict で何も書かない', function () use ($port, $pdo) {
        $a = newProduct($pdo, '02605'); $b = newProduct($pdo, '02606');
        assertStatus(200, putSync($port, $a, ['wood_sets' => [wset(uid(8))]]));
        $r = putSync($port, $b, ['name' => '書き換え', 'cost_lines' => [wcost(uid(8))], 'wood_sets' => [wset(uid(9)), wset(strtoupper(uid(8)) . '')]]);
        assertStatus(409, $r);
        assertEq('wood_set_uid_conflict', $r['body']['error'] ?? null, 'error');
        assertEq('台帳', $pdo->query("SELECT name FROM tategu_items WHERE id = $b")->fetchColumn(), 'name は変わらない');
        assertEq(0, countSets($pdo, $b), '部位は書かれない');
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_item_cost_lines WHERE tategu_item_id = $b")->fetchColumn(), '原価行は書かれない');
        assertEq(1, countSets($pdo, $a), '元の台帳はそのまま');
    });

    runTest('wood_calc 行の wood_set_uid がどこにも無ければ400 wood_set_missing で何も書かない', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02607');
        $r = putSync($port, $id, ['name' => '書き換え', 'cost_lines' => [wcost(uid(10))], 'wood_sets' => [wset(uid(11))]]);
        assertStatus(400, $r);
        assertEq('wood_set_missing', $r['body']['error'] ?? null, 'error');
        assertEq('台帳', $pdo->query("SELECT name FROM tategu_items WHERE id = $id")->fetchColumn(), 'name は変わらない');
        assertEq(0, countSets($pdo, $id), '部位は書かれない');
        $r = putSync($port, $id, ['cost_lines' => [wcost(uid(10))]]);
        assertStatus(400, $r);
        assertEq('wood_set_missing', $r['body']['error'] ?? null, 'wood_sets 無しでも既存に無ければ');
        $r = jsonReq($port, 'POST', '/tategu-items/sync', ['code' => 2608, 'name' => 'x', 'cost_lines' => [wcost(uid(10))]]);
        assertStatus(400, $r);
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_items WHERE CAST(code AS INTEGER) = 2608")->fetchColumn(), '台帳も作らない');
    });

    runTest('文字の長さ: 30字ちょうど（全角）は通り、31字は400 text_too_long（field 付き）で何も書かない', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02609');
        $ok = str_repeat('あ', 30);
        assertStatus(200, putSync($port, $id, ['wood_sets' => [wset(uid(12), $ok, [wline($ok)], ['species_name' => $ok])]]));
        assertEq($ok, $pdo->query("SELECT part_name FROM tategu_wood_sets WHERE uid = '" . uid(12) . "'")->fetchColumn(), '30字は保存');
        $bad = str_repeat('あ', 31);
        $cases = [
            'part_name' => wset(uid(13), $bad),
            'species_name' => wset(uid(13), '本体', null, ['species_name' => $bad]),
            'usage' => wset(uid(13), '本体', [wline($bad)]),
        ];
        foreach ($cases as $field => $set) {
            $r = putSync($port, $id, ['name' => '書き換え', 'wood_sets' => [wset(uid(12), '別名'), $set]]);
            assertStatus(400, $r);
            assertEq('text_too_long', $r['body']['error'] ?? null, "$field error");
            assertEq($field, $r['body']['field'] ?? null, "$field field");
        }
        assertEq(1, countSets($pdo, $id), '部位は元のまま');
        assertEq($ok, $pdo->query("SELECT part_name FROM tategu_wood_sets WHERE uid = '" . uid(12) . "'")->fetchColumn(), '書き換わらない');
        assertEq('台帳', $pdo->query("SELECT name FROM tategu_items WHERE id = $id")->fetchColumn(), 'name も変わらない');
    });

    runTest('amount は計算し直さず、原価行の金額も来た値のまま（recalc で変わらない）', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02610');
        $r = putSync($port, $id, ['cost_lines' => [wcost(uid(14), 11084, 2, 22167)], 'wood_sets' => [wset(uid(14), '本体', null, ['amount' => 1])]]);
        assertStatus(200, $r);
        assertEq(1, (int)$pdo->query("SELECT amount FROM tategu_wood_sets WHERE uid = '" . uid(14) . "'")->fetchColumn(), '部位の amount');
        assertEq(22167.0, (float)$pdo->query("SELECT amount FROM tategu_item_cost_lines WHERE tategu_item_id = $id")->fetchColumn(), '原価行の金額');
        assertEq(22167.0, (float)$pdo->query("SELECT cost_body FROM tategu_items WHERE id = $id")->fetchColumn(), '合計は金額の和');
    });

    runTest('bulk と 409 product_conflict の product にも wood_sets が入り、bulk の違反は全体を戻す', function () use ($port, $pdo) {
        $r = jsonReq($port, 'POST', '/tategu-items/sync/bulk', ['items' => [
            ['code' => 2611, 'name' => 'B1', 'cost_lines' => [wcost(uid(15))], 'wood_sets' => [wset(uid(15))]],
        ]]);
        assertStatus(200, $r);
        assertEq(uid(15), $r['body']['data'][0]['wood_sets'][0]['uid'] ?? null, 'bulk の応答');
        $id = (int)$r['body']['data'][0]['id'];
        $r = jsonReq($port, 'PUT', "/tategu-items/$id/sync", ['name' => 'x', 'base_synced_at' => '2000-01-01 00:00:00']);
        assertStatus(409, $r);
        assertEq(uid(15), $r['body']['product']['wood_sets'][0]['uid'] ?? null, 'product に wood_sets');
        $r = jsonReq($port, 'POST', '/tategu-items/sync/bulk', ['items' => [
            ['code' => 2612, 'name' => 'ok'], ['code' => 2613, 'name' => 'ng', 'wood_sets' => [wset(uid(15))]],
        ]]);
        assertStatus(409, $r);
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM tategu_items WHERE CAST(code AS INTEGER) IN (2612, 2613)")->fetchColumn(), '全体を戻す');
    });

    echo "\n=== 建具データ（design） ===\n";

    runTest('design: POST で保存し sha256 と updated_at を更新、GET で中身をそのまま返し、DELETE で外す', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02620');
        $pdo->exec("UPDATE tategu_items SET updated_at = '2020-01-01 00:00:00' WHERE id = $id");
        assertStatus(404, http($port, 'GET', "/tategu-items/$id/design"));
        $json = '{"format":"tateds","version":1,"name":"格子戸"}';
        $r = uploadReq($port, "/tategu-items/$id/design", $json, 'd.json');
        assertStatus(200, $r);
        assertEq(hash('sha256', $json), $r['body']['design_sha256'] ?? null, '応答の design_sha256');
        assertTrue(!array_key_exists('tateds_design_json', $r['body']), '応答に JSON 本体は出さない');
        assertEq(hash('sha256', $json), $pdo->query("SELECT design_sha256 FROM tategu_items WHERE id = $id")->fetchColumn(), 'DB の sha');
        assertTrue($pdo->query("SELECT updated_at FROM tategu_items WHERE id = $id")->fetchColumn() > '2020-01-01 00:00:00', 'updated_at 更新');
        $g = http($port, 'GET', "/tategu-items/$id/design");
        assertStatus(200, $g);
        assertEq($json, $g['raw'], 'GET の中身');
        assertEq(hash('sha256', $json), findSync($port, $id)['design_sha256'], '同期の JSON に載る');
        assertTrue(!array_key_exists('tateds_design_json', findSync($port, $id)), '同期の JSON に本体は載らない');
        $pdo->exec("UPDATE tategu_items SET updated_at = '2020-01-01 00:00:00' WHERE id = $id");
        assertStatus(200, http($port, 'DELETE', "/tategu-items/$id/design"));
        $row = $pdo->query("SELECT design_sha256, tateds_design_json, updated_at FROM tategu_items WHERE id = $id")->fetch();
        assertEq(null, $row['design_sha256'], 'sha NULL');
        assertEq(null, $row['tateds_design_json'], 'json NULL');
        assertTrue($row['updated_at'] > '2020-01-01 00:00:00', 'DELETE で updated_at 更新');
        assertStatus(404, http($port, 'GET', "/tategu-items/$id/design"));
    });

    runTest('design: JSON でない中身・5MB 超・file なしは400で何も書かない', function () use ($port, $pdo) {
        $id = newProduct($pdo, '02621');
        assertStatus(400, uploadReq($port, "/tategu-items/$id/design", 'not json'));
        assertStatus(400, uploadReq($port, "/tategu-items/$id/design", '{"a":"' . str_repeat('x', 5 * 1024 * 1024) . '"}'));
        assertStatus(400, http($port, 'POST', "/tategu-items/$id/design", '{}', ['Content-Type: application/json']));
        assertEq(null, $pdo->query("SELECT design_sha256 FROM tategu_items WHERE id = $id")->fetchColumn(), '何も保存されない');
        assertStatus(404, uploadReq($port, '/tategu-items/999999/design', '{}'));
    });

    echo "\n=== 樹種表 ===\n";

    runTest('PUT /wood-species/sync: access_id で足す・書き換え、来なかった樹種は disabled にし、応答は全件。GET /wood-species も同じ', function () use ($port, $pdo) {
        $item = fn(int $aid, string $name, float $price, bool $dis = false, ?string $key = null) =>
            ['access_id' => $aid, 'name' => $name, 'unit_price_man' => $price, 'disabled' => $dis, 'sort_order' => $aid, 'tateds_species_key' => $key];
        $r = jsonReq($port, 'PUT', '/wood-species/sync', ['items' => [$item(1, 'ひのき', 80, false, 'hinoki'), $item(2, '杉', 60), $item(3, 'ナラ', 90)]]);
        assertStatus(200, $r);
        assertEq(3, count($r['body']['data']), '3件');
        $r = jsonReq($port, 'PUT', '/wood-species/sync', ['items' => [$item(1, 'ひのき', 85, false, 'hinoki'), $item(2, '杉', 60, true)]]);
        assertStatus(200, $r);
        $by = [];
        foreach ($r['body']['data'] as $s) $by[(int)$s['access_id']] = $s;
        assertEq(3, count($by), '全件が返る');
        assertEq(85.0, (float)$by[1]['unit_price_man'], '書き換え');
        assertEq(false, (bool)$by[1]['disabled'], '1 は使用可');
        assertEq(true, (bool)$by[2]['disabled'], '2 は来た値が disabled');
        assertEq(true, (bool)$by[3]['disabled'], '3 は来なかったので disabled');
        assertEq('hinoki', $by[1]['tateds_species_key'], 'key');
        assertEq(null, $by[2]['tateds_species_key'], 'key null 可');
        assertEq(3, (int)$pdo->query('SELECT COUNT(*) FROM wood_species')->fetchColumn(), '消さない');
        $g = jsonReq($port, 'GET', '/wood-species');
        assertStatus(200, $g);
        assertEq(3, count($g['body']['data']), 'GET も全件');
        assertStatus(400, jsonReq($port, 'PUT', '/wood-species/sync', ['nothing' => 1]));
    });

    echo "\n=== 取りこぼし対策 ===\n";

    runTest('GET sync: read_at を返し、after_id で同時刻の続きから読める', function () use ($port, $pdo) {
        $ids = [newProduct($pdo, '02630'), newProduct($pdo, '02631'), newProduct($pdo, '02632')];
        $pdo->exec("UPDATE tategu_items SET updated_at = '2030-10-05 00:00:00' WHERE id IN (" . implode(',', $ids) . ')');
        $since = rawurlencode('2030-10-05 09:00:00');
        $r = jsonReq($port, 'GET', "/tategu-items/sync?since=$since&limit=500");
        assertStatus(200, $r);
        assertTrue(preg_match('/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/', (string)($r['body']['read_at'] ?? '')) === 1, 'read_at の形: ' . json_encode($r['body']['read_at'] ?? null));
        $jst = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
        assertTrue(abs($jst->getTimestamp() - (new DateTime($r['body']['read_at'], new DateTimeZone('Asia/Tokyo')))->getTimestamp()) < 120, 'read_at は今の JST');
        $mine = fn(array $r) => array_values(array_filter(array_column($r['body']['data'], 'id'), fn($x) => in_array($x, $ids, true)));
        assertEq([], $mine($r), 'after_id なしは since と同時刻を含まない');
        $r = jsonReq($port, 'GET', "/tategu-items/sync?since=$since&after_id={$ids[0]}&limit=500");
        assertEq([$ids[1], $ids[2]], $mine($r), 'after_id より後ろの同時刻');
        $r = jsonReq($port, 'GET', "/tategu-items/sync?since=$since&after_id={$ids[2]}&limit=500");
        assertEq([], $mine($r), '最後の id なら空');
        $r = jsonReq($port, 'GET', "/tategu-items/sync?since=$since&after_id={$ids[0]}&limit=1");
        assertEq([$ids[1]], $mine($r), 'limit と組める');
    });

    echo "\n=== 認証（同期トークン） ===\n";

    runTest('design・wood-species・wood_sets 付きの同期はトークンで通り、無ければ401', function () use ($gatePort, $pdo) {
        $id = newProduct($pdo, '02640');
        $tok = ['Authorization: Bearer unit-test-sync-token'];
        $cases = [
            ['GET', "/tategu-items/$id/design", null],
            ['PUT', '/wood-species/sync', ['items' => []]],
            ['GET', '/wood-species', null],
        ];
        foreach ($cases as [$m, $p, $b]) {
            assertStatus(401, jsonReq($gatePort, $m, $p, $b));
            $ok = jsonReq($gatePort, $m, $p, $b, $tok);
            assertTrue(!str_contains($ok['status'], '401'), "$m $p トークン付きで401: " . $ok['raw']);
        }
    });
} catch (Throwable $e) {
    echo "FATAL: " . $e->getMessage() . "\n";
    $failed++;
}

echo "\n========================================\nPASSED: $passed\nFAILED: $failed\n";
exit($failed > 0 ? 1 : 0);
