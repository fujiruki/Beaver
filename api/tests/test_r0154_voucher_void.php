<?php
/**
 * R-0154 画面からの伝票取消（理由・履歴を残す／空の伝票は物理削除）
 *
 * 起動: php api/tests/test_r0154_voucher_void.php
 *
 * 受け入れ条件1〜10（docs/spec/R-0154_voucher_void_reason_history.md）を検証する。
 * php ビルトインサーバを起動して実際にHTTPで叩く（test_vouchers_billed_lock.php と同じ方式）。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_r0154_voucher_void_' . getmypid() . '.sqlite';
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

require_once $ROOT . '/routes/sync_helpers.php';

$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先', '100')");
$customerId = (int)$pdo->lastInsertId();

const OLD_TS = '2020-01-01 00:00:00';

function createVoucher(PDO $pdo, array $o = []): int {
    static $seq = 0;
    $seq++;
    $stmt = $pdo->prepare("
        INSERT INTO vouchers
            (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type, description,
             total_amount, access_voucher_id, access_billed_flag, source_voucher_id, source_estimate_no, updated_at)
        VALUES (?, ?, ?, ?, '2026-10-01', 'exclusive', ?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $o['voucher_no'] ?? sprintf('S-R0154-%03d', $seq),
        $o['voucher_type'] ?? 'sales',
        $o['status'] ?? 'draft',
        $o['customer_id'] ?? null,
        $o['description'] ?? null,
        $o['total_amount'] ?? 0,
        $o['access_voucher_id'] ?? null,
        $o['access_billed_flag'] ?? 0,
        $o['source_voucher_id'] ?? null,
        $o['source_estimate_no'] ?? null,
        OLD_TS,
    ]);
    return (int)$pdo->lastInsertId();
}

function createLine(PDO $pdo, int $voucherId, ?string $itemName, float $quantity = 1, float $price = 0, float $lineTotal = 0): int {
    static $lineNo = 0;
    $lineNo++;
    $pdo->prepare("
        INSERT INTO voucher_lines
            (voucher_id, line_no, line_type, item_name, quantity, price_body, line_total, tax_category)
        VALUES (?, ?, 'normal', ?, ?, ?, ?, '課税')
    ")->execute([$voucherId, $lineNo, $itemName, $quantity, $price, $lineTotal]);
    return (int)$pdo->lastInsertId();
}

function voucherRow(PDO $pdo, int $id): ?array {
    $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $s->execute([$id]);
    $r = $s->fetch();
    return $r ?: null;
}

function lineCount(PDO $pdo, int $voucherId): int {
    $s = $pdo->prepare('SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = ?');
    $s->execute([$voucherId]);
    return (int)$s->fetchColumn();
}

function historyRows(PDO $pdo, int $voucherId): array {
    $s = $pdo->prepare("SELECT * FROM record_history WHERE entity = 'vouchers' AND entity_id = ? ORDER BY id");
    $s->execute([$voucherId]);
    return $s->fetchAll();
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
$bootstrap = __DIR__ . '/_server_bootstrap_r0154.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18154;
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

function getIsEmpty(int $port, int $id): mixed {
    $r = httpJson($port, 'GET', "/vouchers/$id");
    assertTrue(str_contains($r['status'], '200'), 'GET 200: ' . $r['status']);
    assertTrue(is_array($r['body']) && array_key_exists('is_empty', $r['body']), 'GETにis_emptyがある');
    return $r['body']['is_empty'];
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0154 中身ありの伝票の取消 ===\n";

    runTest('1. 中身あり＋理由 → void・updated_at前進・履歴1件（理由と前後）', function () use ($pdo, $port, $customerId) {
        $id = createVoucher($pdo, ['customer_id' => $customerId, 'total_amount' => 11000]);
        createLine($pdo, $id, '框戸', 1, 10000, 10000);
        assertEq(false, getIsEmpty($port, $id), 'is_empty');

        $r = httpJson($port, 'DELETE', "/vouchers/$id", ['reason' => '重複入力のため']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('voided', $r['body']['result'] ?? null, 'result');

        $v = voucherRow($pdo, $id);
        assertEq('void', $v['status'], 'status');
        assertTrue($v['updated_at'] > OLD_TS, 'updated_atが進む: ' . $v['updated_at']);
        assertEq(1, lineCount($pdo, $id), '明細は残る');

        $h = historyRows($pdo, $id);
        assertEq(1, count($h), '履歴件数');
        assertEq('void', $h[0]['action'], 'action');
        $before = json_decode($h[0]['before_json'], true);
        $after  = json_decode((string)$h[0]['after_json'], true);
        assertEq('重複入力のため', $before['related']['reason'] ?? null, 'before_json.related.reason');
        assertEq('draft', $before['row']['status'] ?? null, '取消前status');
        assertEq('void', $after['row']['status'] ?? null, '取消後status');
    });

    runTest('2. 中身ありで理由空欄 → 取消でき履歴は残る（理由は空）', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['total_amount' => 5500]);
        createLine($pdo, $id, '障子', 2, 2500, 5000);

        $r = httpJson($port, 'DELETE', "/vouchers/$id");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('void', voucherRow($pdo, $id)['status'], 'status');

        $h = historyRows($pdo, $id);
        assertEq(1, count($h), '履歴件数');
        $before = json_decode($h[0]['before_json'], true);
        assertEq('', $before['related']['reason'] ?? null, '理由は空');
    });

    echo "\n=== R-0154 空の伝票（連携なし）は物理削除 ===\n";

    runTest('3. 明細0行・合計0（連携なし）→ 物理削除・履歴なし', function () use ($pdo, $port) {
        $id = createVoucher($pdo);
        assertEq(true, getIsEmpty($port, $id), 'is_empty');

        $r = httpJson($port, 'DELETE', "/vouchers/$id", ['reason' => '無視される']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('deleted', $r['body']['result'] ?? null, 'result');
        assertEq(null, voucherRow($pdo, $id), '伝票が消える');
        assertEq(0, count(historyRows($pdo, $id)), '履歴なし');
    });

    runTest('4. 品名空・単価0・金額0・数量1の行だけ → 空とみなされ物理削除（明細も消える）', function () use ($pdo, $port) {
        $id = createVoucher($pdo);
        createLine($pdo, $id, null, 1, 0, 0);
        createLine($pdo, $id, '   ', 1, 0, 0);
        assertEq(true, getIsEmpty($port, $id), 'is_empty');

        $r = httpJson($port, 'DELETE', "/vouchers/$id");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq(null, voucherRow($pdo, $id), '伝票が消える');
        assertEq(0, lineCount($pdo, $id), '明細も消える');
        assertEq(0, count(historyRows($pdo, $id)), '履歴なし');
    });

    runTest('5. 得意先と件名だけ入った明細0行 → 空とみなされる', function () use ($pdo, $port, $customerId) {
        $id = createVoucher($pdo, ['customer_id' => $customerId, 'description' => '山田様邸']);
        assertEq(true, getIsEmpty($port, $id), 'is_empty');
    });

    runTest('6. 品名だけ入った行がある → 中身ありとして扱う（void＋履歴）', function () use ($pdo, $port) {
        $id = createVoucher($pdo);
        createLine($pdo, $id, '框戸', 1, 0, 0);
        assertEq(false, getIsEmpty($port, $id), 'is_empty');

        $r = httpJson($port, 'DELETE', "/vouchers/$id", ['reason' => '']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('void', voucherRow($pdo, $id)['status'], 'status');
        assertEq(1, count(historyRows($pdo, $id)), '履歴あり');
    });

    echo "\n=== R-0154 空でもvoidにする伝票 ===\n";

    runTest('7. 空の連携伝票 → 物理削除せずvoid・updated_at前進・履歴なし', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['access_voucher_id' => 154001]);
        assertEq(true, getIsEmpty($port, $id), 'is_empty');

        $r = httpJson($port, 'DELETE', "/vouchers/$id");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $v = voucherRow($pdo, $id);
        assertTrue($v !== null, '伝票は残る');
        assertEq('void', $v['status'], 'status');
        assertTrue($v['updated_at'] > OLD_TS, 'updated_atが進む: ' . $v['updated_at']);
        assertEq(0, count(historyRows($pdo, $id)), '履歴なし');
    });

    runTest('8a. 空でも invoice_vouchers から参照されている → void', function () use ($pdo, $port, $customerId) {
        $id = createVoucher($pdo, ['customer_id' => $customerId]);
        $pdo->exec("INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date)
                    VALUES ('INV-R0154', $customerId, '2026-10-01', '2026-09-30', '2026-10-31')");
        $invId = (int)$pdo->lastInsertId();
        $pdo->exec("INSERT INTO invoice_vouchers (invoice_id, voucher_id) VALUES ($invId, $id)");

        $r = httpJson($port, 'DELETE', "/vouchers/$id");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $v = voucherRow($pdo, $id);
        assertTrue($v !== null, '伝票は残る');
        assertEq('void', $v['status'], 'status');
        assertTrue($v['updated_at'] > OLD_TS, 'updated_atが進む');
        assertEq(0, count(historyRows($pdo, $id)), '履歴なし');
    });

    runTest('8b. 空でも他伝票の source_voucher_id から参照されている → void', function () use ($pdo, $port) {
        $id = createVoucher($pdo);
        createVoucher($pdo, ['source_voucher_id' => $id, 'total_amount' => 1000]);

        $r = httpJson($port, 'DELETE', "/vouchers/$id");
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $v = voucherRow($pdo, $id);
        assertTrue($v !== null, '伝票は残る');
        assertEq('void', $v['status'], 'status');
    });

    echo "\n=== R-0154 取消できない伝票は409で何も変わらない ===\n";

    $assertUnchanged409 = function (int $id, string $label) use ($pdo, $port) {
        $before = voucherRow($pdo, $id);
        $lines  = lineCount($pdo, $id);
        $r = httpJson($port, 'DELETE', "/vouchers/$id", ['reason' => '取消不可のはず']);
        assertTrue(str_contains($r['status'], '409'), "$label HTTP 409: " . $r['status']);
        assertEq($before, voucherRow($pdo, $id), "$label 伝票は変わらない");
        assertEq($lines, lineCount($pdo, $id), "$label 明細は変わらない");
        assertEq(0, count(historyRows($pdo, $id)), "$label 履歴なし");
    };

    runTest('9a. access_billed_flag=1 → 409', function () use ($pdo, $assertUnchanged409) {
        $id = createVoucher($pdo, ['access_billed_flag' => 1, 'status' => 'approved']);
        $assertUnchanged409($id, 'access_billed');
    });

    runTest('9b. status=billed → 409', function () use ($pdo, $assertUnchanged409) {
        $id = createVoucher($pdo, ['status' => 'billed', 'total_amount' => 1000]);
        createLine($pdo, $id, '框戸', 1, 1000, 1000);
        $assertUnchanged409($id, 'billed');
    });

    runTest('9c. status=void → 409', function () use ($pdo, $assertUnchanged409) {
        $id = createVoucher($pdo, ['status' => 'void']);
        $assertUnchanged409($id, 'void');
    });

    runTest('9d. 売上に引用済みの見積 → 409', function () use ($pdo, $assertUnchanged409) {
        $id = createVoucher($pdo, ['voucher_type' => 'estimate', 'voucher_no' => 'E-R0154-001']);
        createVoucher($pdo, ['source_estimate_no' => 'E-R0154-001']);
        $assertUnchanged409($id, '引用済み見積');
    });

    echo "\n=== R-0154 追加仕様1: 引用先がvoidの売上は引用済みに数えない ===\n";

    runTest('11a. 引用先の売上がvoidだけの見積 → 取消できる', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['voucher_type' => 'estimate', 'voucher_no' => 'E-R0154-011', 'total_amount' => 1000]);
        createLine($pdo, $id, '框戸', 1, 1000, 1000);
        createVoucher($pdo, ['source_estimate_no' => 'E-R0154-011', 'status' => 'void']);

        $r = httpJson($port, 'DELETE', "/vouchers/$id", ['reason' => '引用先取消済み']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('void', voucherRow($pdo, $id)['status'], 'status');
    });

    runTest('11b. voidでない売上も引用していれば → 409', function () use ($pdo, $assertUnchanged409) {
        $id = createVoucher($pdo, ['voucher_type' => 'estimate', 'voucher_no' => 'E-R0154-012']);
        createVoucher($pdo, ['source_estimate_no' => 'E-R0154-012', 'status' => 'void']);
        createVoucher($pdo, ['source_estimate_no' => 'E-R0154-012']);
        $assertUnchanged409($id, '引用済み見積（voidでない売上あり）');
    });

    runTest('11c. 引用先がvoidだけの見積は編集制限も解除される（明細を追加できる）', function () use ($pdo, $port) {
        $id = createVoucher($pdo, ['voucher_type' => 'estimate', 'voucher_no' => 'E-R0154-013']);
        createVoucher($pdo, ['source_estimate_no' => 'E-R0154-013', 'status' => 'void']);
        $r = httpJson($port, 'POST', "/vouchers/$id/lines", ['item_name' => '障子', 'quantity' => 1]);
        assertTrue(str_contains($r['status'], ' 20'), 'HTTP 2xx: ' . $r['status']);
        assertEq(1, lineCount($pdo, $id), '明細が追加される');
    });

    echo "\n=== R-0154 Access同期の受信経路は変えない ===\n";

    runTest('10. recalcVoucher(..., false) は updated_at・status を変えず履歴も残さない', function () use ($pdo) {
        $id = createVoucher($pdo, ['access_voucher_id' => 154010]);
        createLine($pdo, $id, '框戸', 1, 1000, 1000);
        recalcVoucher($pdo, $id, false);
        $v = voucherRow($pdo, $id);
        assertEq(OLD_TS, $v['updated_at'], 'updated_at不変');
        assertEq('draft', $v['status'], 'status不変');
        assertEq(0, count(historyRows($pdo, $id)), '履歴なし');
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

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
