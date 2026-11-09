<?php
/**
 * R-0253 製品台帳の一覧に入っているカタログの名前（catalog_names / catalog_ids）
 *
 * 起動: php api/tests/test_r0253_ledger_list_catalog_names.php
 */

declare(strict_types=1);

$harnessName = 'test_r0253_ledger_list_catalog_names';
$harnessPort = 18132;
require __DIR__ . '/_http_test_harness.php';

const OLD_TS = '2026-01-01 00:00:00';

function newItem(PDO $pdo, string $code, string $name): int {
    $pdo->prepare('INSERT INTO tategu_items (code, name, status, updated_at) VALUES (?, ?, ?, ?)')
        ->execute([$code, $name, 'active', OLD_TS]);
    return (int)$pdo->lastInsertId();
}

function findRow(array $rows, int $id): ?array {
    foreach ($rows as $r) if ((int)$r['id'] === $id) return $r;
    return null;
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    $a = newItem($pdo, '91001', '障子A');
    $b = newItem($pdo, '91002', '障子B');
    $c = newItem($pdo, '91003', '障子C');

    $late = (int)httpJson($port, '/ledger-catalogs', 'POST', ['name' => '框カタログ'])['body']['id'];
    $early = (int)httpJson($port, '/ledger-catalogs', 'POST', ['name' => '障子カタログ'])['body']['id'];
    httpJson($port, "/ledger-catalogs/$late", 'PUT', ['name' => '框カタログ', 'sort_order' => 9]);
    httpJson($port, "/ledger-catalogs/$early", 'PUT', ['name' => '障子カタログ', 'sort_order' => 2]);
    httpJson($port, "/ledger-catalogs/$late/items", 'PUT', ['tategu_item_ids' => [$a]]);
    httpJson($port, "/ledger-catalogs/$early/items", 'PUT', ['tategu_item_ids' => [$a, $b]]);

    runTest('一覧の catalog_names はカタログの順、入っていない台帳は空配列', function () use ($port, $a, $b, $c, $early, $late) {
        $all = httpJson($port, '/tategu-items', 'GET')['body'];
        $ra = findRow($all, $a);
        assertEq(['障子カタログ', '框カタログ'], $ra['catalog_names'], 'a の名前');
        assertEq([$early, $late], array_map('intval', $ra['catalog_ids']), 'a の id');
        assertEq(['障子カタログ'], findRow($all, $b)['catalog_names'], 'b の名前');
        assertEq([], findRow($all, $c)['catalog_names'], 'c は空');
        assertEq([], findRow($all, $c)['catalog_ids'], 'c の id は空');
    });

    runTest('ページ付きの一覧にも入る', function () use ($port, $a) {
        $paged = httpJson($port, '/tategu-items?page=1', 'GET')['body'];
        assertEq(['障子カタログ', '框カタログ'], findRow($paged['data'], $a)['catalog_names'], '名前');
    });

    runTest('同期の返り値には出ない', function () use ($port) {
        $r = httpJson($port, '/tategu-items/sync?since=' . rawurlencode('1970-01-01 00:00:00'), 'GET');
        assertTrue(count($r['body']['data']) > 0, '同期の行がある');
        foreach ($r['body']['data'] as $row) {
            assertTrue(!array_key_exists('catalog_names', $row), 'catalog_names が出ている');
            assertTrue(!array_key_exists('catalog_ids', $row), 'catalog_ids が出ている');
        }
    });

    runTest('PUT items で台帳を除くと一覧から名前が消え、updated_at は変わらない', function () use ($pdo, $port, $a, $b, $early) {
        httpJson($port, "/ledger-catalogs/$early/items", 'PUT', ['tategu_item_ids' => [$b]]);
        $all = httpJson($port, '/tategu-items', 'GET')['body'];
        assertEq(['框カタログ'], findRow($all, $a)['catalog_names'], '外れた');
        assertEq(OLD_TS, (string)$pdo->query("SELECT updated_at FROM tategu_items WHERE id = $a")->fetchColumn(), 'updated_at');
    });
} finally {
    harnessFinish();
}
