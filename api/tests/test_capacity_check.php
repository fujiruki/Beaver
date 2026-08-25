<?php
/**
 * R-0118 Beaver-Youkan連携 B2 容量判定プロキシテスト
 *
 * 起動: php api/tests/test_capacity_check.php
 *
 * - Beaver本体を php ビルトインサーバで起動し、YOUKAN_CAPACITY_URL を
 *   スタブYoukanサーバ（_capacity_stub.php）へ向けて実HTTPで検証する
 * - スタブ停止後の呼び出しで接続不可（unreachable）縮退も検証する
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_capacity_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
    if (file_exists($testDbPath)) {
        @unlink($testDbPath);
    }
});

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');

$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $m) {
    $sql = file_get_contents($m);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}

// 新規DBなので projects.id は 1 から連番になる（スタブは external_project_id で応答を切り替える）
$pdo->prepare('INSERT INTO customers (name) VALUES (?)')->execute(['容量判定テスト得意先']);
$custId = (int)$pdo->lastInsertId();
$insProject = $pdo->prepare("
    INSERT INTO projects (project_code, customer_id, name, status, delivery_date)
    VALUES (?, ?, ?, '進行中', '2026-09-10')
");
foreach ([1 => '成功案件', 2 => '対象外案件', 3 => 'Youkan未発見案件', 4 => '設定不備案件', 5 => 'Youkan障害案件'] as $i => $name) {
    $insProject->execute([sprintf('CAP%03d', $i), $custId, $name]);
}

// ============================================================
// テストハーネス
// ============================================================
$passed = 0;
$failed = 0;
$failures = [];

function runTest(string $name, callable $fn): void {
    global $passed, $failed, $failures;
    try {
        $fn();
        echo "  [OK] $name\n";
        $passed++;
    } catch (Throwable $e) {
        echo "  [NG] $name :: " . $e->getMessage() . "\n";
        $failed++;
        $failures[] = $name . ': ' . $e->getMessage();
    }
}

function assertEq($expected, $actual, string $label = ''): void {
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf('%s expected=%s actual=%s', $label, var_export($expected, true), var_export($actual, true)));
    }
}

function assertTrue($cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

// ============================================================
// サーバ起動: スタブYoukan（18089）→ Beaver本体（18088）
// ============================================================
$stubPort   = 18089;
$beaverPort = 18088;

$bootstrap = __DIR__ . '/_capacity_bootstrap.php';
file_put_contents($bootstrap, "<?php\n"
    . "define('DB_PATH', " . var_export($testDbPath, true) . ");\n"
    . "define('YOUKAN_CAPACITY_URL', 'http://127.0.0.1:$stubPort/integrations/beaver/capacity-check');\n");

function startServer(array $cmd, string $cwd) {
    $proc = proc_open($cmd, [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']], $pipes, $cwd);
    if (!is_resource($proc)) throw new RuntimeException('サーバを起動できませんでした: ' . implode(' ', $cmd));
    return [$proc, $pipes];
}

function stopServer(&$proc, array $pipes): void {
    if (is_resource($proc)) {
        foreach ($pipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($proc);
        proc_close($proc);
        $proc = null;
    }
}

function waitReady(string $url): bool {
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
        if (@file_get_contents($url, false, $ctx) !== false) return true;
    }
    return false;
}

[$stubProc, $stubPipes] = startServer(['php', '-S', "127.0.0.1:$stubPort", __DIR__ . '/_capacity_stub.php'], __DIR__);
[$beaverProc, $beaverPipes] = startServer(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$beaverPort", '-t', $ROOT, $ROOT . '/index.php'],
    $ROOT
);

function capacityRequest(int $port, string $method, string $path): array {
    $ctx = stream_context_create(['http' => [
        'method'        => $method,
        'header'        => "Connection: close\r\n",
        'timeout'       => 20,
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    $status = $http_response_header[0] ?? '';
    return ['status' => $status, 'json' => json_decode((string)$body, true), 'body' => (string)$body];
}

try {
    if (!waitReady("http://127.0.0.1:$stubPort/")) throw new RuntimeException('スタブYoukanが応答しません');
    if (!waitReady("http://127.0.0.1:$beaverPort/contents/Beaver/api/health")) throw new RuntimeException('Beaverサーバが応答しません');

    echo "=== R-0118 GET /projects/{id}/capacity-check ===\n";

    runTest('Youkan 200 → ok:true・Y1レスポンスがresultに素通しされる（前回同期値注記も加工されない）', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/1/capacity-check');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
        $data = $res['json'];
        assertEq(true, $data['ok'] ?? null, 'ok');
        $result = $data['result'] ?? null;
        assertTrue(is_array($result), 'resultが存在する');
        assertEq(1, $result['external_project_id'], 'external_project_id');
        assertEq(false, $result['feasible'], 'feasible');
        assertEq('2026-09-10', $result['deadline'], 'deadline');
        assertEq(180, $result['shortage_minutes'], 'shortage_minutes');
        assertEq('9/10納期では3h不足（9/12なら入る）（Beaver再取得失敗・前回同期値で判定）', $result['message'], 'messageが加工されずそのまま返る');
        assertEq('2026-08-26T10:00:00+09:00', $result['evaluated_at'], 'evaluated_at');
    });

    runTest('Youkan 404 reason=excluded_status → ok:false reason=excluded_status（HTTPは200）', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/2/capacity-check');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = $res['json'];
        assertEq(false, $data['ok'] ?? null, 'ok');
        assertEq('excluded_status', $data['reason'] ?? null, 'reason');
        assertEq('このステータスの案件はYoukanの負荷計算対象外です', $data['message'] ?? null, 'message');
    });

    runTest('Youkan 404 reason=not_found → ok:false reason=not_found（HTTPは200）', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/3/capacity-check');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = $res['json'];
        assertEq(false, $data['ok'] ?? null, 'ok');
        assertEq('not_found', $data['reason'] ?? null, 'reason');
        assertEq('Youkanが案件を見つけられませんでした', $data['message'] ?? null, 'message');
    });

    runTest('Youkan 401 → ok:false reason=config（HTTPは200）', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/4/capacity-check');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = $res['json'];
        assertEq(false, $data['ok'] ?? null, 'ok');
        assertEq('config', $data['reason'] ?? null, 'reason');
        assertEq('Youkan連携の設定に問題があります（管理者に連絡してください）', $data['message'] ?? null, 'message');
    });

    runTest('Youkan 500 → ok:false reason=unreachable（HTTPは200）', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/5/capacity-check');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = $res['json'];
        assertEq(false, $data['ok'] ?? null, 'ok');
        assertEq('unreachable', $data['reason'] ?? null, 'reason');
        assertEq('Youkanに接続できないため、容量判定は現在利用できません', $data['message'] ?? null, 'message');
    });

    runTest('存在しないBeaver案件IDは通常どおり404', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/9999999/capacity-check');
        assertTrue(str_contains($res['status'], '404'), 'expected 404 got: ' . $res['status']);
        assertEq('Not found', $res['json']['error'] ?? null, 'error message');
    });

    runTest('余分なパスセグメントは404', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/1/capacity-check/extra');
        assertTrue(str_contains($res['status'], '404'), 'expected 404 got: ' . $res['status']);
    });

    runTest('GET以外は405（案件作成等の既存処理へ落ちない）', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'POST', '/projects/1/capacity-check');
        assertTrue(str_contains($res['status'], '405'), 'expected 405 got: ' . $res['status']);
    });

    // --- スタブ停止 → 接続不可の縮退 ---
    stopServer($stubProc, $stubPipes);
    usleep(200000);

    runTest('Youkan接続不可（接続拒否）→ ok:false reason=unreachable（HTTPは200）', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/1/capacity-check');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = $res['json'];
        assertEq(false, $data['ok'] ?? null, 'ok');
        assertEq('unreachable', $data['reason'] ?? null, 'reason');
        assertEq('Youkanに接続できないため、容量判定は現在利用できません', $data['message'] ?? null, 'message');
    });

    runTest('Youkan停止中でもBeaver本体（案件詳細）は正常に動く', function () use ($beaverPort) {
        $res = capacityRequest($beaverPort, 'GET', '/projects/1');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        assertEq('成功案件', $res['json']['name'] ?? null, '案件詳細が取得できる');
    });

} finally {
    stopServer($stubProc, $stubPipes);
    stopServer($beaverProc, $beaverPipes);
    @unlink($bootstrap);
}

// ============================================================
// 結果サマリ
// ============================================================
echo "\n";
echo "結果: {$passed} PASS / {$failed} FAIL\n";
if (!empty($failures)) {
    echo "\n失敗したテスト:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
    exit(1);
}
exit(0);
