<?php
/**
 * R-0143 A-B-02 単体・統合テスト
 *
 * 起動: php api/tests/test_vouchers_billed_lock.php
 *
 * - migration 030（access_billed_flag/access_billing_date/access_receivable_id）を前提に、
 *   Accessで請求済みの伝票がBeaver側で編集できないことを検証する。
 * - php ビルトインサーバを起動して実際にHTTPで叩く（test_projects_sync.php と同じ方式）
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_vouchers_billed_lock_' . getmypid() . '.sqlite';
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

$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先', '100')");
$customerId = (int)$pdo->lastInsertId();

function createVoucher(
    PDO $pdo, int $customerId, string $voucherNo,
    string $status = 'approved', int $accessBilledFlag = 0, ?string $accessBillingDate = null
): int {
    $stmt = $pdo->prepare("
        INSERT INTO vouchers
            (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type,
             access_billed_flag, access_billing_date)
        VALUES (?, 'sales', ?, ?, '2026-09-01', 'exclusive', ?, ?)
    ");
    $stmt->execute([$voucherNo, $status, $customerId, $accessBilledFlag, $accessBillingDate]);
    return (int)$pdo->lastInsertId();
}

function createLine(PDO $pdo, int $voucherId, int $lineNo = 1): int {
    $pdo->prepare("
        INSERT INTO voucher_lines
            (voucher_id, line_no, line_type, item_name, quantity, price_body, line_total, tax_category, source, updated_at)
        VALUES (?, ?, 'normal', '編集前', 1, 1000, 1000, '課税', 'beaver', CURRENT_TIMESTAMP)
    ")->execute([$voucherId, $lineNo]);
    return (int)$pdo->lastInsertId();
}

$voucherBilled  = createVoucher($pdo, $customerId, 'S-LOCKED-001', 'approved', 1, '2026-09-10');
$lineBilled     = createLine($pdo, $voucherBilled, 1);
$voucherNormal  = createVoucher($pdo, $customerId, 'S-NORMAL-001', 'approved', 0, null);
$voucherForInv  = createVoucher($pdo, $customerId, 'S-LOCKED-002', 'approved', 1, '2026-09-11');

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

// ============================================================
// HTTP サーバ起動
// ============================================================
// R-0143 A-B-05: 請求・入金編集の封印フラグは既定falseだが、本テストはA-B-02の
// locked_by_accessロックを検証する回帰テストのためBILLING_EDIT_ENABLEDをtrueにする
// （A-B-05自体の検証はtest_billing_edit_disabled.phpが担う）
$bootstrap = __DIR__ . '/_server_bootstrap_billed_lock.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\ndefine('BILLING_EDIT_ENABLED', true);\n");

$port = 18099;
$serverProc = proc_open(
    [
        'php',
        '-d', 'auto_prepend_file=' . $bootstrap,
        '-S', "127.0.0.1:$port",
        '-t', $ROOT,
        $ROOT . '/index.php',
    ],
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
    $r   = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
    if ($r !== false) { $ready = true; break; }
}

/** @return array{status:string, body:mixed} */
function httpJson(int $port, string $method, string $path, ?array $body = null): array {
    $opts = [
        'method'  => $method,
        'header'  => "Content-Type: application/json\r\nConnection: close\r\n",
        'ignore_errors' => true,
        'timeout' => 5,
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

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0143 A-B-02 (1) PUT/PATCH/DELETE /vouchers/{id}・明細操作が409 ===\n";

    runTest('PUT /vouchers/{id} は locked_by_access で409', function () use ($port, $voucherBilled) {
        $r = httpJson($port, 'PUT', "/vouchers/$voucherBilled", ['memo' => '変更されない']);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('locked_by_access', $r['body']['error'] ?? null, 'error');
        assertEq('2026-09-10', $r['body']['billing_date'] ?? null, 'billing_date');
    });

    runTest('POST /vouchers/{id}/lines（明細追加）は locked_by_access で409', function () use ($port, $voucherBilled) {
        $r = httpJson($port, 'POST', "/vouchers/$voucherBilled/lines", ['item_name' => '追加行']);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('locked_by_access', $r['body']['error'] ?? null, 'error');
    });

    runTest('PUT /vouchers/{id}/lines/{lineId}（明細更新）は locked_by_access で409', function () use ($port, $voucherBilled, $lineBilled) {
        $r = httpJson($port, 'PUT', "/vouchers/$voucherBilled/lines/$lineBilled", ['item_name' => '変更されない']);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('locked_by_access', $r['body']['error'] ?? null, 'error');
    });

    runTest('DELETE /vouchers/{id}/lines/{lineId}（明細削除）は locked_by_access で409', function () use ($pdo, $port, $voucherBilled, $lineBilled) {
        $r = httpJson($port, 'DELETE', "/vouchers/$voucherBilled/lines/$lineBilled");
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('locked_by_access', $r['body']['error'] ?? null, 'error');
        $exists = $pdo->query("SELECT COUNT(*) FROM voucher_lines WHERE id = $lineBilled")->fetchColumn();
        assertEq('1', (string)$exists, '明細は削除されていない');
    });

    runTest('DELETE /vouchers/{id} は locked_by_access で409', function () use ($pdo, $port, $voucherBilled) {
        $r = httpJson($port, 'DELETE', "/vouchers/$voucherBilled");
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('locked_by_access', $r['body']['error'] ?? null, 'error');
        $status = $pdo->query("SELECT status FROM vouchers WHERE id = $voucherBilled")->fetchColumn();
        assertEq('approved', $status, 'statusはvoidにならず変化しない');
    });

    runTest('通常伝票（access_billed_flag=0）はPUTが通常どおり成功する（回帰確認）', function () use ($port, $voucherNormal) {
        $r = httpJson($port, 'PUT', "/vouchers/$voucherNormal", ['memo' => '通常編集']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
    });

    echo "\n=== R-0143 A-B-02 (2) POST /invoices の voucher_ids ロック ===\n";

    runTest('voucher_idsにaccess_billed_flag=1を含むとlocked_by_accessで409になり、請求書が作られない', function () use ($pdo, $port, $customerId, $voucherForInv) {
        $before = (int)$pdo->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
        $r = httpJson($port, 'POST', '/invoices', [
            'customer_id'   => $customerId,
            'invoice_total' => 1000,
            'voucher_ids'   => [$voucherForInv],
        ]);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('locked_by_access', $r['body']['error'] ?? null, 'error');
        assertEq('2026-09-11', $r['body']['billing_date'] ?? null, 'billing_date');
        $after = (int)$pdo->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
        assertEq($before, $after, '請求書が作成されていない');
    });

    echo "\n=== R-0143 A-B-02 (3) DELETE /invoices/{id}・POST /history/{id}/restore がaccess_billed_flag=1伝票のstatusを変えない ===\n";

    runTest('DELETE /invoices/{id} はaccess_billed_flag=1の伝票のstatus/flagを変更しない', function () use ($pdo, $port, $customerId, $voucherForInv) {
        // 通常のPOST /invoicesはガードで拒否されるため、既存データ（Access側で請求済みの状態で
        // 何らかの経緯でinvoice_vouchersに紐づいてしまったレガシーケース）を直接SQLで再現する。
        $stmt = $pdo->prepare("
            INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date,
                                   carry_forward, sales_total, tax_total, payment_received, invoice_total, next_carry_forward)
            VALUES ('I-TEST-901', ?, '2026-09-01', '2026-09-01', '2026-09-11', 0, 1000, 0, 0, 1000, 1000)
        ");
        $stmt->execute([$customerId]);
        $invoiceId = (int)$pdo->lastInsertId();
        $pdo->prepare('INSERT INTO invoice_vouchers (invoice_id, voucher_id) VALUES (?, ?)')
            ->execute([$invoiceId, $voucherForInv]);

        $r = httpJson($port, 'DELETE', "/invoices/$invoiceId");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);

        $voucher = $pdo->query("SELECT status, access_billed_flag FROM vouchers WHERE id = $voucherForInv")->fetch();
        assertEq('approved', $voucher['status'], 'DELETE後もstatusはapprovedのまま（approvedへの巻き戻しも発生しない）');
        assertEq(1, (int)$voucher['access_billed_flag'], 'DELETE後もaccess_billed_flag=1のまま');

        // 直後に作られたrecord_historyのdelete行を取得しておく（次のrestoreテストで使う）
        $GLOBALS['__histIdForRestoreTest'] = (int)$pdo->query(
            "SELECT id FROM record_history WHERE entity='invoices' AND entity_id=$invoiceId AND action='delete' ORDER BY id DESC LIMIT 1"
        )->fetchColumn();
        assertTrue($GLOBALS['__histIdForRestoreTest'] > 0, 'delete履歴が記録されている');
    });

    runTest('POST /history/{id}/restore はaccess_billed_flag=1の伝票のstatus/flagを変更しない', function () use ($pdo, $port, $voucherForInv) {
        $histId = $GLOBALS['__histIdForRestoreTest'];
        $r = httpJson($port, 'POST', "/history/$histId/restore", []);
        assertTrue(str_contains($r['status'], '200') || str_contains($r['status'], '201'), 'HTTP 200/201: ' . $r['status']);

        $voucher = $pdo->query("SELECT status, access_billed_flag FROM vouchers WHERE id = $voucherForInv")->fetch();
        assertEq('approved', $voucher['status'], 'restore後もstatusはapprovedのまま（billedへ書き換わらない）');
        assertEq(1, (int)$voucher['access_billed_flag'], 'restore後もaccess_billed_flag=1のまま');
    });

    echo "\n=== R-0143 A-B-02 (4) GET /vouchers/sync に access_billed_flag が含まれる ===\n";

    runTest('GET /vouchers/sync の各伝票にaccess_billed_flagが含まれ、値が正しい', function () use ($port, $voucherBilled, $voucherNormal) {
        $r = httpJson($port, 'GET', '/vouchers/sync');
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $rows = $r['body']['vouchers'] ?? [];
        $byId = [];
        foreach ($rows as $row) { $byId[(int)$row['id']] = $row; }

        assertTrue(array_key_exists($voucherBilled, $byId), '請求済み伝票が応答に含まれる');
        assertTrue(array_key_exists('access_billed_flag', $byId[$voucherBilled]), 'access_billed_flagキーが存在する');
        assertEq(1, (int)$byId[$voucherBilled]['access_billed_flag'], '請求済み伝票はaccess_billed_flag=1');

        assertTrue(array_key_exists($voucherNormal, $byId), '通常伝票が応答に含まれる');
        assertEq(0, (int)$byId[$voucherNormal]['access_billed_flag'], '通常伝票はaccess_billed_flag=0');
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
echo "\n========================================\n";
echo "PASSED: $passed\n";
echo "FAILED: $failed\n";
if ($failed > 0) {
    echo "----- failures -----\n";
    foreach ($failures as $f) echo " - $f\n";
    exit(1);
}
@unlink($testDbPath);
exit(0);
