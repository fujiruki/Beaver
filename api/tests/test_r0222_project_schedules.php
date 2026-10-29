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

const MIGRATION_041 = '041_project_schedules_hours_and_production.sql';

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
} catch (Throwable $e) {
    echo "FATAL: " . $e->getMessage() . "\n";
    $failed++;
}

echo "\n========================================\nPASSED: $passed\nFAILED: $failed\n";
exit($failed > 0 ? 1 : 0);
