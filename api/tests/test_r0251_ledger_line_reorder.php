<?php
/**
 * R-0251 製品台帳の材料・工程の行の並べ替え: 保存して読み直しても順番が残り、同期の返り値に sort_order が出る
 *
 * 起動: php api/tests/test_r0251_ledger_line_reorder.php
 */

declare(strict_types=1);

$harnessName = 'test_r0251_ledger_line_reorder';
$harnessPort = 18132;
require __DIR__ . '/_http_test_harness.php';

function costLine(string $cat, string $name, int $sort): array {
    return ['category_code' => $cat, 'name' => $name, 'quantity' => 1, 'unit_cost' => 100, 'amount' => 100, 'source' => 'manual', 'sort_order' => $sort];
}
function laborLine(string $name, string $cat, float $hours, int $sort): array {
    return ['process_name' => $name, 'category_code' => $cat, 'work_hours' => $hours, 'labor_rate' => 4000, 'amount' => $hours * 4000, 'sort_order' => $sort];
}
function column(array $lines, string $key): array {
    return array_map(fn($l) => $l[$key], $lines);
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0251 行の並べ替え ===\n";

    $pdo->exec("INSERT INTO tategu_items (code, name, status) VALUES ('91001', '並べ替え台帳', 'active')");
    $id = (int)$pdo->lastInsertId();

    runTest('材料費: 区分の中で入れ替えて保存すると、読み直しても順番が残る', function () use ($port, $id) {
        $r = httpJson($port, "/tategu-items/$id/cost-lines", 'PUT', ['lines' => [
            costLine('MAIN', '本体1', 0), costLine('MAIN', '本体2', 1), costLine('HARDWARE', '金物1', 2),
        ]]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        $r = httpJson($port, "/tategu-items/$id/cost-lines", 'PUT', ['lines' => [
            costLine('MAIN', '本体2', 0), costLine('MAIN', '本体1', 1), costLine('HARDWARE', '金物1', 2),
        ]]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        $item = httpJson($port, "/tategu-items/$id", 'GET');
        assertEq(['本体2', '本体1', '金物1'], column($item['body']['cost_lines'], 'name'), '読み直し');
        assertEq([0, 1, 2], array_map('intval', column($item['body']['cost_lines'], 'sort_order')), 'sort_order');
    });

    runTest('労務費: 行ごと入れ替えて保存すると、工場・現場の組のまま順番が残る', function () use ($port, $id) {
        $lines = [
            laborLine('B', 'FACTORY_TIME', 1, 1),
            laborLine('A', 'FACTORY_TIME', 2, 3),
            laborLine('A', 'SITE_TIME', 3, 4),
        ];
        $r = httpJson($port, "/tategu-items/$id/labor-lines", 'PUT', ['lines' => $lines]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        $item = httpJson($port, "/tategu-items/$id", 'GET');
        $got = $item['body']['labor_lines'];
        assertEq(['B', 'A', 'A'], column($got, 'process_name'), '工程名の順');
        assertEq(['FACTORY_TIME', 'FACTORY_TIME', 'SITE_TIME'], column($got, 'category_code'), '区分の順');
        assertEq([1, 3, 4], array_map('intval', column($got, 'sort_order')), 'sort_order');
    });

    runTest('同期の PUT・GET の返り値に、並べ替え後の sort_order が出る', function () use ($port, $id, $pdo) {
        $pdo->exec("UPDATE tategu_items SET updated_at = '2026-01-01 00:00:00' WHERE id = $id");
        $r = httpJson($port, "/tategu-items/$id/sync", 'PUT', [
            'base_synced_at' => '2026-12-31 00:00:00',
            'code' => '91001', 'name' => '並べ替え台帳',
            'cost_lines' => [costLine('MAIN', '本体1', 5), costLine('MAIN', '本体2', 9)],
            'labor_lines' => [laborLine('A', 'FACTORY_TIME', 2, 1), laborLine('A', 'SITE_TIME', 3, 2), laborLine('B', 'FACTORY_TIME', 1, 3)],
        ]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status'] . json_encode($r['body']));
        assertEq([5, 9], array_map('intval', column($r['body']['cost_lines'], 'sort_order')), 'PUT 返り値 cost');
        assertEq([1, 2, 3], array_map('intval', column($r['body']['labor_lines'], 'sort_order')), 'PUT 返り値 labor');

        $pdo->exec("UPDATE tategu_items SET updated_at = '2026-01-02 00:00:00' WHERE id = $id");
        $s = httpJson($port, '/tategu-items/sync?since=' . rawurlencode('2026-01-01 09:00:00'), 'GET');
        $row = null;
        foreach ($s['body']['data'] as $x) if ((int)$x['id'] === $id) $row = $x;
        assertTrue($row !== null, '同期 GET に出る');
        assertEq([5, 9], array_map('intval', column($row['cost_lines'], 'sort_order')), 'GET cost');
        assertEq(['A', 'A', 'B'], column($row['labor_lines'], 'process_name'), 'GET labor の順');
    });
} finally {
    harnessFinish();
}
