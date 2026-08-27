<?php
/**
 * R-0117 Beaver-Youkan連携 B1 単体・統合テスト
 *
 * 起動: php api/tests/test_youkan_integration.php
 *
 * - list_helpers.php の正本ルール関数（selectPlanningEstimateVouchers /
 *   fetchEstimatedHoursByProjectIds / fetchProjectBaselines）を直接呼び出して検証
 * - GET /integrations/youkan/projects[.../{id}] は php ビルトインサーバを起動して
 *   実HTTPリクエストで検証する
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_youkan_' . getmypid() . '.sqlite';
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
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");

require_once $ROOT . '/routes/list_helpers.php';

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
// テスト用データ投入ヘルパ
// ============================================================
function insertCustomer(PDO $pdo, string $name): int {
    $pdo->prepare('INSERT INTO customers (name) VALUES (?)')->execute([$name]);
    return (int)$pdo->lastInsertId();
}

function insertProject(PDO $pdo, int $customerId, string $code, string $name, array $opts = []): int {
    $pdo->prepare('
        INSERT INTO projects (project_code, customer_id, name, status, delivery_date, manual_estimated_hours)
        VALUES (?, ?, ?, ?, ?, ?)
    ')->execute([
        $code, $customerId, $name,
        $opts['status'] ?? '進行中',
        $opts['delivery_date'] ?? null,
        $opts['manual_estimated_hours'] ?? null,
    ]);
    return (int)$pdo->lastInsertId();
}

$estimateSeq = 0;
function insertEstimateVoucher(PDO $pdo, int $projectId, int $customerId, string $voucherDate, string $status = 'approved'): int {
    global $estimateSeq;
    $estimateSeq++;
    $pdo->prepare("
        INSERT INTO vouchers (voucher_no, voucher_type, status, project_id, customer_id, voucher_date)
        VALUES (?, 'estimate', ?, ?, ?, ?)
    ")->execute(["YKV{$estimateSeq}", $status, $projectId, $customerId, $voucherDate]);
    return (int)$pdo->lastInsertId();
}

function insertVoucherLine(PDO $pdo, int $voucherId, int $lineNo, float $factoryHours, float $siteHours, int $qty = 1): void {
    $pdo->prepare('
        INSERT INTO voucher_lines (voucher_id, line_no, quantity, cost_factory_hours, cost_site_hours)
        VALUES (?, ?, ?, ?, ?)
    ')->execute([$voucherId, $lineNo, $qty, $factoryHours, $siteHours]);
}

function insertWorkPackageLine(PDO $pdo, int $voucherId, int $lineNo, ?string $itemName, float $factoryHours, float $siteHours, int $qty = 1, ?string $updatedAt = null): int {
    $pdo->prepare('
        INSERT INTO voucher_lines (voucher_id, line_no, item_name, quantity, cost_factory_hours, cost_site_hours, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ')->execute([$voucherId, $lineNo, $itemName, $qty, $factoryHours, $siteHours, $updatedAt]);
    return (int)$pdo->lastInsertId();
}

$custId = insertCustomer($pdo, 'Youkan連携テスト得意先');

// ============================================================
// 正本ルール（selectPlanningEstimateVouchers / fetchEstimatedHoursByProjectIds）
// ============================================================
echo "=== R-0117 正本ルール: 計画基準見積の選定 ===\n";

runTest('工数明細を持つ見積が1件だけならその合計が採用される', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK001', '単一見積案件');
    $v = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v, 1, 6, 2);

    $hours = fetchEstimatedHoursByProjectIds($pdo, [$pid]);
    assertEq(8.0, $hours[$pid], '工場6h+現場2h=8h');
});

runTest('複数の工数つき見積があっても合算されず最新1件のみ採用される（初回20h・改訂22hが42hにならない）', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK002', '複数見積案件');
    $v1 = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v1, 1, 20, 0);
    $v2 = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-15');
    insertVoucherLine($pdo, $v2, 1, 22, 0);

    $hours = fetchEstimatedHoursByProjectIds($pdo, [$pid]);
    assertEq(22.0, $hours[$pid], 'voucher_date最新(改訂22h)のみ採用。42hに合算されない');
});

runTest('voucher_dateが同日なら id降順（後から作成した方）が最新として採用される', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK003', '同日複数見積案件');
    $v1 = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v1, 1, 5, 0);
    $v2 = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v2, 1, 9, 0);

    $hours = fetchEstimatedHoursByProjectIds($pdo, [$pid]);
    assertEq(9.0, $hours[$pid], '同日ならid降順で後発(9h)が採用される');
});

runTest('voidの見積は候補から除外される', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK004', 'void見積案件');
    $v1 = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v1, 1, 20, 0);
    $v2 = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-15', 'void');
    insertVoucherLine($pdo, $v2, 1, 99, 0);

    $hours = fetchEstimatedHoursByProjectIds($pdo, [$pid]);
    assertEq(20.0, $hours[$pid], 'void見積(99h)は無視され、有効な最新(20h)が採用される');
});

runTest('工数明細（>0行）を持たない見積は候補にならない', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK005', '工数ゼロ見積案件', ['manual_estimated_hours' => 3.0]);
    $v1 = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v1, 1, 0, 0); // 工数0のみの明細 → 資格なし

    $hours = fetchEstimatedHoursByProjectIds($pdo, [$pid]);
    assertTrue(!array_key_exists($pid, $hours), '工数明細を持つ見積が無いためキーが存在しない');
});

// ============================================================
// baseline算出（fetchProjectBaselines）
// ============================================================
echo "\n=== R-0117 baseline算出 (fetchProjectBaselines) ===\n";

function fetchProjectRow(PDO $pdo, int $id): array {
    $stmt = $pdo->prepare('SELECT id, manual_estimated_hours, updated_at FROM projects WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch();
}

runTest('計画基準見積がある場合 baseline_source=estimate・baseline_hoursはその合計', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK101', 'estimate優先案件', ['manual_estimated_hours' => 999]);
    $v = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v, 1, 6, 2);

    $baselines = fetchProjectBaselines($pdo, [fetchProjectRow($pdo, $pid)]);
    assertEq('estimate', $baselines[$pid]['source'], 'baseline_source');
    assertEq(8.0, $baselines[$pid]['hours'], 'baseline_hours(手動入力999より見積8hが優先)');
    assertTrue($baselines[$pid]['updated_at'] !== null, 'baseline_updated_atが設定されている');
});

runTest('見積が無くmanual_estimated_hoursがある場合 baseline_source=manual', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK102', 'manualフォールバック案件', ['manual_estimated_hours' => 12.5]);

    $baselines = fetchProjectBaselines($pdo, [fetchProjectRow($pdo, $pid)]);
    assertEq('manual', $baselines[$pid]['source'], 'baseline_source');
    assertEq(12.5, $baselines[$pid]['hours'], 'baseline_hours=manual_estimated_hours');
});

runTest('見積もmanualも無い場合 baseline_source=none・baseline_hours=null', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YK103', '未入力案件');

    $baselines = fetchProjectBaselines($pdo, [fetchProjectRow($pdo, $pid)]);
    assertEq('none', $baselines[$pid]['source'], 'baseline_source');
    assertEq(null, $baselines[$pid]['hours'], 'baseline_hours');
    assertEq(null, $baselines[$pid]['updated_at'], 'baseline_updated_at');
});

// ============================================================
// R-0120 work_packages（選定済み見積IDの共有・生明細取得）
// ============================================================
echo "\n=== R-0120 work_packages ===\n";

runTest('manual/none baselineはvoucher_idを持たずwork_packages生成対象にならない', function () use ($pdo, $custId) {
    $manualPid = insertProject($pdo, $custId, 'YKWP001', 'manual案件', ['manual_estimated_hours' => 4.0]);
    $nonePid = insertProject($pdo, $custId, 'YKWP002', 'none案件');
    $baselines = fetchProjectBaselines($pdo, [fetchProjectRow($pdo, $manualPid), fetchProjectRow($pdo, $nonePid)]);

    assertEq(null, $baselines[$manualPid]['voucher_id'], 'manualのvoucher_id');
    assertEq(null, $baselines[$nonePid]['voucher_id'], 'noneのvoucher_id');
});

runTest('baseline算出対象とwork_packages取得対象が同じ選定済み見積IDになる', function () use ($pdo, $custId) {
    $pid = insertProject($pdo, $custId, 'YKWP003', '見積ID共有案件');
    $oldVoucher = insertEstimateVoucher($pdo, $pid, $custId, '2026-06-01');
    insertWorkPackageLine($pdo, $oldVoucher, 1, '旧明細', 20, 0);
    $selectedVoucher = insertEstimateVoucher($pdo, $pid, $custId, '2026-07-01');
    $selectedLine = insertWorkPackageLine($pdo, $selectedVoucher, 1, '新明細', 3, 2, 2, '2026-07-02 03:04:05');
    $voidVoucher = insertEstimateVoucher($pdo, $pid, $custId, '2026-08-01', 'void');
    insertWorkPackageLine($pdo, $voidVoucher, 1, 'void明細', 99, 0);

    $baseline = fetchProjectBaselines($pdo, [fetchProjectRow($pdo, $pid)])[$pid];
    assertEq($selectedVoucher, $baseline['voucher_id'], 'baselineが保持する選定済みvoucher_id');
    assertEq(10.0, $baseline['hours'], '選定済み見積だけのbaseline_hours');

    $rows = fetchWorkPackagesByVoucherIds($pdo, [$baseline['voucher_id']]);
    assertEq([$selectedLine], array_map('intval', array_column($rows[$selectedVoucher], 'line_id')), '選定済み見積の行だけ取得');
    assertEq('新明細', $rows[$selectedVoucher][0]['item_name'], '旧見積・void見積の明細を含まない');
});

// ============================================================
// 既存 fetchEstimatedHoursByProjectIds の呼び出し側（一覧）を壊していないこと
// ============================================================
echo "\n=== R-0097 回帰: 一覧のeffective_estimated_hoursが引き続き機能する ===\n";

runTest('見積(単一)集計優先・手動入力フォールバックが従来通り機能する', function () use ($pdo, $custId) {
    $withVoucher = insertProject($pdo, $custId, 'YK201', '一覧回帰_見積あり', ['manual_estimated_hours' => 999]);
    $v = insertEstimateVoucher($pdo, $withVoucher, $custId, '2026-06-01');
    insertVoucherLine($pdo, $v, 1, 1, 1);
    $withoutVoucher = insertProject($pdo, $custId, 'YK202', '一覧回帰_見積なし', ['manual_estimated_hours' => 3.5]);

    $hoursMap = fetchEstimatedHoursByProjectIds($pdo, [$withVoucher, $withoutVoucher]);
    assertEq(2.0, effectiveEstimatedHours($hoursMap[$withVoucher] ?? 0, 999), '見積集計(1+1)が優先');
    assertEq(3.5, effectiveEstimatedHours($hoursMap[$withoutVoucher] ?? 0, 3.5), '手動入力フォールバック');
});

// ============================================================
// HTTP: GET /integrations/youkan/projects[...]
// ============================================================
echo "\n=== R-0117 HTTP: /integrations/youkan/projects ===\n";

// ページング・フィルタ検証用データ
$pdo->exec("DELETE FROM projects WHERE project_code LIKE 'YKP%'");
for ($i = 1; $i <= 5; $i++) {
    insertProject($pdo, $custId, sprintf('YKP%03d', $i), "ページング案件$i", ['manual_estimated_hours' => 1.0]);
}
// baseline契約フィールド確認用の案件（見積由来）
$contractPid = insertProject($pdo, $custId, 'YKCONTRACT', '契約フィールド確認案件', [
    'status' => '受注済', 'delivery_date' => '2026-09-10',
]);
$contractVoucher = insertEstimateVoucher($pdo, $contractPid, $custId, '2026-06-01');
insertVoucherLine($pdo, $contractVoucher, 1, 6, 2);

// R-0120 HTTP契約検証用。新しいvoid見積は選定対象外で、approved見積だけが正本になる。
$workPackagePid = insertProject($pdo, $custId, 'YKWORKPACKAGES', 'work_packages契約案件');
$workPackageVoucher = insertEstimateVoucher($pdo, $workPackagePid, $custId, '2026-07-01');
$wpBothLine = insertWorkPackageLine($pdo, $workPackageVoucher, 10, '建具A', 1.25, 0.5, 2, '2026-07-02 03:04:05');
$wpFactoryLine1 = insertWorkPackageLine($pdo, $workPackageVoucher, 20, '同種作業', 3, 0);
$wpFactoryLine2 = insertWorkPackageLine($pdo, $workPackageVoucher, 30, '同種作業', 4, 0);
$wpSiteLine = insertWorkPackageLine($pdo, $workPackageVoucher, 40, '', 0, 2);
insertWorkPackageLine($pdo, $workPackageVoucher, 50, 'ゼロ時間', 0, 0);
insertWorkPackageLine($pdo, $workPackageVoucher, 60, '数量ゼロ', 8, 9, 0);
$voidWorkPackageVoucher = insertEstimateVoucher($pdo, $workPackagePid, $custId, '2026-08-01', 'void');
insertWorkPackageLine($pdo, $voidWorkPackageVoucher, 1, 'void明細', 99, 99);

$bootstrap = __DIR__ . '/_youkan_server_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18087;
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
    $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
    $r = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
    if ($r !== false) { $ready = true; break; }
}

function youkanGet(int $port, string $path, array $headers = []): array {
    $header = "Connection: close\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers));
    $ctx = stream_context_create(['http' => ['header' => $header, 'timeout' => 5, 'ignore_errors' => true]]);
    $body = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    $status = $http_response_header[0] ?? '';
    return ['status' => $status, 'body' => (string)$body];
}

function youkanRequest(int $port, string $method, string $path, array $headers = []): array {
    $header = "Connection: close\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers));
    $ctx = stream_context_create(['http' => ['method' => $method, 'header' => $header, 'timeout' => 5, 'ignore_errors' => true]]);
    $body = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
    $status = $http_response_header[0] ?? '';
    return ['status' => $status, 'body' => (string)$body];
}

const YOUKAN_DEV_TOKEN = 'dev-youkan-token-change-me';
const BANTO_DEV_TOKEN  = 'dev-local-banto-token-change-me';

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    // --- 認証 ---
    runTest('正しいYOUKAN_API_TOKENで200', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('トークン不一致は401', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects', ['Authorization: Bearer wrong-token']);
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status']);
        assertEq('unauthenticated', json_decode($res['body'], true)['error'] ?? null, 'error message');
    });

    runTest('トークンなしは401', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects');
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status']);
        assertEq('unauthenticated', json_decode($res['body'], true)['error'] ?? null, 'error message');
    });

    runTest('BANTO_API_TOKENでは通らない（401）', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects', ['Authorization: Bearer ' . BANTO_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '401'), 'BANTOトークンはYoukanパスを通さない。got: ' . $res['status']);
        assertEq('unauthenticated', json_decode($res['body'], true)['error'] ?? null, 'error message');
    });

    // --- 契約フィールド ---
    runTest('契約どおりのJSONフィールドを返す（見積由来）', function () use ($port, $contractPid) {
        $res = youkanGet($port, "/integrations/youkan/projects/$contractPid", ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = json_decode($res['body'], true);
        foreach (['source', 'external_project_id', 'project_code', 'name', 'customer_name', 'status', 'delivery_date', 'baseline_hours', 'baseline_source', 'baseline_updated_at', 'updated_at'] as $key) {
            assertTrue(array_key_exists($key, $data), "$key キーが存在すること");
        }
        assertEq('beaver', $data['source'], 'source');
        assertEq($contractPid, $data['external_project_id'], 'external_project_id');
        assertEq('YKCONTRACT', $data['project_code'], 'project_code');
        assertEq('受注済', $data['status'], 'status');
        assertEq('2026-09-10', $data['delivery_date'], 'delivery_date');
        assertEq('estimate', $data['baseline_source'], 'baseline_source');
        assertEq(8.0, (float)$data['baseline_hours'], 'baseline_hours');
        assertTrue($data['baseline_updated_at'] !== null, 'baseline_updated_atが非null');
        assertTrue(str_contains((string)$data['baseline_updated_at'], '+09:00'), 'baseline_updated_atがJSTオフセット付き');
    });

    runTest('manual/none案件はHTTPでwork_packagesが空配列になる', function () use ($port) {
        foreach (['YKWP001', 'YKWP002'] as $code) {
            $res = youkanGet($port, '/integrations/youkan/projects?limit=1000', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
            $rows = array_values(array_filter(json_decode($res['body'], true)['data'], fn($row) => $row['project_code'] === $code));
            assertEq(1, count($rows), "$code が一覧に存在");
            assertEq([], $rows[0]['work_packages'] ?? null, "$code のwork_packages");
        }
    });

    runTest('estimate案件の明細を行別・factory→site順でHTTP契約どおり返す', function () use ($port, $workPackagePid, $workPackageVoucher, $wpBothLine, $wpFactoryLine1, $wpFactoryLine2, $wpSiteLine) {
        $res = youkanGet($port, "/integrations/youkan/projects/$workPackagePid", ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = json_decode($res['body'], true);
        assertTrue(array_key_exists('work_packages', $data), 'work_packagesフィールドが存在');
        $packages = $data['work_packages'];
        assertEq(5, count($packages), '両方2件+factoryのみ2件+siteのみ1件（0時間・数量0は除外）');
        assertEq([
            "beaver:voucher:$workPackageVoucher:line:$wpBothLine:factory",
            "beaver:voucher:$workPackageVoucher:line:$wpBothLine:site",
            "beaver:voucher:$workPackageVoucher:line:$wpFactoryLine1:factory",
            "beaver:voucher:$workPackageVoucher:line:$wpFactoryLine2:factory",
            "beaver:voucher:$workPackageVoucher:line:$wpSiteLine:site",
        ], array_column($packages, 'external_work_package_id'), 'line_no昇順・同一行factory→site順で統合しない');
        assertEq([2.5, 1.0, 3.0, 4.0, 2.0], array_map('floatval', array_column($packages, 'estimated_hours')), '単位工数×数量');
        assertEq('明細40', $packages[4]['label'], '空item_nameのフォールバック');
        assertTrue(str_contains((string)$packages[0]['updated_at'], '2026-07-02T12:04:05+09:00'), '明細updated_atをJST ISO8601化');
        assertTrue($packages[2]['updated_at'] !== null, '明細updated_at NULL時は伝票updated_atへフォールバック');
        foreach ($packages as $package) {
            assertEq(['external_work_package_id', 'label', 'category', 'estimated_hours', 'source_voucher_id', 'source_line_id', 'updated_at'], array_keys($package), 'work_packageのキー');
            assertEq($workPackageVoucher, $package['source_voucher_id'], 'baseline対象見積とsource_voucher_idが一致');
            assertTrue(!array_key_exists('external_project_id', $package), '子要素にexternal_project_idを含めない');
        }
    });

    runTest('見積改訂で旧work_packageが消え新見積のwork_packageへ切り替わる', function () use ($port, $pdo, $custId, $workPackagePid, $workPackageVoucher, $wpBothLine) {
        $beforeId = "beaver:voucher:$workPackageVoucher:line:$wpBothLine:factory";
        $newVoucher = insertEstimateVoucher($pdo, $workPackagePid, $custId, '2026-09-01');
        $newLine = insertWorkPackageLine($pdo, $newVoucher, 1, '改訂明細', 7, 0);

        $res = youkanGet($port, "/integrations/youkan/projects/$workPackagePid", ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        $packages = json_decode($res['body'], true)['work_packages'];
        assertEq(["beaver:voucher:$newVoucher:line:$newLine:factory"], array_column($packages, 'external_work_package_id'), '新見積だけが現れる');
        assertTrue(!in_array($beforeId, array_column($packages, 'external_work_package_id'), true), '旧見積のpackageは消える');
        assertEq(7.0, (float)json_decode($res['body'], true)['baseline_hours'], 'baselineも同じ新見積へ切替');
        assertEq($newVoucher, $packages[0]['source_voucher_id'], 'baseline対象とpackage対象が一致');
    });

    // --- 完全一致ガード ---
    runTest('存在しないidは404', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects/9999999', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '404'), 'expected 404 got: ' . $res['status']);
        assertEq('Not found', json_decode($res['body'], true)['error'] ?? null, 'error message');
    });

    runTest('余分なパスセグメントは404', function () use ($port, $contractPid) {
        $res = youkanGet($port, "/integrations/youkan/projects/$contractPid/extra", ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '404'), 'expected 404 got: ' . $res['status']);
        assertEq('Not found', json_decode($res['body'], true)['error'] ?? null, 'error message');
    });

    runTest('数値でないidは404', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects/abc', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '404'), 'expected 404 got: ' . $res['status']);
        assertEq('Not found', json_decode($res['body'], true)['error'] ?? null, 'error message');
    });

    runTest('未知のリソース名は404', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/unknown', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '404'), 'expected 404 got: ' . $res['status']);
        assertEq('Not found', json_decode($res['body'], true)['error'] ?? null, 'error message');
    });

    // --- GET以外は405 ---
    runTest('POSTは405', function () use ($port) {
        $res = youkanRequest($port, 'POST', '/integrations/youkan/projects', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '405'), 'expected 405 got: ' . $res['status']);
    });

    // --- ページング ---
    runTest('limit既定値200・最大1000にクランプされる', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects?limit=99999', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        $data = json_decode($res['body'], true);
        assertTrue(count($data['data']) <= 1000, 'limitが1000にクランプされる');
    });

    runTest('limit=2で2件返しnext_cursorを含む・cursorで次ページが取れる', function () use ($port) {
        $res1 = youkanGet($port, '/integrations/youkan/projects?limit=2', ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        $data1 = json_decode($res1['body'], true);
        assertEq(2, count($data1['data']), '1ページ目の件数');
        assertTrue($data1['next_cursor'] !== null, 'next_cursorが存在する');
        $firstIds = array_column($data1['data'], 'external_project_id');

        $res2 = youkanGet($port, '/integrations/youkan/projects?limit=2&cursor=' . $data1['next_cursor'], ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        $data2 = json_decode($res2['body'], true);
        $secondIds = array_column($data2['data'], 'external_project_id');
        assertTrue(count($data2['data']) > 0, '2ページ目に結果がある');
        assertTrue(empty(array_intersect($firstIds, $secondIds)), 'ページ間で重複しない');
    });

    runTest('updated_afterで差分を絞り込める', function () use ($port, $testDbPath) {
        $future = insertProject($GLOBALS['pdo'], $GLOBALS['custId'], 'YKFUTURE', 'updated_after検証案件');
        $checkPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $checkPdo->exec("UPDATE projects SET updated_at = '2099-01-01 00:00:00' WHERE id = $future");
        $checkPdo = null;

        $res = youkanGet($port, '/integrations/youkan/projects?updated_after=' . urlencode('2098-01-01 00:00:00'), ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        $data = json_decode($res['body'], true);
        $ids = array_column($data['data'], 'external_project_id');
        assertEq([$future], $ids, 'updated_after以降に更新された案件のみ返る');
    });

    runTest('updated_afterに不正な形式を指定すると400', function () use ($port) {
        $res = youkanGet($port, '/integrations/youkan/projects?updated_after=' . urlencode('not-a-date'), ['Authorization: Bearer ' . YOUKAN_DEV_TOKEN]);
        assertTrue(str_contains($res['status'], '400'), 'expected 400 got: ' . $res['status']);
    });

    // --- 既存契約への影響がないこと ---
    runTest('既存 /projects/sync は引き続き200で projects/limit を返す', function () use ($port) {
        $res = youkanGet($port, '/projects/sync');
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status']);
        $data = json_decode($res['body'], true);
        assertTrue(isset($data['projects']) && isset($data['limit']), '既存レスポンス構造が維持されている');
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
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
