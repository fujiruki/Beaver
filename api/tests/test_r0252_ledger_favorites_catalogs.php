<?php
/**
 * R-0252 製品台帳のお気に入り・カタログ: migration 044・API・同期に出ないこと
 *
 * 起動: php api/tests/test_r0252_ledger_favorites_catalogs.php
 */

declare(strict_types=1);

$harnessName = 'test_r0252_ledger_favorites_catalogs';
$harnessPort = 18131;
require __DIR__ . '/_http_test_harness.php';

const OLD_TS = '2026-01-01 00:00:00';

function newItem(PDO $pdo, string $code, string $name, string $status = 'active'): int {
    $pdo->prepare('INSERT INTO tategu_items (code, name, status, updated_at) VALUES (?, ?, ?, ?)')
        ->execute([$code, $name, $status, OLD_TS]);
    return (int)$pdo->lastInsertId();
}

function updatedAt(PDO $pdo, int $id): string {
    return (string)$pdo->query("SELECT updated_at FROM tategu_items WHERE id = $id")->fetchColumn();
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    echo "=== R-0252 お気に入り ===\n";

    $a = newItem($pdo, '90001', '障子A');
    $b = newItem($pdo, '90002', '障子B');
    $c = newItem($pdo, '90003', '障子C');
    $gone = newItem($pdo, '90004', '使用不可の障子', 'archived');

    runTest('is_favorite の初期値は 0', function () use ($pdo, $a) {
        assertEq(0, (int)$pdo->query("SELECT is_favorite FROM tategu_items WHERE id = $a")->fetchColumn(), '初期値');
    });

    runTest('PUT /favorite で切り替わり、updated_at は進まない', function () use ($pdo, $port, $a) {
        $r = httpJson($port, "/tategu-items/$a/favorite", 'PUT', ['is_favorite' => true]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        assertEq(1, (int)$pdo->query("SELECT is_favorite FROM tategu_items WHERE id = $a")->fetchColumn(), 'ON');
        assertEq(OLD_TS, updatedAt($pdo, $a), 'updated_at 据え置き');
        $r = httpJson($port, "/tategu-items/$a/favorite", 'PUT', ['is_favorite' => false]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        assertEq(0, (int)$pdo->query("SELECT is_favorite FROM tategu_items WHERE id = $a")->fetchColumn(), 'OFF');
        assertEq(OLD_TS, updatedAt($pdo, $a), 'updated_at 据え置き(OFF)');
    });

    runTest('存在しない台帳は 404', function () use ($port) {
        $r = httpJson($port, '/tategu-items/999999/favorite', 'PUT', ['is_favorite' => true]);
        assertTrue(str_contains($r['status'], '404'), 'status: ' . $r['status']);
    });

    runTest('一覧は is_favorite を返し、favorite=1 で絞れる', function () use ($port, $a, $b) {
        httpJson($port, "/tategu-items/$b/favorite", 'PUT', ['is_favorite' => true]);
        $all = httpJson($port, '/tategu-items', 'GET');
        $row = null;
        foreach ($all['body'] as $r) if ((int)$r['id'] === $b) $row = $r;
        assertTrue($row !== null && array_key_exists('is_favorite', $row), 'is_favorite キーがある');
        assertEq(1, (int)$row['is_favorite'], '値');
        $fav = httpJson($port, '/tategu-items?favorite=1', 'GET');
        assertEq([$b], array_map(fn($r) => (int)$r['id'], $fav['body']), 'お気に入りだけ');
        $paged = httpJson($port, '/tategu-items?page=1&favorite=1', 'GET');
        assertEq(1, (int)$paged['body']['meta']['total'], 'ページ付きでも絞れる');
    });

    runTest('同期の返り値に is_favorite が出ない', function () use ($port, $b) {
        $r = httpJson($port, '/tategu-items/sync?since=' . rawurlencode('1970-01-01 00:00:00'), 'GET');
        assertTrue($r['body'] !== null && count($r['body']['data']) > 0, '同期の行がある');
        foreach ($r['body']['data'] as $row) {
            assertTrue(!array_key_exists('is_favorite', $row), 'is_favorite が出ている: ' . $row['id']);
        }
    });

    echo "=== R-0252 カタログ ===\n";

    $catId = 0;
    runTest('POST /ledger-catalogs で作成、名前なしは 400', function () use ($port, &$catId) {
        $r = httpJson($port, '/ledger-catalogs', 'POST', ['name' => '障子カタログ']);
        assertTrue(str_contains($r['status'], '201'), 'status: ' . $r['status']);
        assertEq('障子カタログ', $r['body']['name'], '名前');
        $catId = (int)$r['body']['id'];
        assertTrue($catId > 0, 'id');
        $r = httpJson($port, '/ledger-catalogs', 'POST', ['name' => '  ']);
        assertTrue(str_contains($r['status'], '400'), 'status: ' . $r['status']);
    });

    runTest('PUT items で順番を全件入れ替え、GET items は順番どおり・使用不可は外れる', function () use ($pdo, $port, &$catId, $a, $b, $c, $gone) {
        $r = httpJson($port, "/ledger-catalogs/$catId/items", 'PUT', ['tategu_item_ids' => [$c, $a, $gone, $b]]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        $g = httpJson($port, "/ledger-catalogs/$catId/items", 'GET');
        assertEq([$c, $a, $b], array_map(fn($x) => (int)$x['id'], $g['body']), '順番（使用不可は出ない）');
        $r = httpJson($port, "/ledger-catalogs/$catId/items", 'PUT', ['tategu_item_ids' => [$b, $a]]);
        $g = httpJson($port, "/ledger-catalogs/$catId/items", 'GET');
        assertEq([$b, $a], array_map(fn($x) => (int)$x['id'], $g['body']), '入れ替え後');
        foreach ([$a, $b, $c] as $id) assertEq(OLD_TS, updatedAt($pdo, $id), "台帳$id の updated_at 据え置き");
    });

    runTest('同じ台帳を二重に入れても1件', function () use ($port, &$catId, $a) {
        httpJson($port, "/ledger-catalogs/$catId/items", 'PUT', ['tategu_item_ids' => [$a, $a]]);
        $g = httpJson($port, "/ledger-catalogs/$catId/items", 'GET');
        assertEq(1, count($g['body']), '件数');
    });

    runTest('GET /ledger-catalogs は件数つき（使用不可は数えない）、PUT で名前と順番を変える', function () use ($pdo, $port, &$catId, $a, $gone) {
        httpJson($port, "/ledger-catalogs/$catId/items", 'PUT', ['tategu_item_ids' => [$a, $gone]]);
        $second = httpJson($port, '/ledger-catalogs', 'POST', ['name' => '框カタログ']);
        $secondId = (int)$second['body']['id'];
        $r = httpJson($port, "/ledger-catalogs/$catId", 'PUT', ['name' => '障子カタログ改', 'sort_order' => 5]);
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        httpJson($port, "/ledger-catalogs/$secondId", 'PUT', ['name' => '框カタログ', 'sort_order' => 1]);
        $l = httpJson($port, '/ledger-catalogs', 'GET');
        assertEq([$secondId, $catId], array_map(fn($x) => (int)$x['id'], $l['body']), 'sort_order 順');
        assertEq('障子カタログ改', $l['body'][1]['name'], '改名');
        assertEq(1, (int)$l['body'][1]['item_count'], '件数');
        assertEq(0, (int)$l['body'][0]['item_count'], '空のカタログ');
    });

    runTest('DELETE でカタログと中身が消え、台帳は残り updated_at も据え置き', function () use ($pdo, $port, &$catId, $a) {
        $r = httpJson($port, "/ledger-catalogs/$catId", 'DELETE');
        assertTrue(str_contains($r['status'], '200'), 'status: ' . $r['status']);
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM ledger_catalogs WHERE id = $catId")->fetchColumn(), 'カタログ');
        assertEq(0, (int)$pdo->query("SELECT COUNT(*) FROM ledger_catalog_items WHERE catalog_id = $catId")->fetchColumn(), '中身');
        assertEq(1, (int)$pdo->query("SELECT COUNT(*) FROM tategu_items WHERE id = $a")->fetchColumn(), '台帳は残る');
        assertEq(OLD_TS, updatedAt($pdo, $a), 'updated_at');
    });

    runTest('カタログの操作は同期に出さない（台帳の updated_at が進まない）', function () use ($pdo, $port) {
        $r = httpJson($port, '/tategu-items/sync?since=' . rawurlencode('2026-06-01 00:00:00'), 'GET');
        assertEq(0, count($r['body']['data']), '2026-06-01 以降に更新された台帳は無い');
    });
} finally {
    harnessFinish();
}
