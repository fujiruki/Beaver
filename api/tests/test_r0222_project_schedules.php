<?php
/**
 * R-0222 予定の hours・製作・開始日の移し替え テスト
 *
 * 起動: php api/tests/test_r0222_project_schedules.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$pid = getmypid();
$dbPath = __DIR__ . "/test_r0222_project_schedules_$pid.sqlite";
$bootstrap = __DIR__ . "/_r0222_project_schedules_bootstrap_$pid.php";
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

function openDb(string $path): PDO {
    $pdo = new PDO('sqlite:' . $path, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys=ON');
    return $pdo;
}

function migrationStatements(string $file): array {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($file));
    return array_values(array_filter(array_map('trim', explode(';', $sql)), fn($s) => $s !== ''));
}

function applyMigrationsLenient(PDO $pdo, string $root, callable $include): void {
    $migrations = glob($root . '/migrations/*.sql');
    sort($migrations);
    foreach ($migrations as $m) {
        if (!$include(basename($m))) continue;
        foreach (migrationStatements($m) as $stmt) {
            try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
        }
    }
}

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
function jsonReq(int $port, string $method, string $path, ?array $data = null): array {
    return http($port, $method, $path, $data === null ? null : json_encode($data, JSON_UNESCAPED_UNICODE), ['Content-Type: application/json']);
}
function assertStatus(int $code, array $r): void {
    assertTrue(str_contains($r['status'], (string)$code), "HTTP $code expected: {$r['status']} body=" . substr($r['raw'], 0, 300));
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

const MIGRATION_041 ='041_project_schedules_hours_and_production.sql';

try {
    echo "=== R-0222 migration 041 ===\n";

    $migPath = __DIR__ . "/test_r0222_mig_$pid.sqlite";
    register_shutdown_function(function () use ($migPath) {
        foreach ([$migPath, $migPath . '-shm', $migPath . '-wal'] as $f) @unlink($f);
    });
    $mig = openDb($migPath);
    $mig->exec(file_get_contents($ROOT . '/schema.sql'));
    applyMigrationsLenient($mig, $ROOT, fn($name) => strcmp($name, MIGRATION_041) < 0);
    $mig->exec("INSERT OR IGNORE INTO customers (id, name) VALUES (1, 'テスト得意先')");
    $addProject = function (string $code, ?string $start) use ($mig): int {
        $mig->prepare("INSERT INTO projects (project_code, customer_id, name, start_date, updated_at) VALUES (?, 1, ?, ?, '2020-01-01 00:00:00')")
            ->execute([$code, $code, $start]);
        return (int)$mig->lastInsertId();
    };
    $withStart = $addProject('PA', '2026-11-10');
    $alreadyHas = $addProject('PB', '2026-11-12');
    $noStart = $addProject('PC', null);
    $otherKind = $addProject('PD', '2026-11-20');
    $mig->exec("INSERT INTO project_schedules (project_id, kind, start_date, end_date, memo, done) VALUES ($alreadyHas, '製作', '2026-11-12', '2026-11-15', '既存', 0)");
    $mig->exec("INSERT INTO project_schedules (id, project_id, kind, start_date, end_date, memo, done) VALUES (500, $otherKind, '見積', NULL, '2026-11-05', 'ガラス', 1)");

    $migrationFile = $ROOT . '/migrations/' . MIGRATION_041;
    $statements = file_exists($migrationFile) ? migrationStatements($migrationFile) : [];
    foreach ($statements as $stmt) $mig->exec($stmt);

    $rows = fn(int $p) => $mig->query("SELECT * FROM project_schedules WHERE project_id = $p ORDER BY id")->fetchAll();

    runTest('migration 041 のファイルがある', function () use ($statements) {
        assertTrue(count($statements) > 0, 'statements');
    });

    runTest('開始日が入っていて製作の予定が無い案件に、製作の予定が1行できる', function () use ($rows, $withStart) {
        $r = $rows($withStart);
        assertEq(1, count($r), '件数');
        assertEq('製作', $r[0]['kind'], 'kind');
        assertEq('2026-11-10', $r[0]['start_date'], 'start_date');
        assertEq(null, $r[0]['end_date'], 'end_date');
        assertEq(null, $r[0]['hours'], 'hours');
        assertEq(0, (int)$r[0]['done'], 'done');
    });

    runTest('製作の予定がある案件・開始日の無い案件には足さない', function () use ($rows, $alreadyHas, $noStart) {
        $r = $rows($alreadyHas);
        assertEq(1, count($r), '既存の案件の件数');
        assertEq('既存', $r[0]['memo'], 'memo');
        assertEq(0, count($rows($noStart)), '開始日なしの案件');
    });

    runTest('既存の予定は id・値ともそのまま残る', function () use ($rows, $otherKind) {
        $r = $rows($otherKind);
        assertEq(2, count($r), '件数');
        assertEq(500, (int)$r[0]['id'], 'id');
        assertEq('見積', $r[0]['kind'], 'kind');
        assertEq('2026-11-05', $r[0]['end_date'], 'end_date');
        assertEq('ガラス', $r[0]['memo'], 'memo');
        assertEq(1, (int)$r[0]['done'], 'done');
        assertEq('製作', $r[1]['kind'], '開始日から作った製作');
    });

    runTest('移し替えをもう一度流しても増えない', function () use ($mig, $statements) {
        $before = (int)$mig->query('SELECT COUNT(*) FROM project_schedules')->fetchColumn();
        foreach ($statements as $stmt) {
            if (stripos($stmt, 'NOT EXISTS') !== false) $mig->exec($stmt);
        }
        assertEq($before, (int)$mig->query('SELECT COUNT(*) FROM project_schedules')->fetchColumn(), '件数');
    });

    runTest('end_date は NULL 可、hours を持てる', function () use ($mig, $noStart) {
        $mig->exec("INSERT INTO project_schedules (project_id, kind, hours) VALUES ($noStart, '製作', 8)");
        $r = $mig->query("SELECT end_date, hours FROM project_schedules WHERE project_id = $noStart")->fetch();
        assertEq(null, $r['end_date'], 'end_date');
        assertEq(8.0, (float)$r['hours'], 'hours');
    });

    runTest('検査: 開始>終了・負の時間・日付も時間も無い行は表が拒む', function () use ($mig, $noStart) {
        $bad = [
            "INSERT INTO project_schedules (project_id, kind, start_date, end_date) VALUES ($noStart, '取付', '2026-12-02', '2026-12-01')",
            "INSERT INTO project_schedules (project_id, kind, hours) VALUES ($noStart, '取付', -1)",
            "INSERT INTO project_schedules (project_id, kind) VALUES ($noStart, '取付')",
        ];
        foreach ($bad as $sql) {
            $rejected = false;
            try { $mig->exec($sql); } catch (Throwable $_) { $rejected = true; }
            assertTrue($rejected, $sql);
        }
    });

    runTest('案件を物理削除すると予定も消える（外部キーが残っている）', function () use ($mig, $withStart) {
        $mig->exec("DELETE FROM projects WHERE id = $withStart");
        assertEq(0, (int)$mig->query("SELECT COUNT(*) FROM project_schedules WHERE project_id = $withStart")->fetchColumn(), '件数');
    });

    runTest('開始日は projects.start_date に残したまま（updated_at も変えない）', function () use ($mig, $alreadyHas) {
        $r = $mig->query("SELECT start_date, updated_at FROM projects WHERE id = $alreadyHas")->fetch();
        assertEq('2026-11-12', $r['start_date'], 'start_date');
        assertEq('2020-01-01 00:00:00', $r['updated_at'], 'updated_at');
    });

    echo "\n=== R-0222 予定の API ===\n";

    $pdo = openDb($dbPath);
    $pdo->exec(file_get_contents($ROOT . '/schema.sql'));
    applyMigrationsLenient($pdo, $ROOT, fn($name) => true);
    $pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");
    file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
    $port = 18121;
    startServer($ROOT, $bootstrap, $port, $procs);

    $newProject = function (string $name = '案件') use ($pdo): int {
        $pdo->exec("INSERT OR IGNORE INTO customers (id, name) VALUES (1, 'テスト得意先')");
        $pdo->prepare("INSERT INTO projects (project_code, customer_id, name, updated_at) VALUES (?, 1, ?, '2020-01-01 00:00:00')")->execute(['P' . uniqid(), $name]);
        return (int)$pdo->lastInsertId();
    };
    $projectRow = fn(int $p) => $pdo->query("SELECT start_date, updated_at FROM projects WHERE id = $p")->fetch();

    runTest('種類に「製作」を使え、時間だけでも予定になる（end_date・start_date は null）', function () use ($port, $newProject) {
        $p = $newProject();
        $r = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'hours' => 12.5]);
        assertStatus(201, $r);
        assertEq('製作', $r['body']['kind'], 'kind');
        assertEq(12.5, (float)$r['body']['hours'], 'hours');
        assertEq(null, $r['body']['start_date'], 'start_date');
        assertEq(null, $r['body']['end_date'], 'end_date');
    });

    runTest('終了なしで開始だけの予定を作れる', function () use ($port, $newProject) {
        $p = $newProject();
        $r = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '見積', 'start_date' => '2026-11-05']);
        assertStatus(201, $r);
        assertEq(null, $r['body']['end_date'], 'end_date');
    });

    runTest('日付も時間も無い・時間が負・開始>終了・時間が数でないは422で何も書かない', function () use ($port, $pdo, $newProject) {
        $p = $newProject();
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作']));
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'start_date' => '', 'end_date' => '', 'hours' => null]));
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'hours' => -1]));
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'hours' => 'abc']));
        assertStatus(422, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '取付', 'start_date' => '2026-11-06', 'end_date' => '2026-11-05']));
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM project_schedules WHERE project_id = $p")->fetchColumn(), '件数');
    });

    runTest('時間0は予定として作れる', function () use ($port, $newProject) {
        $p = $newProject();
        assertStatus(201, jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '見積', 'hours' => 0]));
    });

    runTest('PUT は hours を部分更新でき、全部空にする更新は422で変えない', function () use ($port, $pdo, $newProject) {
        $p = $newProject();
        $id = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '見積', 'end_date' => '2026-11-05'])['body']['id'];
        $r = jsonReq($port, 'PUT', "/project-schedules/$id", ['hours' => 2.5]);
        assertStatus(200, $r);
        assertEq(2.5, (float)$r['body']['hours'], 'hours');
        assertEq('2026-11-05', $r['body']['end_date'], 'end_date は変わらない');
        assertStatus(422, jsonReq($port, 'PUT', "/project-schedules/$id", ['hours' => -3]));
        assertStatus(200, jsonReq($port, 'PUT', "/project-schedules/$id", ['end_date' => null]));
        assertStatus(422, jsonReq($port, 'PUT', "/project-schedules/$id", ['hours' => null]));
        assertEq(2.5, (float)$pdo->query("SELECT hours FROM project_schedules WHERE id = $id")->fetchColumn(), 'hours');
    });

    runTest('製作の予定の追加・変更・削除で projects.start_date が一番早い開始日の写しになり、updated_at は進まない', function () use ($port, $newProject, $projectRow) {
        $p = $newProject();
        assertEq(null, $projectRow($p)['start_date'], '最初');
        $a = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'start_date' => '2026-11-20'])['body']['id'];
        assertEq('2026-11-20', $projectRow($p)['start_date'], '追加');
        $b = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'start_date' => '2026-11-10', 'end_date' => '2026-11-12'])['body']['id'];
        assertEq('2026-11-10', $projectRow($p)['start_date'], '早い方');
        jsonReq($port, 'PUT', "/project-schedules/$b", ['start_date' => '2026-11-25', 'end_date' => '2026-11-26']);
        assertEq('2026-11-20', $projectRow($p)['start_date'], '直す');
        jsonReq($port, 'DELETE', "/project-schedules/$a");
        assertEq('2026-11-25', $projectRow($p)['start_date'], '消す');
        jsonReq($port, 'PUT', "/project-schedules/$b", ['start_date' => null]);
        assertEq(null, $projectRow($p)['start_date'], '開始日を空にする');
        assertEq('2020-01-01 00:00:00', $projectRow($p)['updated_at'], 'updated_at');
    });

    runTest('製作以外の予定や、開始日の無い製作の予定は写しに影響しない', function () use ($port, $newProject, $projectRow) {
        $p = $newProject();
        jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '取付', 'start_date' => '2026-11-01', 'end_date' => '2026-11-02']);
        jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'hours' => 8]);
        assertEq(null, $projectRow($p)['start_date'], 'start_date');
    });

    runTest('種類を製作から別へ変えると写しを入れ直す', function () use ($port, $newProject, $projectRow) {
        $p = $newProject();
        $id = jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'start_date' => '2026-11-20'])['body']['id'];
        jsonReq($port, 'PUT', "/project-schedules/$id", ['kind' => '取付']);
        assertEq(null, $projectRow($p)['start_date'], 'start_date');
    });

    runTest('POST /projects の start_date は書かれない', function () use ($port, $pdo) {
        $pdo->exec("INSERT OR IGNORE INTO customers (id, name) VALUES (1, 'テスト得意先')");
        $r = jsonReq($port, 'POST', '/projects', ['customer_id' => 1, 'name' => '新規', 'start_date' => '2026-11-01']);
        assertStatus(201, $r);
        assertEq(null, $r['body']['start_date'], 'start_date');
    });

    runTest('PUT /projects の start_date は書かれず、他の項目は更新される', function () use ($port, $newProject, $projectRow) {
        $p = $newProject();
        jsonReq($port, 'POST', "/projects/$p/schedules", ['kind' => '製作', 'start_date' => '2026-11-20']);
        $r = jsonReq($port, 'PUT', "/projects/$p", ['name' => '改名', 'start_date' => '2026-12-31']);
        assertStatus(200, $r);
        assertEq('改名', $r['body']['name'], 'name');
        assertEq('2026-11-20', $r['body']['start_date'], 'start_date は製作の予定のまま');
        assertEq('2026-11-20', $projectRow($p)['start_date'], 'DB');
    });

    runTest('PUT /projects に start_date だけを送っても何も変えない', function () use ($port, $newProject) {
        $p = $newProject();
        jsonReq($port, 'PUT', "/projects/$p", ['start_date' => '2026-12-31']);
        assertEq(null, jsonReq($port, 'GET', "/projects/$p")['body']['start_date'], 'start_date');
    });
} catch (Throwable $e) {
    echo "FATAL: " . $e->getMessage() . "\n";
    $failed++;
}

echo "\n========================================\nPASSED: $passed\nFAILED: $failed\n";
exit($failed > 0 ? 1 : 0);
