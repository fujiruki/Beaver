<?php
/**
 * R-066(c) Phase2 単体・統合テスト
 *
 * 起動: php api/tests/test_voucher_lines_edit.php
 *
 * - PUT /vouchers/{id}/lines/{lineId} で明細を編集すると edited_in_beaver が
 *   自動的に 1 になることを検証する（保護機構が機能するための前提）。
 * - Access 由来の同期処理（insertSyncedLines）ではフラグが立たない（= 0 のまま）ことも
 *   併せて確認し、回帰を防ぐ。
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_voucher_lines_edit_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
    $GLOBALS['pdo'] = null;
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

function assertEq($expected, $actual, string $label = '', array $debug = []): void {
    if ($expected !== $actual) {
        $dbg = empty($debug) ? '' : ' debug=' . json_encode($debug, JSON_UNESCAPED_UNICODE);
        throw new RuntimeException(sprintf(
            "%s expected=%s actual=%s%s",
            $label,
            var_export($expected, true),
            var_export($actual, true),
            $dbg
        ));
    }
}

function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

// ============================================================
// テスト用伝票・明細作成ヘルパ
// ============================================================
function createVoucher(PDO $pdo, int $customerId, string $voucherNo): int {
    $pdo->prepare("
        INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type)
        VALUES (?, 'estimate', 'draft', ?, '2026-07-01', 'exclusive')
    ")->execute([$voucherNo, $customerId]);
    return (int)$pdo->lastInsertId();
}

function createLine(PDO $pdo, int $voucherId, int $lineNo, string $source = 'beaver', int $editedInBeaver = 0): int {
    // updated_atはカラムDEFAULTに依存せずアプリ側で明示セットする方針（本番=ALTER適用でDEFAULT不可）のため、
    // 実INSERT経路と同じ前提でCURRENT_TIMESTAMPを明示する。
    $pdo->prepare("
        INSERT INTO voucher_lines
            (voucher_id, line_no, line_type, item_name, quantity, price_body, line_total, tax_category, source, edited_in_beaver, updated_at)
        VALUES
            (?, ?, 'normal', '編集前', 1, 1000, 1000, '課税', ?, ?, CURRENT_TIMESTAMP)
    ")->execute([$voucherId, $lineNo, $source, $editedInBeaver]);
    return (int)$pdo->lastInsertId();
}

// ============================================================
// HTTP サーバ起動（PUT /vouchers/{id}/lines/{lineId} を実際に叩く）
// ============================================================
$bootstrap = __DIR__ . '/_server_bootstrap_lines_edit.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18084;
$serverProc = proc_open(
    [
        'php',
        '-d', 'auto_prepend_file=' . $bootstrap,
        '-S', "127.0.0.1:$port",
        '-t', $ROOT,
        $ROOT . '/index.php',
    ],
    // 標準出力/エラー出力を pipe のまま放置するとOSバッファが満杯になり
    // サーバプロセスが書き込みでブロックしてハングするため、NULデバイスに捨てる。
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

function putJson(int $port, string $path, array $body): array {
    $ctx = stream_context_create(['http' => [
        'method'  => 'PUT',
        'header'  => "Content-Type: application/json\r\nConnection: close\r\n",
        'content' => json_encode($body, JSON_UNESCAPED_UNICODE),
        'ignore_errors' => true,
        'timeout' => 5,
    ]]);
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

    echo "=== R-066(c) Phase2 PUT /vouchers/{id}/lines/{lineId} で edited_in_beaver が自動セットされること ===\n";

    runTest('明細フィールド(item_name)を更新すると edited_in_beaver=1 になる', function () use (&$pdo, $port, $customerId) {
        $voucherId = createVoucher($pdo, $customerId, 'E-TEST-001');
        $lineId    = createLine($pdo, $voucherId, 1);

        $r = putJson($port, "/vouchers/$voucherId/lines/$lineId", ['item_name' => '編集後']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq(1, (int)($r['body']['edited_in_beaver'] ?? -1), 'レスポンス body の edited_in_beaver=1');

        $row = $pdo->query("SELECT edited_in_beaver, item_name FROM voucher_lines WHERE id = $lineId")->fetch();
        assertEq(1, (int)$row['edited_in_beaver'], 'DB: edited_in_beaver=1');
        assertEq('編集後', $row['item_name'], 'DB: item_name が更新されている');
    });

    runTest('quantity のみの更新でも edited_in_beaver=1 になる', function () use (&$pdo, $port, $customerId) {
        $voucherId = createVoucher($pdo, $customerId, 'E-TEST-002');
        $lineId    = createLine($pdo, $voucherId, 1);

        $r = putJson($port, "/vouchers/$voucherId/lines/$lineId", ['quantity' => 5]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);

        $row = $pdo->query("SELECT edited_in_beaver FROM voucher_lines WHERE id = $lineId")->fetch();
        assertEq(1, (int)$row['edited_in_beaver'], 'DB: edited_in_beaver=1');
    });

    runTest('既に edited_in_beaver=1 の行を再編集しても 1 のまま（冪等）', function () use (&$pdo, $port, $customerId) {
        $voucherId = createVoucher($pdo, $customerId, 'E-TEST-003');
        $lineId    = createLine($pdo, $voucherId, 1, 'beaver', 1);

        $r = putJson($port, "/vouchers/$voucherId/lines/$lineId", ['item_name' => 'さらに編集']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);

        $row = $pdo->query("SELECT edited_in_beaver FROM voucher_lines WHERE id = $lineId")->fetch();
        assertEq(1, (int)$row['edited_in_beaver'], 'DB: edited_in_beaver=1のまま');
    });

    runTest('編集対象フィールドを含まない PUT では edited_in_beaver は変化しない', function () use (&$pdo, $port, $customerId) {
        $voucherId = createVoucher($pdo, $customerId, 'E-TEST-004');
        $lineId    = createLine($pdo, $voucherId, 1);

        // 対象フィールドを1つも含まないペイロード
        $r = putJson($port, "/vouchers/$voucherId/lines/$lineId", ['unknown_field' => 'x']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);

        $row = $pdo->query("SELECT edited_in_beaver FROM voucher_lines WHERE id = $lineId")->fetch();
        assertEq(0, (int)$row['edited_in_beaver'], 'DB: edited_in_beaver=0のまま（未変更）');
    });

    echo "\n=== R-060 Phase2b/2c Stage2 PUT /vouchers/{id}/lines/{lineId} で updated_at が自動更新されること ===\n";

    runTest('明細編集の PUT 実行後に updated_at が PUT 前より新しくなる', function () use (&$pdo, $port, $customerId) {
        $voucherId = createVoucher($pdo, $customerId, 'E-TEST-005');
        $lineId    = createLine($pdo, $voucherId, 1);

        $before = $pdo->query("SELECT updated_at FROM voucher_lines WHERE id = $lineId")->fetch();
        assertTrue($before !== false && $before['updated_at'] !== null, 'updated_at 列が存在し初期値が設定されている');

        sleep(1);

        $r = putJson($port, "/vouchers/$voucherId/lines/$lineId", ['item_name' => '編集後2']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);

        $after = $pdo->query("SELECT updated_at FROM voucher_lines WHERE id = $lineId")->fetch();
        assertTrue(
            $after['updated_at'] > $before['updated_at'],
            'updated_at がPUT後に新しくなっている: before=' . $before['updated_at'] . ' after=' . $after['updated_at']
        );
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
// Access 由来の同期処理（insertSyncedLines）ではフラグが立たないことの確認（回帰防止）
// ============================================================
echo "\n=== insertSyncedLines（Access同期経路）では edited_in_beaver が立たないこと ===\n";

require_once $ROOT . '/routes/sync_helpers.php';

runTest('insertSyncedLines で INSERT された明細は edited_in_beaver=0', function () use (&$pdo, $customerId) {
    $voucherId = createVoucher($pdo, $customerId, 'E-TEST-SYNC-001');
    $err = insertSyncedLines($pdo, $voucherId, [
        ['line_type' => 'normal', 'item_name' => 'Access明細', 'quantity' => 1, 'line_total' => 1000, 'tax_category' => '課税', 'access_line_id' => 5001],
    ]);
    assertEq(null, $err, 'validation エラーなし');

    $row = $pdo->query("SELECT edited_in_beaver, source FROM voucher_lines WHERE voucher_id = $voucherId")->fetch();
    assertTrue($row !== false, '明細行が作成されている');
    assertEq(0, (int)$row['edited_in_beaver'], 'DB: Access同期由来の明細は edited_in_beaver=0');
    assertEq('access', $row['source'], 'DB: source=access');
});

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
