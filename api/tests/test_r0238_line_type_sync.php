<?php
/**
 * R-0238 追記: 同期の返り値の明細に line_type を入れる
 *
 * 起動: php api/tests/test_r0238_line_type_sync.php
 */

declare(strict_types=1);

$harnessName = 'test_r0238_line_type_sync';
$harnessPort = 18123;
require __DIR__ . '/_http_test_harness.php';

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0238 同期の返り値の line_type ===\n";

    runTest('値引の行は discount、通常の行は normal で返る', function () use ($port) {
        $post = httpJson($port, '/vouchers/sync', 'POST', [
            'access_voucher_id' => 61001, 'voucher_type' => 'estimate', 'customer_access_no' => '',
            'voucher_date' => '2026-09-01', 'total_amount' => 900,
            'lines' => [
                ['line_no' => 1, 'item_name' => '框戸A', 'quantity' => 1, 'line_total' => 1000, 'tax_category' => '課税'],
                ['line_no' => 2, 'item_name' => '値引', 'quantity' => 1, 'line_total' => -100, 'tax_category' => '課税', 'line_type' => 'discount'],
            ],
        ]);
        assertTrue(str_contains($post['status'], '200'), 'POST 200: ' . $post['status']);
        $get = httpJson($port, '/vouchers/sync', 'GET');
        $found = null;
        foreach ($get['body']['vouchers'] as $row) if ((int)$row['access_voucher_id'] === 61001) $found = $row;
        assertTrue($found !== null, '伝票が返る');
        assertEq(2, count($found['lines']), '明細2件');
        assertEq('normal', $found['lines'][0]['line_type'] ?? null, '通常の行');
        assertEq('discount', $found['lines'][1]['line_type'] ?? null, '値引の行');
    });
} finally {
    harnessFinish();
}
