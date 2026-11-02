<?php
/**
 * R-0236 同期の窓口: 伝票の memo を、キーが無い再送で消さず、返り値にも入れる
 *
 * 起動: php api/tests/test_r0236_memo_sync.php
 */

declare(strict_types=1);

$harnessName = 'test_r0236_memo_sync';
$harnessPort = 18122;
require __DIR__ . '/_http_test_harness.php';

function pushVoucher(int $port, int $accessId, array $extra = []): array {
    return httpJson($port, '/vouchers/sync', 'POST', array_merge([
        'access_voucher_id' => $accessId, 'voucher_type' => 'estimate', 'customer_access_no' => '',
        'voucher_date' => '2026-09-01', 'total_amount' => 1000,
    ], $extra));
}

function memoOf(PDO $pdo, int $accessId): ?string {
    $v = $pdo->query("SELECT memo FROM vouchers WHERE access_voucher_id = $accessId")->fetchColumn();
    return $v === false ? null : $v;
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0236 同期の memo ===\n";

    runTest('memo のキーが無い再送で、Beaver の memo が残る', function () use ($pdo, $port) {
        pushVoucher($port, 60001);
        $pdo->exec("UPDATE vouchers SET memo = 'Beaver で書いた説明' WHERE access_voucher_id = 60001");
        $r = pushVoucher($port, 60001, ['total_amount' => 2000, 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('Beaver で書いた説明', memoOf($pdo, 60001), 'memo が残る');
    });

    runTest('memo のキーがあれば、その値で更新する', function () use ($pdo, $port) {
        pushVoucher($port, 60002, ['memo' => '最初']);
        assertEq('最初', memoOf($pdo, 60002), '新規');
        pushVoucher($port, 60002, ['memo' => '更新後', 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        assertEq('更新後', memoOf($pdo, 60002), '更新');
    });

    runTest('memo が null なら空にする', function () use ($pdo, $port) {
        pushVoucher($port, 60003, ['memo' => '消える']);
        pushVoucher($port, 60003, ['memo' => null, 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        $m = memoOf($pdo, 60003);
        assertTrue($m === null || $m === '', 'memo が空: ' . var_export($m, true));
    });

    runTest('GET /vouchers/sync の返り値に memo が入る', function () use ($pdo, $port) {
        pushVoucher($port, 60004, ['memo' => '返り値の説明']);
        $get = httpJson($port, '/vouchers/sync', 'GET');
        $found = null;
        foreach ($get['body']['vouchers'] as $row) if ((int)$row['access_voucher_id'] === 60004) $found = $row;
        assertTrue($found !== null, '伝票が返る');
        assertTrue(array_key_exists('memo', $found), 'memo キーがある');
        assertEq('返り値の説明', $found['memo'], 'memo の値');
    });
} finally {
    harnessFinish();
}
