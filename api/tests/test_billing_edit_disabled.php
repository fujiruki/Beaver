<?php
/**
 * R-0143 A-B-05 請求・入金編集の封印テスト
 *
 * 起動: php api/tests/test_billing_edit_disabled.php
 *
 * BILLING_EDIT_ENABLED=false（既定）で以下6経路が409になり、
 * true では従来どおり動作することを、php ビルトインサーバへの実HTTPリクエストで検証する
 * （test_vouchers_billed_lock.php と同じ方式）。
 *   - POST /invoices
 *   - DELETE /invoices/{id}
 *   - POST /payments
 *   - DELETE /payments/{id}
 *   - POST /history/{id}/restore（対象が請求書・入金の場合のみ）
 *   - PATCH /customers/{id}/carry-forward
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
        throw new RuntimeException(sprintf(
            "%s expected=%s actual=%s",
            $label,
            var_export($expected, true),
            var_export($actual, true)
        ));
    }
}

function assertTrue(bool $cond, string $label = ''): void {
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

/** @return array{status:string, body:mixed} */
function httpJson(int $port, string $method, string $path, ?array $body = null): array {
    $opts = [
        'method'        => $method,
        'header'        => "Content-Type: application/json\r\nConnection: close\r\n",
        'ignore_errors' => true,
        'timeout'       => 5,
    ];
    if ($body !== null) {
        $opts['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    $ctx = stream_context_create(['http' => $opts]);
    $rawBody = false; $hdr = [];
    for ($t = 0; $t < 3 && $rawBody === false; $t++) {
        if ($t > 0) usleep(200000);
        $rawBody = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
        if (isset($http_response_header)) $hdr = $http_response_header;
    }
    return [
        'status' => $hdr[0] ?? '',
        'body'   => json_decode((string)$rawBody, true),
    ];
}

/** テスト用の得意先・伝票・請求書・入金・履歴を用意する */
function seedFixtures(PDO $pdo): array {
    $custId = (int)$pdo->query("
        INSERT INTO customers (name, carry_forward_balance, is_active) VALUES ('テスト得意先', 1000, 1) RETURNING id
    ")->fetchColumn();

    $vStmt = $pdo->prepare("
        INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type)
        VALUES (?, 'sales', 'approved', ?, '2026-09-01', 'exclusive')
    ");
    $vStmt->execute(['S-BED-001', $custId]);
    $voucherId = (int)$pdo->lastInsertId();

    $invStmt = $pdo->prepare("
        INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date,
                               carry_forward, sales_total, tax_total, payment_received, invoice_total, next_carry_forward)
        VALUES ('I-BED-001', ?, '2026-09-01', '2026-09-01', '2026-09-11', 0, 1000, 0, 0, 1000, 1000)
    ");
    $invStmt->execute([$custId]);
    $invId = (int)$pdo->lastInsertId();

    $payStmt = $pdo->prepare("
        INSERT INTO payments (payment_no, customer_id, invoice_id, payment_date, amount, payment_type)
        VALUES ('P-BED-001', ?, ?, '2026-09-05', 500, '現金')
    ");
    $payStmt->execute([$custId, $invId]);
    $payId = (int)$pdo->lastInsertId();

    $histStmt = $pdo->prepare('INSERT INTO record_history (entity, entity_id, action, before_json) VALUES (?, ?, ?, ?)');
    $invBefore = json_encode(['row' => ['id' => $invId, 'customer_id' => $custId], 'related' => ['voucher_ids' => []]], JSON_UNESCAPED_UNICODE);
    $histStmt->execute(['invoices', $invId, 'delete', $invBefore]);
    $invHistId = (int)$pdo->lastInsertId();

    $custRow = $pdo->query("SELECT * FROM customers WHERE id = $custId")->fetch();
    $custBefore = json_encode(['row' => $custRow, 'related' => []], JSON_UNESCAPED_UNICODE);
    $histStmt->execute(['customers', $custId, 'update', $custBefore]);
    $custHistId = (int)$pdo->lastInsertId();

    return compact('custId', 'voucherId', 'invId', 'payId', 'invHistId', 'custHistId');
}

// ============================================================
// テスト本体
// ============================================================

$dbFalse = __DIR__ . '/test_billing_edit_disabled_false_' . getmypid() . '.sqlite';
$dbTrue  = __DIR__ . '/test_billing_edit_disabled_true_' . getmypid() . '.sqlite';
foreach ([$dbFalse, $dbTrue] as $p) { if (file_exists($p)) unlink($p); }
makeTestDb($ROOT, $dbFalse);
makeTestDb($ROOT, $dbTrue);

$pdoFalse = new PDO('sqlite:' . $dbFalse, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$pdoTrue  = new PDO('sqlite:' . $dbTrue,  null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$fxFalse = seedFixtures($pdoFalse);
$fxTrue  = seedFixtures($pdoTrue);

$bootstrapFalse = __DIR__ . '/_bootstrap_billing_disabled_false.php';
file_put_contents($bootstrapFalse, "<?php\ndefine('DB_PATH', " . var_export($dbFalse, true) . ");\ndefine('BILLING_EDIT_ENABLED', false);\n");
$bootstrapTrue = __DIR__ . '/_bootstrap_billing_disabled_true.php';
file_put_contents($bootstrapTrue, "<?php\ndefine('DB_PATH', " . var_export($dbTrue, true) . ");\ndefine('BILLING_EDIT_ENABLED', true);\n");

$portFalse = 18103;
$portTrue  = 18104;
$procFalse = null;
$procTrue  = null;

try {
    $procFalse = startServer($ROOT, $bootstrapFalse, $portFalse);
    $procTrue  = startServer($ROOT, $bootstrapTrue, $portTrue);

    echo "=== R-0143 A-B-05 BILLING_EDIT_ENABLED=false: 6経路が409 ===\n";

    runTest('POST /invoices は billing_edit_disabled で409、作成されない', function () use ($pdoFalse, $portFalse, $fxFalse) {
        $before = (int)$pdoFalse->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
        $r = httpJson($portFalse, 'POST', '/invoices', [
            'customer_id' => $fxFalse['custId'],
            'invoice_total' => 500,
            'voucher_ids' => [$fxFalse['voucherId']],
        ]);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('billing_edit_disabled', $r['body']['error'] ?? null, 'error');
        $after = (int)$pdoFalse->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
        assertEq($before, $after, '請求書が作成されていない');
    });

    runTest('DELETE /invoices/{id} は billing_edit_disabled で409、削除されない', function () use ($pdoFalse, $portFalse, $fxFalse) {
        $r = httpJson($portFalse, 'DELETE', "/invoices/{$fxFalse['invId']}");
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('billing_edit_disabled', $r['body']['error'] ?? null, 'error');
        $exists = (int)$pdoFalse->query("SELECT COUNT(*) FROM invoices WHERE id = {$fxFalse['invId']}")->fetchColumn();
        assertEq(1, $exists, '請求書は削除されていない');
    });

    runTest('POST /payments は billing_edit_disabled で409、作成されない', function () use ($pdoFalse, $portFalse, $fxFalse) {
        $before = (int)$pdoFalse->query('SELECT COUNT(*) FROM payments')->fetchColumn();
        $r = httpJson($portFalse, 'POST', '/payments', [
            'customer_id' => $fxFalse['custId'],
            'invoice_id'  => $fxFalse['invId'],
            'amount'      => 100,
        ]);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('billing_edit_disabled', $r['body']['error'] ?? null, 'error');
        $after = (int)$pdoFalse->query('SELECT COUNT(*) FROM payments')->fetchColumn();
        assertEq($before, $after, '入金が作成されていない');
    });

    runTest('DELETE /payments/{id} は billing_edit_disabled で409、削除されない', function () use ($pdoFalse, $portFalse, $fxFalse) {
        $r = httpJson($portFalse, 'DELETE', "/payments/{$fxFalse['payId']}");
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('billing_edit_disabled', $r['body']['error'] ?? null, 'error');
        $exists = (int)$pdoFalse->query("SELECT COUNT(*) FROM payments WHERE id = {$fxFalse['payId']}")->fetchColumn();
        assertEq(1, $exists, '入金は削除されていない');
    });

    runTest('POST /history/{id}/restore（対象: 請求書）は billing_edit_disabled で409', function () use ($portFalse, $fxFalse) {
        $r = httpJson($portFalse, 'POST', "/history/{$fxFalse['invHistId']}/restore", []);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('billing_edit_disabled', $r['body']['error'] ?? null, 'error');
    });

    runTest('POST /history/{id}/restore（対象: 得意先更新）は影響を受けず通常どおり動作する', function () use ($portFalse, $fxFalse) {
        $r = httpJson($portFalse, 'POST', "/history/{$fxFalse['custHistId']}/restore", []);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
    });

    runTest('PATCH /customers/{id}/carry-forward は billing_edit_disabled で409、変更されない', function () use ($pdoFalse, $portFalse, $fxFalse) {
        $r = httpJson($portFalse, 'PATCH', "/customers/{$fxFalse['custId']}/carry-forward", ['carry_forward_balance' => 9999]);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('billing_edit_disabled', $r['body']['error'] ?? null, 'error');
        $bal = (float)$pdoFalse->query("SELECT carry_forward_balance FROM customers WHERE id = {$fxFalse['custId']}")->fetchColumn();
        assertEq(1000.0, $bal, '繰越残高は変更されていない');
    });

    echo "\n=== R-0143 A-B-05 BILLING_EDIT_ENABLED=true: 従来どおり動作する（回帰確認） ===\n";

    $createdInvoiceId = null;
    $createdPaymentId = null;

    runTest('POST /invoices は従来どおり201で作成される', function () use ($portTrue, $fxTrue, &$createdInvoiceId) {
        $r = httpJson($portTrue, 'POST', '/invoices', [
            'customer_id' => $fxTrue['custId'],
            'invoice_total' => 500,
            'voucher_ids' => [$fxTrue['voucherId']],
        ]);
        assertTrue(str_contains($r['status'], '201'), 'HTTP 201: ' . $r['status']);
        $createdInvoiceId = (int)$r['body']['id'];
        assertTrue($createdInvoiceId > 0, '請求書idが返る');
    });

    runTest('POST /payments は従来どおり201で作成される', function () use ($portTrue, $fxTrue, &$createdPaymentId) {
        $r = httpJson($portTrue, 'POST', '/payments', [
            'customer_id' => $fxTrue['custId'],
            'amount'      => 100,
        ]);
        assertTrue(str_contains($r['status'], '201'), 'HTTP 201: ' . $r['status']);
        $createdPaymentId = (int)$r['body']['id'];
        assertTrue($createdPaymentId > 0, '入金idが返る');
    });

    runTest('DELETE /payments/{id} は従来どおり200で削除される', function () use ($portTrue, &$createdPaymentId) {
        $r = httpJson($portTrue, 'DELETE', "/payments/{$createdPaymentId}");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
    });

    runTest('DELETE /invoices/{id} は従来どおり200で削除され、復元用履歴が積まれる', function () use ($pdoTrue, $portTrue, &$createdInvoiceId) {
        $r = httpJson($portTrue, 'DELETE', "/invoices/{$createdInvoiceId}");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $histId = (int)$pdoTrue->query("SELECT id FROM record_history WHERE entity='invoices' AND entity_id={$createdInvoiceId} AND action='delete' ORDER BY id DESC LIMIT 1")->fetchColumn();
        assertTrue($histId > 0, '削除履歴が記録されている');
        $GLOBALS['__createdInvoiceHistId'] = $histId;
    });

    runTest('POST /history/{id}/restore（対象: 請求書）は従来どおり成功する', function () use ($portTrue) {
        $histId = $GLOBALS['__createdInvoiceHistId'];
        $r = httpJson($portTrue, 'POST', "/history/{$histId}/restore", []);
        assertTrue(str_contains($r['status'], '200') || str_contains($r['status'], '201'), 'HTTP 200/201: ' . $r['status']);
    });

    runTest('PATCH /customers/{id}/carry-forward は従来どおり200で更新される', function () use ($pdoTrue, $portTrue, $fxTrue) {
        $r = httpJson($portTrue, 'PATCH', "/customers/{$fxTrue['custId']}/carry-forward", ['carry_forward_balance' => 2500]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $bal = (float)$pdoTrue->query("SELECT carry_forward_balance FROM customers WHERE id = {$fxTrue['custId']}")->fetchColumn();
        assertEq(2500.0, $bal, '繰越残高が更新される');
    });

} finally {
    foreach ([$procFalse, $procTrue] as $proc) {
        if (is_resource($proc)) { proc_terminate($proc); proc_close($proc); }
    }
    @unlink($bootstrapFalse);
    @unlink($bootstrapTrue);
    @unlink($dbFalse);
    @unlink($dbTrue);
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
