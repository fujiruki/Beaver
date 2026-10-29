<?php
/**
 * R-0220 案件の予定 API テスト
 *
 * 起動: php api/tests/test_r0220_project_schedules.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$pid = getmypid();
$dbPath = __DIR__ . "/test_r0220_project_schedules_$pid.sqlite";
$bootstrap = __DIR__ . "/_r0220_project_schedules_bootstrap_$pid.php";
$procs = [];

register_shutdown_function(function () use ($dbPath, $bootstrap, &$procs) {
    foreach ($procs as $p) {
        if (!is_resource($p)) continue;
        $st = proc_get_status($p);
        @proc_terminate($p);
        if (!empty($st['pid'])) @exec('taskkill /F /T /PID ' . (int)$st['pid'] . ' 2>NUL');
        @proc_close($p);
    }
    foreach ([$dbPath, $dbPath . '-shm', $dbPath . '-wal', $bootstrap] as $f) @unlink($f);
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
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");

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

function startServer(string $root, string $bootstrap, int $port, array &$procs): void {
    $proc = proc_open(
        ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
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

function newProject(PDO $pdo, string $name = '案件'): int {
    $pdo->exec("INSERT OR IGNORE INTO customers (id, name) VALUES (1, 'テスト得意先')");
    $pdo->prepare("INSERT INTO projects (project_code, customer_id, name, updated_at) VALUES (?, 1, ?, '2020-01-01 00:00:00')")->execute(['P' . uniqid(), $name]);
    return (int)$pdo->lastInsertId();
}

try {
    $port = 18120;
    startServer($ROOT, $bootstrap, $port, $procs);

    echo "=== R-0220 案件の予定 ===\n";

    runTest('POST で追加し、GET /projects/{id}/schedules で返る', function () use ($port, $pdo) {
        $p = newProject($pdo);
        $r = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '見積', 'end_date' => '2026-11-05', 'memo' => 'ガラス']);
        assertStatus(201, $r);
        assertEq('見積', $r['body']['kind'], 'kind');
        assertEq(null, $r['body']['start_date'], 'start_date');
        assertEq(0, (int)$r['body']['done'], 'done');
        $g = jsonReq($port, 'GET', "/projects/$p/schedules");
        assertStatus(200, $g);
        assertEq(1, count($g['body']), '件数');
        assertEq('ガラス', $g['body'][0]['memo'], 'memo');
    });

    runTest('種類が一覧外・end_date なし・start_date > end_date は422で何も書かない', function () use ($port, $pdo) {
        $p = newProject($pdo);
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'end_date' => '2026-11-05']));
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '見積']));
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '取付', 'start_date' => '2026-11-06', 'end_date' => '2026-11-05']));
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM project_schedules WHERE project_id = $p")->fetchColumn(), '件数');
    });

    runTest('存在しない案件への追加は404', function () use ($port) {
        assertStatus(404, jsonReq($port, 'POST', '/projects/999999/schedules', ['kind' => '見積', 'end_date' => '2026-11-05']));
    });

    runTest('PUT は部分更新し、不正値は422で変えない', function () use ($port, $pdo) {
        $p = newProject($pdo);
        $id = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '取付', 'start_date' => '2026-11-01', 'end_date' => '2026-11-03'])['body']['id'];
        $r = jsonReq($port, 'PUT', "/project-schedules/$id", ['done' => 1, 'memo' => '済']);
        assertStatus(200, $r);
        assertEq(1, (int)$r['body']['done'], 'done');
        assertEq('2026-11-03', $r['body']['end_date'], 'end_date は変わらない');
        assertStatus(422, jsonReq($port, 'PUT', "/project-schedules/$id", ['kind' => 'へんな種類']));
        assertStatus(422, jsonReq($port, 'PUT', "/project-schedules/$id", ['end_date' => '2026-10-01']));
        assertEq('取付', $pdo->query("SELECT kind FROM project_schedules WHERE id = $id")->fetchColumn(), 'kind');
        assertStatus(404, jsonReq($port, 'PUT', '/project-schedules/999999', ['done' => 1]));
    });

    runTest('PUT で start_date を null にして期限だけの予定にできる', function () use ($port, $pdo) {
        $p = newProject($pdo);
        $id = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '見積', 'start_date' => '2026-11-01', 'end_date' => '2026-11-03'])['body']['id'];
        $r = jsonReq($port, 'PUT', "/project-schedules/$id", ['start_date' => null]);
        assertStatus(200, $r);
        assertEq(null, $r['body']['start_date'], 'start_date');
    });

    runTest('DELETE は物理削除する', function () use ($port, $pdo) {
        $p = newProject($pdo);
        $id = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '現調', 'end_date' => '2026-11-05'])['body']['id'];
        assertStatus(200, jsonReq($port, 'DELETE', "/project-schedules/$id"));
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM project_schedules WHERE id = $id")->fetchColumn(), '行');
        assertStatus(404, jsonReq($port, 'DELETE', "/project-schedules/$id"));
    });

    runTest('GET /project-schedules は論理削除の案件の予定を返さない', function () use ($port, $pdo) {
        $live = newProject($pdo, '生きてる');
        $dead = newProject($pdo, '消えた');
        jsonReq($port, 'POST', "/projects/$live/schedules", ['kind' => '見積', 'end_date' => '2026-11-05']);
        jsonReq($port, 'POST', "/projects/$dead/schedules", ['kind' => '見積', 'end_date' => '2026-11-05']);
        $pdo->exec("UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = $dead");
        $ids = array_map(fn($s) => (int)$s['project_id'], jsonReq($port, 'GET', '/project-schedules')['body']);
        assertTrue(in_array($live, $ids, true), '生きてる案件は含まれる');
        assertTrue(!in_array($dead, $ids, true), '論理削除の案件は含まれない');
        assertEq([], jsonReq($port, 'GET', "/projects/$dead/schedules")['body'], '個別取得も空');
    });

    runTest('予定を書いても projects.updated_at は進まず /sync/changes の件数も変わらない', function () use ($port, $pdo) {
        $p = newProject($pdo);
        $since = rawurlencode('2021-01-01 00:00:00');
        $changes = function () use ($port, $since) {
            $b = jsonReq($port, 'GET', "/sync/changes?since=$since")['body'];
            unset($b['server_time']);
            return $b;
        };
        $before = $changes();
        $id = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '見積', 'end_date' => '2026-11-05'])['body']['id'];
        jsonReq($port, 'PUT', "/project-schedules/$id", ['done' => 1]);
        jsonReq($port, 'DELETE', "/project-schedules/$id");
        assertEq('2020-01-01 00:00:00', $pdo->query("SELECT updated_at FROM projects WHERE id = $p")->fetchColumn(), 'updated_at');
        assertEq($before, $changes(), '/sync/changes');
    });

    runTest('案件を物理削除すると予定も消える', function () use ($pdo) {
        $p = newProject($pdo);
        $pdo->exec("INSERT INTO project_schedules (project_id, kind, end_date) VALUES ($p, '見積', '2026-11-05')");
        $pdo->exec("DELETE FROM projects WHERE id = $p");
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM project_schedules WHERE project_id = $p")->fetchColumn(), '件数');
    });
} catch (Throwable $e) {
    echo "FATAL: " . $e->getMessage() . "\n";
    $failed++;
}

echo "\n========================================\nPASSED: $passed\nFAILED: $failed\n";
exit($failed > 0 ? 1 : 0);
