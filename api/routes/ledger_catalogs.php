<?php
/**
 * R-0252 /ledger-catalogs エンドポイント（製品台帳のまとまりと順番。Access との同期には出さない）
 * GET    /ledger-catalogs               一覧（item_count 付き）
 * POST   /ledger-catalogs               作成 {name}
 * PUT    /ledger-catalogs/{id}          {name, sort_order}
 * DELETE /ledger-catalogs/{id}
 * GET    /ledger-catalogs/{id}/items    台帳を順番どおり（使用不可は出さない）
 * PUT    /ledger-catalogs/{id}/items    {tategu_item_ids: [順番どおり]} 全件入れ替え
 */

require_once __DIR__ . '/sync_helpers.php';

$segments = explode('/', trim($path, '/'));
$catalogId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$sub = $segments[2] ?? null;

$activeJoin = "JOIN tategu_items t ON t.id = ci.tategu_item_id AND t.status = 'active'";

if ($catalogId !== null) {
    $exists = $pdo->prepare('SELECT 1 FROM ledger_catalogs WHERE id = ?');
    $exists->execute([$catalogId]);
    if (!$exists->fetchColumn()) { respond(404, ['error' => 'not_found']); exit; }
}

if ($catalogId !== null && $sub === 'items') {
    if ($method === 'GET') {
        $stmt = $pdo->prepare("SELECT t.* FROM ledger_catalog_items ci $activeJoin WHERE ci.catalog_id = ? ORDER BY ci.sort_order, t.id");
        $stmt->execute([$catalogId]);
        $rows = $stmt->fetchAll();
        foreach ($rows as &$row) {
            $row['total_cost'] = (float)$row['cost_body'] + (float)$row['cost_hardware'] + (float)$row['cost_glass']
                + ((float)$row['cost_factory_hours'] + (float)$row['cost_site_hours']) * (float)$row['cost_labor_rate'];
        }
        respond(200, $rows);
        exit;
    }
    if ($method === 'PUT') {
        $ids = readJsonBody()['tategu_item_ids'] ?? null;
        if (!is_array($ids)) { respond(400, ['error' => 'tategu_item_ids_required']); exit; }
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM ledger_catalog_items WHERE catalog_id = ?')->execute([$catalogId]);
            $ins = $pdo->prepare('INSERT OR IGNORE INTO ledger_catalog_items (catalog_id, tategu_item_id, sort_order)
                SELECT ?, id, ? FROM tategu_items WHERE id = ?');
            foreach (array_values($ids) as $i => $id) $ins->execute([$catalogId, $i, (int)$id]);
            $pdo->prepare('UPDATE ledger_catalogs SET updated_at = CURRENT_TIMESTAMP WHERE id = ?')->execute([$catalogId]);
            $pdo->commit();
        } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
        respond(200, ['ok' => true]);
        exit;
    }
}

if ($catalogId === null && $method === 'GET') {
    $rows = $pdo->query("SELECT c.id, c.name, c.sort_order,
        (SELECT COUNT(*) FROM ledger_catalog_items ci $activeJoin WHERE ci.catalog_id = c.id) AS item_count
        FROM ledger_catalogs c ORDER BY c.sort_order, c.id")->fetchAll();
    respond(200, $rows);
    exit;
}

if ($catalogId === null && $method === 'POST') {
    $name = trim((string)(readJsonBody()['name'] ?? ''));
    if ($name === '') { respond(400, ['error' => 'name_required']); exit; }
    $next = (int)$pdo->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM ledger_catalogs')->fetchColumn();
    $pdo->prepare('INSERT INTO ledger_catalogs (name, sort_order) VALUES (?, ?)')->execute([$name, $next]);
    respond(201, ['id' => (int)$pdo->lastInsertId(), 'name' => $name, 'sort_order' => $next, 'item_count' => 0]);
    exit;
}

if ($catalogId !== null && $sub === null && $method === 'PUT') {
    $data = readJsonBody();
    $name = trim((string)($data['name'] ?? ''));
    if ($name === '') { respond(400, ['error' => 'name_required']); exit; }
    $pdo->prepare('UPDATE ledger_catalogs SET name = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        ->execute([$name, (int)($data['sort_order'] ?? 0), $catalogId]);
    respond(200, ['ok' => true]);
    exit;
}

if ($catalogId !== null && $sub === null && $method === 'DELETE') {
    $pdo->prepare('DELETE FROM ledger_catalog_items WHERE catalog_id = ?')->execute([$catalogId]);
    $pdo->prepare('DELETE FROM ledger_catalogs WHERE id = ?')->execute([$catalogId]);
    respond(200, ['deleted' => true]);
    exit;
}

respond(405, ['error' => 'Method not allowed']);
