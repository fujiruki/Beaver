<?php
/**
 * R-0241 伝票の非表示記録: migration 043・同期の窓口・伝票API
 *
 * 起動: php api/tests/test_r0241_hidden_note.php
 */

declare(strict_types=1);

$harnessName = 'test_r0241_hidden_note';
$harnessPort = 18123;
require __DIR__ . '/_http_test_harness.php';

function pushVoucher(int $port, int $accessId, array $extra = []): array {
    return httpJson($port, '/vouchers/sync', 'POST', array_merge([
        'access_voucher_id' => $accessId, 'voucher_type' => 'estimate', 'customer_access_no' => '',
        'voucher_date' => '2026-09-01', 'total_amount' => 1000,
    ], $extra));
}

function noteOf(PDO $pdo, int $accessId): ?string {
    $v = $pdo->query("SELECT hidden_note FROM vouchers WHERE access_voucher_id = $accessId")->fetchColumn();
    return $v === false ? null : $v;
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0241 伝票の非表示記録 ===\n";

    runTest('migration 043 で vouchers.hidden_note ができる', function () use ($pdo) {
        $cols = array_column($pdo->query('PRAGMA table_info(vouchers)')->fetchAll(PDO::FETCH_ASSOC), 'name');
        assertTrue(in_array('hidden_note', $cols, true), 'hidden_note 列がある');
        assertTrue(file_exists(__DIR__ . '/../migrations/043_vouchers_hidden_note.sql'), '043 のファイルがある');
    });

    runTest('hidden_note のキーが無い再送で、Beaver の値が残る', function () use ($pdo, $port) {
        pushVoucher($port, 61001);
        $pdo->exec("UPDATE vouchers SET hidden_note = 'Beaver の記録' WHERE access_voucher_id = 61001");
        $r = pushVoucher($port, 61001, ['total_amount' => 2000, 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        assertTrue(str_contains($r['status'], '200'), 'HTTP 200: ' . $r['status']);
        assertEq('Beaver の記録', noteOf($pdo, 61001), '残る');
    });

    runTest('キーがあれば、その値で更新する', function () use ($pdo, $port) {
        pushVoucher($port, 61002, ['hidden_note' => '最初']);
        assertEq('最初', noteOf($pdo, 61002), '新規');
        pushVoucher($port, 61002, ['hidden_note' => '更新後', 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        assertEq('更新後', noteOf($pdo, 61002), '更新');
    });

    runTest('null なら空にする', function () use ($pdo, $port) {
        pushVoucher($port, 61003, ['hidden_note' => '消える']);
        pushVoucher($port, 61003, ['hidden_note' => null, 'base_synced_at' => '2999-01-01 00:00:00', 'force' => true]);
        $m = noteOf($pdo, 61003);
        assertTrue($m === null || $m === '', '空: ' . var_export($m, true));
    });

    runTest('GET /vouchers/sync の返り値に入る', function () use ($pdo, $port) {
        pushVoucher($port, 61004, ['hidden_note' => '返り値の記録']);
        $get = httpJson($port, '/vouchers/sync', 'GET');
        $found = null;
        foreach ($get['body']['vouchers'] as $row) if ((int)$row['access_voucher_id'] === 61004) $found = $row;
        assertTrue($found !== null, '伝票が返る');
        assertTrue(array_key_exists('hidden_note', $found), 'hidden_note キーがある');
        assertEq('返り値の記録', $found['hidden_note'], '値');
    });

    runTest('POST・PUT /vouchers で受け、上限なし（1,000文字も保存）', function () use ($pdo, $port) {
        $r = httpJson($port, '/vouchers', 'POST', ['voucher_type' => 'estimate', 'customer_id' => null, 'hidden_note' => '作成時']);
        assertTrue(str_contains($r['status'], '20'), 'POST 成功: ' . $r['status']);
        $id = (int)$r['body']['id'];
        assertEq('作成時', $pdo->query("SELECT hidden_note FROM vouchers WHERE id = $id")->fetchColumn(), 'POST で保存');
        $r = httpJson($port, "/vouchers/$id", 'PUT', ['hidden_note' => '更新時']);
        assertTrue(str_contains($r['status'], '200'), 'PUT 成功: ' . $r['status']);
        assertEq('更新時', $pdo->query("SELECT hidden_note FROM vouchers WHERE id = $id")->fetchColumn(), 'PUT で保存');
        $long = str_repeat('あ', 1000);
        $r = httpJson($port, "/vouchers/$id", 'PUT', ['hidden_note' => $long]);
        assertTrue(str_contains($r['status'], '200'), 'PUT 1000文字: ' . $r['status']);
        assertEq($long, $pdo->query("SELECT hidden_note FROM vouchers WHERE id = $id")->fetchColumn(), 'PUT で1000文字保存');
        $r = httpJson($port, '/vouchers', 'POST', ['voucher_type' => 'estimate', 'customer_id' => null, 'hidden_note' => $long]);
        assertTrue(str_contains($r['status'], '20'), 'POST 1000文字: ' . $r['status']);
        assertEq($long, $pdo->query("SELECT hidden_note FROM vouchers WHERE id = " . (int)$r['body']['id'])->fetchColumn(), 'POST で1000文字保存');
    });

    runTest('/vouchers/sync でも1,000文字の非表示記録が保存される', function () use ($pdo, $port) {
        $long = str_repeat('い', 1000);
        $r = pushVoucher($port, 61005, ['hidden_note' => $long]);
        assertTrue(!str_contains($r['status'], '400'), 'sync 1000文字: ' . $r['status']);
        assertEq($long, noteOf($pdo, 61005), 'sync で1000文字保存');
    });
} finally {
    harnessFinish();
}
