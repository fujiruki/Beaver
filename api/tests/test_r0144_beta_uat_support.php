<?php
/**
 * R-0144: Dodaikun v1受入テスト自動化のためのBeaver_beta向け機能追加 テスト
 *
 * 起動: php api/tests/test_r0144_beta_uat_support.php
 *
 * - B-2: GET /sync/status がSYNC_API_TOKENで呼べること（認証ゲート免除漏れの修正）
 * - B-4: GET /invoices/sync・GET /payments/sync の新設
 * - B-1: POST /admin/snapshot/save・restore、GET /admin/snapshot/list（3つの歯止め・排他制御）
 *
 * php ビルトインサーバを起動して実際にHTTPで叩く（test_invoices_sync.php と同じ方式）。
 * 環境ごとに定数を変える必要があるシナリオはサーバプロセスを分けて起動する。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

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

function makeTestDb(string $root, string $dbPath): void {
    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys=ON');
    $pdo->exec(file_get_contents($root . '/schema.sql'));
    $migrations = glob($root . '/migrations/*.sql');
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
}

function startServer(string $root, string $bootstrap, int $port): mixed {
    $proc = proc_open(
        ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
        $pipes,
        $root
    );
    if (!is_resource($proc)) {
        throw new RuntimeException('php ビルトインサーバを起動できませんでした');
    }
    $ready = false;
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
        $r = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
        if ($r !== false) { $ready = true; break; }
    }
    if (!$ready) {
        proc_terminate($proc);
        proc_close($proc);
        throw new RuntimeException('サーバが応答しません');
    }
    return $proc;
}

function stopServer(mixed $proc): void {
    if (is_resource($proc)) { proc_terminate($proc); proc_close($proc); }
}

/**
 * @return array{status:string, body:mixed}
 * $base はサーバ側の BASE_PATH（APP_ID依存）に合わせる。APP_ID を上書きした
 * サーバに対しては、対応する base（例: /contents/Beaver_beta/api）を渡すこと。
 */
function httpJson(int $port, string $method, string $path, ?array $body = null, array $headers = [], string $base = '/contents/Beaver/api'): array {
    $header = "Connection: close\r\nContent-Type: application/json\r\n" . implode('', array_map(fn($h) => "$h\r\n", $headers));
    $opts = ['method' => $method, 'header' => $header, 'ignore_errors' => true, 'timeout' => 5];
    if ($body !== null) $opts['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    $ctx = stream_context_create(['http' => $opts]);
    $rawBody = false; $hdr = [];
    for ($t = 0; $t < 3 && $rawBody === false; $t++) {
        if ($t > 0) usleep(200000);
        $rawBody = @file_get_contents("http://127.0.0.1:$port$base$path", false, $ctx);
        if (isset($http_response_header)) $hdr = $http_response_header;
    }
    return ['status' => $hdr[0] ?? '', 'body' => json_decode((string)$rawBody, true)];
}

function dbConn(string $dbPath): PDO {
    return new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
}

// ============================================================
// B-2: GET /sync/status が SYNC_API_TOKEN で呼べること
// ============================================================
echo "=== R-0144 B-2 GET /sync/status の認証ゲート免除漏れ修正 ===\n";

$dbPathB2 = __DIR__ . '/test_r0144_b2_' . getmypid() . '.sqlite';
if (file_exists($dbPathB2)) unlink($dbPathB2);
makeTestDb($ROOT, $dbPathB2);
$bootstrapB2 = __DIR__ . '/_r0144_b2_bootstrap.php';
file_put_contents($bootstrapB2, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPathB2, true) . ");\n"
    . "define('AUTH_DRIVER', 'shared');\n"
    . "define('SYNC_TOKEN_REQUIRED', true);\n"
    . "define('SYNC_API_TOKEN', 'unit-test-sync-token');\n"
    . "require_once dirname(__DIR__) . '/auth_client.php';\n"
    . "auth_configure(['verifier' => fn(string \$t): ?array => ['id' => 1, 'name' => 'テスト太郎']]);\n"
);
$portB2 = 18130;
$procB2 = null;
try {
    $procB2 = startServer($ROOT, $bootstrapB2, $portB2);

    runTest('修正前の回帰確認: SYNC_API_TOKENなしの /sync/status は401', function () use ($portB2) {
        $r = httpJson($portB2, 'GET', '/sync/status');
        assertTrue(str_contains($r['status'], '401'), 'expected 401 got: ' . $r['status']);
    });

    runTest('正しいSYNC_API_TOKENを付けた /sync/status は200・app_idを返す', function () use ($portB2) {
        $r = httpJson($portB2, 'GET', '/sync/status', null, ['Authorization: Bearer unit-test-sync-token']);
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        assertEq('Beaver', $r['body']['app_id'] ?? null, 'app_id');
    });
} finally {
    stopServer($procB2);
    @unlink($bootstrapB2);
    @unlink($dbPathB2);
}

// ============================================================
// B-4: GET /invoices/sync・GET /payments/sync
// ============================================================
echo "\n=== R-0144 B-4 GET /invoices/sync・GET /payments/sync ===\n";

$dbPathB4 = __DIR__ . '/test_r0144_b4_' . getmypid() . '.sqlite';
if (file_exists($dbPathB4)) unlink($dbPathB4);
makeTestDb($ROOT, $dbPathB4);

$pdoB4 = dbConn($dbPathB4);
$pdoB4->exec("INSERT INTO customers (name, access_customer_no) VALUES ('得意先29901', '29901')");
$custId = (int)$pdoB4->lastInsertId();
$pdoB4->exec("INSERT INTO customers (name, access_customer_no) VALUES ('得意先29902', '29902')");
$custId2 = (int)$pdoB4->lastInsertId();

$pdoB4->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, access_voucher_id) VALUES ('S-90001', 'sales', 'approved', $custId, '2026-09-01', 70001)");
$voucherId1 = (int)$pdoB4->lastInsertId();
$pdoB4->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, access_voucher_id) VALUES ('S-90002', 'sales', 'approved', $custId, '2026-09-02', 70002)");
$voucherId2 = (int)$pdoB4->lastInsertId();

$pdoB4->exec("INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date, invoice_total, access_receivable_id, access_cancelled_at, updated_at)
              VALUES ('I-90001', $custId, '2026-09-05', '2026-09-05', '2026-09-10', 6500, 80001, NULL, '2026-09-05 01:00:00')");
$invoiceId1 = (int)$pdoB4->lastInsertId();
$pdoB4->exec("INSERT INTO invoice_vouchers (invoice_id, voucher_id) VALUES ($invoiceId1, $voucherId1)");
$pdoB4->exec("INSERT INTO invoice_vouchers (invoice_id, voucher_id) VALUES ($invoiceId1, $voucherId2)");

$pdoB4->exec("INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date, invoice_total, access_receivable_id, access_cancelled_at, updated_at)
              VALUES ('I-90002', $custId2, '2026-09-06', '2026-09-06', '2026-09-11', 3000, 80002, '2026-09-12 10:00:00', '2026-09-06 02:00:00')");
$invoiceId2 = (int)$pdoB4->lastInsertId();

$pdoB4->exec("INSERT INTO payments (payment_no, customer_id, invoice_id, payment_date, amount, access_payment_no, origin, updated_at)
              VALUES ('P-90001', $custId, $invoiceId1, '2026-09-15', 6500, 90001, 'access', '2026-09-15 03:00:00')");
$pdoB4->exec("INSERT INTO payments (payment_no, customer_id, invoice_id, payment_date, amount, access_payment_no, origin, updated_at)
              VALUES ('P-90002', $custId2, $invoiceId2, '2026-09-16', 3000, 90002, 'access', '2026-09-16 04:00:00')");
$pdoB4 = null;

$bootstrapB4 = __DIR__ . '/_r0144_b4_bootstrap.php';
file_put_contents($bootstrapB4, "<?php\ndefine('DB_PATH', " . var_export($dbPathB4, true) . ");\n");
$portB4 = 18131;
$procB4 = null;
try {
    $procB4 = startServer($ROOT, $bootstrapB4, $portB4);

    runTest('/invoices/sync/anything は404', function () use ($portB4) {
        $r = httpJson($portB4, 'GET', '/invoices/sync/anything');
        assertTrue(str_contains($r['status'], '404'), 'expected 404 got: ' . $r['status']);
    });

    runTest('GET /invoices/sync は仕様どおりの項目を返す', function () use ($portB4, $voucherId1, $voucherId2) {
        $r = httpJson($portB4, 'GET', '/invoices/sync');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        $byReceivableId = [];
        foreach ($r['body']['invoices'] as $inv) { $byReceivableId[$inv['access_receivable_id']] = $inv; }
        assertTrue(isset($byReceivableId[80001]), 'access_receivable_id=80001が存在する');
        $inv1 = $byReceivableId[80001];
        assertEq(6500.0, (float)$inv1['amount'], 'amount = invoice_total');
        assertEq(null, $inv1['access_cancelled_at'], 'access_cancelled_at=null');
        assertEq('2026-09-05 10:00:00', $inv1['updated_at'], 'updated_at がJSTに変換される');
        sort($inv1['voucher_access_ids']);
        assertEq([70001, 70002], $inv1['voucher_access_ids'], 'voucher_access_idsに紐づく伝票が入る');

        $inv2 = $byReceivableId[80002];
        assertEq('2026-09-12 10:00:00', $inv2['access_cancelled_at'], 'access_cancelled_atはそのまま返る（JST変換しない）');
    });

    runTest('GET /invoices/sync?customer_access_no=29902 は該当得意先のみ返す', function () use ($portB4) {
        $r = httpJson($portB4, 'GET', '/invoices/sync?customer_access_no=29902');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        assertEq(1, count($r['body']['invoices']), '1件のみ');
        assertEq(80002, $r['body']['invoices'][0]['access_receivable_id'], '該当get意先の請求書');
    });

    runTest('GET /invoices/sync?updated_after=2026-09-05 19:00:00(JST) は境界より後のみ返す', function () use ($portB4) {
        // 80001のupdated_atはJST 10:00、80002はJST 11:00 相当。19:00指定だとどちらも含まれない境界チェック用に緩めた閾値で確認する。
        $r = httpJson($portB4, 'GET', '/invoices/sync?' . http_build_query(['updated_after' => '2026-09-06 10:30:00']));
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        $ids = array_column($r['body']['invoices'], 'access_receivable_id');
        assertTrue(in_array(80002, $ids, true), '80002(11:00 JST)は含まれる');
        assertTrue(!in_array(80001, $ids, true), '80001(10:00 JST)は境界前で含まれない');
    });

    runTest('GET /invoices/sync?updated_after が不正形式なら400', function () use ($portB4) {
        $r = httpJson($portB4, 'GET', '/invoices/sync?updated_after=not-a-date');
        assertTrue(str_contains($r['status'], '400'), 'expected 400 got: ' . $r['status']);
    });

    runTest('GET /invoices/sync?limit=1 はnext_cursor/next_cursor_atを含む', function () use ($portB4) {
        $r = httpJson($portB4, 'GET', '/invoices/sync?limit=1');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        assertEq(1, count($r['body']['invoices']), '1件のみ');
        assertTrue(isset($r['body']['next_cursor']), 'next_cursorが存在する');
        assertTrue(isset($r['body']['next_cursor_at']), 'next_cursor_atが存在する');

        $r2 = httpJson($portB4, 'GET', '/invoices/sync?limit=1&cursor=' . $r['body']['next_cursor']);
        assertTrue(count($r2['body']['invoices']) > 0, '次ページが取得できる');
        assertTrue($r2['body']['invoices'][0]['access_receivable_id'] !== $r['body']['invoices'][0]['access_receivable_id'], '別の請求書が返る');
    });

    runTest('/payments/sync/anything は404', function () use ($portB4) {
        $r = httpJson($portB4, 'GET', '/payments/sync/anything');
        assertTrue(str_contains($r['status'], '404'), 'expected 404 got: ' . $r['status']);
    });

    runTest('GET /payments/sync は仕様どおりの項目を返す', function () use ($portB4) {
        $r = httpJson($portB4, 'GET', '/payments/sync');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        $byPaymentNo = [];
        foreach ($r['body']['payments'] as $p) { $byPaymentNo[$p['access_payment_no']] = $p; }
        assertTrue(isset($byPaymentNo[90001]), 'access_payment_no=90001が存在する');
        $p1 = $byPaymentNo[90001];
        assertEq(6500.0, (float)$p1['amount'], 'amount');
        assertEq(80001, $p1['access_receivable_id'], '紐づく請求のaccess_receivable_id');
        assertEq('2026-09-15 12:00:00', $p1['updated_at'], 'updated_atがJSTに変換される');
    });

    runTest('GET /payments/sync?customer_access_no=29901 は該当得意先のみ返す', function () use ($portB4) {
        $r = httpJson($portB4, 'GET', '/payments/sync?customer_access_no=29901');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        assertEq(1, count($r['body']['payments']), '1件のみ');
        assertEq(90001, $r['body']['payments'][0]['access_payment_no']);
    });
} finally {
    stopServer($procB4);
    @unlink($bootstrapB4);
    @unlink($dbPathB4);
}

// ============================================================
// B-4 レビュー指摘: 入金登録・取消・復元でinvoices.updated_atが更新されること
// （GET /invoices/sync の updated_after フィルタが漏れないようにするため）
// ============================================================
echo "\n=== R-0144 B-4 入金の登録・取消・復元でinvoices.updated_atが更新されること ===\n";

$dbPathB4x = __DIR__ . '/test_r0144_b4x_' . getmypid() . '.sqlite';
if (file_exists($dbPathB4x)) unlink($dbPathB4x);
makeTestDb($ROOT, $dbPathB4x);

$pdoB4x = dbConn($dbPathB4x);
$pdoB4x->exec("INSERT INTO customers (name, access_customer_no) VALUES ('得意先B4x', '39901')");
$custIdX = (int)$pdoB4x->lastInsertId();
$pdoB4x->exec("INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date, invoice_total, payment_received, next_carry_forward, updated_at)
              VALUES ('I-B4X01', $custIdX, '2026-09-01', '2026-09-01', '2026-09-05', 10000, 0, 10000, '2020-01-01 00:00:00')");
$invoiceIdX = (int)$pdoB4x->lastInsertId();
$pdoB4x = null;

$staleUpdatedAt = '2020-01-01 00:00:00';
function setInvoiceUpdatedAtStale(string $dbPath, int $invoiceId, string $stale): void {
    $pdo = dbConn($dbPath);
    $pdo->exec("UPDATE invoices SET updated_at = '$stale' WHERE id = $invoiceId");
    $pdo = null;
}
function getInvoiceUpdatedAt(string $dbPath, int $invoiceId): ?string {
    $pdo = dbConn($dbPath);
    $val = $pdo->query("SELECT updated_at FROM invoices WHERE id = $invoiceId")->fetchColumn();
    $pdo = null;
    return $val === false ? null : $val;
}

$bootstrapB4x = __DIR__ . '/_r0144_b4x_bootstrap.php';
file_put_contents($bootstrapB4x, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPathB4x, true) . ");\n"
    . "define('BILLING_EDIT_ENABLED', true);\n"
);
$portB4x = 18135;
$procB4x = null;
$paymentIdX = null;
$historyIdX = null;
try {
    $procB4x = startServer($ROOT, $bootstrapB4x, $portB4x);

    runTest('入金登録(POST /payments)後、invoices.updated_atが更新される', function () use ($portB4x, $dbPathB4x, $custIdX, $invoiceIdX, $staleUpdatedAt, &$paymentIdX) {
        setInvoiceUpdatedAtStale($dbPathB4x, $invoiceIdX, $staleUpdatedAt);
        $r = httpJson($portB4x, 'POST', '/payments', [
            'customer_id' => $custIdX,
            'invoice_id'  => $invoiceIdX,
            'amount'      => 3000,
        ]);
        assertTrue(str_contains($r['status'], '201'), 'expected 201 got: ' . $r['status']);
        $paymentIdX = (int)$r['body']['id'];
        $updatedAt = getInvoiceUpdatedAt($dbPathB4x, $invoiceIdX);
        assertTrue($updatedAt !== $staleUpdatedAt, '入金登録後にinvoices.updated_atが更新される: ' . var_export($updatedAt, true));
    });

    runTest('入金取消(DELETE /payments/{id})後、invoices.updated_atが更新される', function () use ($portB4x, $dbPathB4x, $invoiceIdX, $staleUpdatedAt, &$paymentIdX, &$historyIdX) {
        setInvoiceUpdatedAtStale($dbPathB4x, $invoiceIdX, $staleUpdatedAt);
        $r = httpJson($portB4x, 'DELETE', '/payments/' . $paymentIdX);
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        $historyIdX = (int)($r['body']['history_id'] ?? 0);
        assertTrue($historyIdX > 0, 'history_idが返る');
        $updatedAt = getInvoiceUpdatedAt($dbPathB4x, $invoiceIdX);
        assertTrue($updatedAt !== $staleUpdatedAt, '入金取消後にinvoices.updated_atが更新される: ' . var_export($updatedAt, true));
    });

    runTest('入金復元(POST /history/{id}/restore)後、invoices.updated_atが更新される', function () use ($portB4x, $dbPathB4x, $invoiceIdX, $staleUpdatedAt, &$historyIdX) {
        setInvoiceUpdatedAtStale($dbPathB4x, $invoiceIdX, $staleUpdatedAt);
        $r = httpJson($portB4x, 'POST', '/history/' . $historyIdX . '/restore');
        assertTrue(str_contains($r['status'], '201'), 'expected 201 got: ' . $r['status']);
        $updatedAt = getInvoiceUpdatedAt($dbPathB4x, $invoiceIdX);
        assertTrue($updatedAt !== $staleUpdatedAt, '入金復元後にinvoices.updated_atが更新される: ' . var_export($updatedAt, true));
    });
} finally {
    stopServer($procB4x);
    @unlink($bootstrapB4x);
    @unlink($dbPathB4x);
    @unlink($dbPathB4x . '-wal');
    @unlink($dbPathB4x . '-shm');
}

// ============================================================
// B-1: スナップショット保存・復元・一覧
// ============================================================
echo "\n=== R-0144 B-1 Beaver_betaスナップショット保存・復元 ===\n";

$betaSnapshotDir = $ROOT . '/beta_snapshots';
$snapshotName = 'test_r0144_' . getmypid();
$snapshotFile = $betaSnapshotDir . '/' . $snapshotName . '.sqlite';

// --- (1) 歯止め: 何も有効化されていない（本番相当） ---
$dbPathGuard = __DIR__ . '/test_r0144_guard_' . getmypid() . '.sqlite';
if (file_exists($dbPathGuard)) unlink($dbPathGuard);
makeTestDb($ROOT, $dbPathGuard);
$bootstrapGuard = __DIR__ . '/_r0144_guard_bootstrap.php';
file_put_contents($bootstrapGuard, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPathGuard, true) . ");\n"
    . "define('SYNC_API_TOKEN', 'unit-test-sync-token');\n"
);
$portGuard = 18132;
$procGuard = null;
try {
    $procGuard = startServer($ROOT, $bootstrapGuard, $portGuard);

    runTest('トークン無しの POST /admin/snapshot/save は401', function () use ($portGuard) {
        $r = httpJson($portGuard, 'POST', '/admin/snapshot/save', ['name' => 'x']);
        assertTrue(str_contains($r['status'], '401'), 'expected 401 got: ' . $r['status']);
    });

    runTest('受入条件2: 本番相当(BETA_SNAPSHOT_ENABLED未設定)は403 beta_snapshot_disabled', function () use ($portGuard) {
        $r = httpJson($portGuard, 'POST', '/admin/snapshot/save', ['name' => 'x'], ['Authorization: Bearer unit-test-sync-token']);
        assertTrue(str_contains($r['status'], '403'), 'expected 403 got: ' . $r['status']);
        assertEq('beta_snapshot_disabled', $r['body']['error'] ?? null, 'error body');
    });
} finally {
    stopServer($procGuard);
    @unlink($bootstrapGuard);
    @unlink($dbPathGuard);
}

// --- (2) 歯止め: BETA_SNAPSHOT_ENABLED=1 + APP_ID=Beaver_beta だがDBパスにBeaver_betaを含まない ---
$dbPathGuard3 = __DIR__ . '/test_r0144_guard3_plain_' . getmypid() . '.sqlite';
if (file_exists($dbPathGuard3)) unlink($dbPathGuard3);
makeTestDb($ROOT, $dbPathGuard3);
$bootstrapGuard3 = __DIR__ . '/_r0144_guard3_bootstrap.php';
file_put_contents($bootstrapGuard3, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPathGuard3, true) . ");\n"
    . "define('APP_ID', 'Beaver_beta');\n"
    . "putenv('BETA_SNAPSHOT_ENABLED=1');\n"
    . "define('SYNC_API_TOKEN', 'unit-test-sync-token');\n"
);
$portGuard3 = 18133;
$procGuard3 = null;
try {
    $procGuard3 = startServer($ROOT, $bootstrapGuard3, $portGuard3);

    runTest('環境変数・APP_IDは満たすがDBパスにBeaver_betaを含まない場合は403', function () use ($portGuard3) {
        $r = httpJson($portGuard3, 'POST', '/admin/snapshot/save', ['name' => 'x'], ['Authorization: Bearer unit-test-sync-token'], '/contents/Beaver_beta/api');
        assertTrue(str_contains($r['status'], '403'), 'expected 403 got: ' . $r['status']);
        assertEq('beta_snapshot_disabled', $r['body']['error'] ?? null, 'error body');
    });
} finally {
    stopServer($procGuard3);
    @unlink($bootstrapGuard3);
    @unlink($dbPathGuard3);
}

// --- (3) 正常系: 3つの歯止め全て満たす ---
$dbPathOk = __DIR__ . '/test_r0144_snapshot_ok_Beaver_beta_' . getmypid() . '.sqlite';
if (file_exists($dbPathOk)) unlink($dbPathOk);
makeTestDb($ROOT, $dbPathOk);
$pdoSeed = dbConn($dbPathOk);
$pdoSeed->exec("INSERT INTO customers (name, access_customer_no) VALUES ('スナップショット前得意先', '1')");
$pdoSeed = null;

$bootstrapOk = __DIR__ . '/_r0144_ok_bootstrap.php';
file_put_contents($bootstrapOk, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPathOk, true) . ");\n"
    . "define('APP_ID', 'Beaver_beta');\n"
    . "putenv('BETA_SNAPSHOT_ENABLED=1');\n"
    . "define('SYNC_API_TOKEN', 'unit-test-sync-token');\n"
);
$portOk = 18134;
$procOk = null;
try {
    $procOk = startServer($ROOT, $bootstrapOk, $portOk);

    runTest('name不正値（記号混入）は400', function () use ($portOk) {
        $r = httpJson($portOk, 'POST', '/admin/snapshot/save', ['name' => '../evil'], ['Authorization: Bearer unit-test-sync-token'], '/contents/Beaver_beta/api');
        assertTrue(str_contains($r['status'], '400'), 'expected 400 got: ' . $r['status']);
    });

    runTest('受入条件3: 3つの歯止めを全て満たすとPOST /admin/snapshot/saveは200でファイルが作成される', function () use ($portOk, $snapshotName, $snapshotFile) {
        $r = httpJson($portOk, 'POST', '/admin/snapshot/save', ['name' => $snapshotName], ['Authorization: Bearer unit-test-sync-token'], '/contents/Beaver_beta/api');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        assertEq($snapshotName, $r['body']['name'] ?? null, 'name');
        assertTrue(file_exists($snapshotFile), 'スナップショットファイルが作成される');
    });

    runTest('GET /admin/snapshot/list に保存したスナップショットが含まれる', function () use ($portOk, $snapshotName) {
        $r = httpJson($portOk, 'GET', '/admin/snapshot/list', null, ['Authorization: Bearer unit-test-sync-token'], '/contents/Beaver_beta/api');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        $names = array_column($r['body']['snapshots'], 'name');
        assertTrue(in_array($snapshotName, $names, true), '一覧に含まれる');
    });

    runTest('受入条件4: DBに変更を加えた後restoreすると保存時点の状態に戻る', function () use ($portOk, $snapshotName, $dbPathOk) {
        // 保存後にDBへ変更を加える
        $pdo = dbConn($dbPathOk);
        $pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('restore前に追加された得意先', '999')");
        $countBeforeRestore = (int)$pdo->query('SELECT COUNT(*) FROM customers')->fetchColumn();
        $pdo = null;
        assertTrue($countBeforeRestore >= 2, '変更が反映されている');

        $r = httpJson($portOk, 'POST', '/admin/snapshot/restore', ['name' => $snapshotName], ['Authorization: Bearer unit-test-sync-token'], '/contents/Beaver_beta/api');
        assertTrue(str_contains($r['status'], '200'), 'expected 200 got: ' . $r['status']);
        assertEq(true, $r['body']['restored'] ?? null, 'restored');

        $pdo2 = dbConn($dbPathOk);
        $countAfterRestore = (int)$pdo2->query('SELECT COUNT(*) FROM customers')->fetchColumn();
        $names = $pdo2->query('SELECT name FROM customers')->fetchAll(PDO::FETCH_COLUMN);
        $pdo2 = null;
        assertEq(1, $countAfterRestore, '保存時点の1件に戻る');
        assertTrue(!in_array('restore前に追加された得意先', $names, true), 'restore後の追加分は消えている');
    });

    runTest('存在しないスナップショット名のrestoreは404', function () use ($portOk) {
        $r = httpJson($portOk, 'POST', '/admin/snapshot/restore', ['name' => 'no_such_snapshot_xyz'], ['Authorization: Bearer unit-test-sync-token'], '/contents/Beaver_beta/api');
        assertTrue(str_contains($r['status'], '404'), 'expected 404 got: ' . $r['status']);
    });
} finally {
    stopServer($procOk);
    @unlink($bootstrapOk);
    @unlink($dbPathOk);
    @unlink($dbPathOk . '-wal');
    @unlink($dbPathOk . '-shm');
    @unlink($snapshotFile);
}

// ============================================================
// 結果サマリ
// ============================================================
echo "\n========================================\n";
echo "PASSED: $passed\n";
echo "FAILED: $failed\n";
if ($failed > 0) {
    echo "----- failures -----\n";
    foreach ($failures as $f) echo " - $f\n";
    exit(1);
}
exit(0);
