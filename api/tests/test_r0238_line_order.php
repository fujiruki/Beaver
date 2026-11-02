<?php
/**
 * R-0238 PUT /vouchers/{id}/line-order（明細の並べ替え）と、行順の同期
 *
 * 起動: php api/tests/test_r0238_line_order.php
 */

declare(strict_types=1);

$harnessName = 'test_r0238_line_order';
$harnessPort = 18121;
require __DIR__ . '/_http_test_harness.php';

$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先', '100')");
$customerId = (int)$pdo->lastInsertId();

function createVoucher(PDO $pdo, int $customerId, string $no, string $extra = ''): int {
    $pdo->prepare("INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, tax_input_type) VALUES (?, 'estimate', 'draft', ?, '2026-07-01', 'exclusive')")
        ->execute([$no, $customerId]);
    $id = (int)$pdo->lastInsertId();
    if ($extra !== '') $pdo->exec("UPDATE vouchers SET $extra WHERE id = $id");
    return $id;
}

function createLine(PDO $pdo, int $voucherId, int $lineNo, string $name): int {
    $pdo->prepare("INSERT INTO voucher_lines (voucher_id, line_no, line_type, item_name, quantity, price_body, line_total, tax_category, source, edited_in_beaver, updated_at) VALUES (?, ?, 'normal', ?, 1, 1000, 1000, '課税', 'beaver', 0, '2026-07-01 00:00:00')")
        ->execute([$voucherId, $lineNo, $name]);
    return (int)$pdo->lastInsertId();
}

function lineNos(PDO $pdo, int $voucherId): array {
    return $pdo->query("SELECT id, line_no FROM voucher_lines WHERE voucher_id = $voucherId ORDER BY line_no")->fetchAll(PDO::FETCH_KEY_PAIR);
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0238 PUT /vouchers/{id}/line-order ===\n";

    runTest('3行の2行目を上へ: line_ids の順に line_no が 1・2・3 で入れ替わり、変わった行は edited_in_beaver=1・updated_at が進む', function () use ($pdo, $port, $customerId) {
        $v = createVoucher($pdo, $customerId, 'E-R0238-001');
        $a = createLine($pdo, $v, 1, 'A');
        $b = createLine($pdo, $v, 2, 'B');
        $c = createLine($pdo, $v, 3, 'C');
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => [$b, $a, $c]]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq([$b => 1, $a => 2, $c => 3], lineNos($pdo, $v), 'DB の line_no');
        $rows = $pdo->query("SELECT id, edited_in_beaver, updated_at FROM voucher_lines WHERE voucher_id = $v")->fetchAll(PDO::FETCH_UNIQUE);
        assertEq(1, (int)$rows[$a]['edited_in_beaver'], 'A edited_in_beaver');
        assertEq(1, (int)$rows[$b]['edited_in_beaver'], 'B edited_in_beaver');
        assertTrue($rows[$a]['updated_at'] > '2026-07-01 00:00:00', 'A updated_at が進む');
        assertTrue($rows[$b]['updated_at'] > '2026-07-01 00:00:00', 'B updated_at が進む');
        assertEq(0, (int)$rows[$c]['edited_in_beaver'], '番号が変わらない C は触らない');
        assertEq('2026-07-01 00:00:00', $rows[$c]['updated_at'], 'C updated_at 不変');
    });

    runTest('line_ids が足りないと 400 で DB は変わらない', function () use ($pdo, $port, $customerId) {
        $v = createVoucher($pdo, $customerId, 'E-R0238-002');
        $a = createLine($pdo, $v, 1, 'A');
        $b = createLine($pdo, $v, 2, 'B');
        $c = createLine($pdo, $v, 3, 'C');
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => [$b, $a]]);
        assertTrue(str_contains($r['status'], '400'), 'HTTP 400: ' . $r['status']);
        assertEq([$a => 1, $b => 2, $c => 3], lineNos($pdo, $v), 'DB 不変');
    });

    runTest('ほかの伝票の行を含むと 400 で DB は変わらない', function () use ($pdo, $port, $customerId) {
        $v = createVoucher($pdo, $customerId, 'E-R0238-003');
        $a = createLine($pdo, $v, 1, 'A');
        $b = createLine($pdo, $v, 2, 'B');
        $w = createVoucher($pdo, $customerId, 'E-R0238-003W');
        $x = createLine($pdo, $w, 1, 'X');
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => [$b, $x]]);
        assertTrue(str_contains($r['status'], '400'), 'HTTP 400: ' . $r['status']);
        assertEq([$a => 1, $b => 2], lineNos($pdo, $v), 'DB 不変');
        assertEq([$x => 1], lineNos($pdo, $w), '他伝票 不変');
    });

    runTest('重複した line_ids も 400', function () use ($pdo, $port, $customerId) {
        $v = createVoucher($pdo, $customerId, 'E-R0238-004');
        $a = createLine($pdo, $v, 1, 'A');
        $b = createLine($pdo, $v, 2, 'B');
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => [$a, $a]]);
        assertTrue(str_contains($r['status'], '400'), 'HTTP 400: ' . $r['status']);
        assertEq([$a => 1, $b => 2], lineNos($pdo, $v), 'DB 不変');
    });

    runTest('Access で請求済みの伝票は 409 で断る', function () use ($pdo, $port, $customerId) {
        $v = createVoucher($pdo, $customerId, 'E-R0238-005', 'access_billed_flag = 1');
        $a = createLine($pdo, $v, 1, 'A');
        $b = createLine($pdo, $v, 2, 'B');
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => [$b, $a]]);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq([$a => 1, $b => 2], lineNos($pdo, $v), 'DB 不変');
    });

    runTest('請求済み(billed)の伝票は 409 で断る', function () use ($pdo, $port, $customerId) {
        $v = createVoucher($pdo, $customerId, 'E-R0238-006', "status = 'billed'");
        $a = createLine($pdo, $v, 1, 'A');
        $b = createLine($pdo, $v, 2, 'B');
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => [$b, $a]]);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq([$a => 1, $b => 2], lineNos($pdo, $v), 'DB 不変');
    });

    runTest('古い expected_updated_at は 409 stale_voucher で断る', function () use ($pdo, $port, $customerId) {
        $v = createVoucher($pdo, $customerId, 'E-R0238-007', "updated_at = '2026-08-01 00:00:00'");
        $a = createLine($pdo, $v, 1, 'A');
        $b = createLine($pdo, $v, 2, 'B');
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => [$b, $a], 'expected_updated_at' => '2026-07-01 00:00:00']);
        assertTrue(str_contains($r['status'], '409'), 'HTTP 409: ' . $r['status']);
        assertEq('stale_voucher', $r['body']['error'] ?? null, 'error');
        assertEq([$a => 1, $b => 2], lineNos($pdo, $v), 'DB 不変');
    });

    echo "\n=== R-0238 同期の返り値と取り込み ===\n";

    runTest('並べ替えた行は GET /vouchers/sync で line_no と updated_at が新しい', function () use ($pdo, $port, $customerId) {
        httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id' => 50001, 'voucher_type' => 'estimate', 'customer_access_no' => '100',
            'voucher_date' => '2026-09-01', 'total_amount' => 3000,
            'lines' => [
                ['line_no' => 1, 'item_name' => 'A', 'quantity' => 1, 'line_total' => 1000, 'tax_category' => '課税', 'access_line_id' => 9001],
                ['line_no' => 2, 'item_name' => 'B', 'quantity' => 1, 'line_total' => 1000, 'tax_category' => '課税', 'access_line_id' => 9002],
            ],
        ]);
        $v = (int)$pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 50001')->fetchColumn();
        $pdo->exec("UPDATE voucher_lines SET updated_at = '2026-07-01 00:00:00' WHERE voucher_id = $v");
        $ids = array_keys(lineNos($pdo, $v));
        $r = httpJson($port, "/vouchers/$v/line-order", 'PUT', ['line_ids' => array_reverse($ids)]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);

        $get = httpJson($port, '/vouchers/sync', 'GET');
        $voucher = null;
        foreach ($get['body']['vouchers'] as $row) if ((int)$row['access_voucher_id'] === 50001) $voucher = $row;
        assertTrue($voucher !== null, '伝票が返る');
        $names = array_map(fn($l) => $l['item_name'] . ':' . $l['line_no'], $voucher['lines']);
        assertEq(['B:1', 'A:2'], $names, '返り値の行順');
        foreach ($voucher['lines'] as $l) {
            assertTrue($l['updated_at'] > '2026-07-02', 'updated_at が新しい: ' . $l['updated_at']);
        }
    });

    runTest('Access からの取り込みで 2 行の line_no を入れ替えた伝票がそのとおりに並ぶ', function () use ($pdo, $port) {
        $mk = fn(array $order) => [
            'access_voucher_id' => 50002, 'voucher_type' => 'estimate', 'customer_access_no' => '100',
            'voucher_date' => '2026-09-01', 'total_amount' => 2000,
            'lines' => array_map(fn($n, $i) => ['line_no' => $i + 1, 'item_name' => $n, 'quantity' => 1, 'line_total' => 1000, 'tax_category' => '課税', 'access_line_id' => 9100 + ord($n)], $order, array_keys($order)),
        ];
        httpJson($port, '/vouchers/sync', 'POST', $mk(['A', 'B', 'C']));
        $r = httpJson($port, '/vouchers/sync', 'POST', $mk(['B', 'A', 'C']) + ['lines_mode' => 'replace', 'force' => true, 'base_synced_at' => '2999-01-01 00:00:00']);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        $v = (int)$pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 50002')->fetchColumn();
        $names = $pdo->query("SELECT item_name FROM voucher_lines WHERE voucher_id = $v ORDER BY line_no")->fetchAll(PDO::FETCH_COLUMN);
        assertEq(['B', 'A', 'C'], $names, '取り込み後の並び');
    });
} finally {
    harnessFinish();
}
