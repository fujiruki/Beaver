<?php
/**
 * R-0268 樹種表（Access -> Beaver の片方向）
 * GET /wood-species        一覧（全件）
 * PUT /wood-species/sync   access_id で足す・書き換え。来なかった樹種は disabled にする（消さない）
 */

require_once __DIR__ . '/sync_helpers.php';

function woodSpeciesAll(PDO $pdo): array {
    $rows = $pdo->query("SELECT access_id, name, unit_price_man, disabled, sort_order, tateds_species_key FROM wood_species ORDER BY sort_order, access_id")->fetchAll();
    foreach ($rows as &$r) $r["disabled"] = (bool)$r["disabled"];
    return $rows;
}

if ($path === "/wood-species" && $method === "GET") {
    respond(200, ["data" => woodSpeciesAll($pdo)]);
    exit;
}
if ($path === "/wood-species/sync" && $method === "PUT") {
    $items = readJsonBody()["items"] ?? null;
    if (!is_array($items)) { respond(400, ["error" => "invalid_items"]); exit; }
    $pdo->beginTransaction();
    try {
        $seen = [];
        $up = $pdo->prepare("INSERT INTO wood_species (access_id, name, unit_price_man, disabled, sort_order, tateds_species_key)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(access_id) DO UPDATE SET name = excluded.name, unit_price_man = excluded.unit_price_man,
                disabled = excluded.disabled, sort_order = excluded.sort_order, tateds_species_key = excluded.tateds_species_key,
                updated_at = CURRENT_TIMESTAMP");
        foreach ($items as $i => $it) {
            $aid = (int)($it["access_id"] ?? 0);
            $seen[] = $aid;
            $up->execute([$aid, (string)($it["name"] ?? ""), (float)($it["unit_price_man"] ?? 0), !empty($it["disabled"]) ? 1 : 0,
                (int)($it["sort_order"] ?? $i), $it["tateds_species_key"] ?? null]);
        }
        $in = $seen ? implode(",", array_map("intval", $seen)) : "NULL";
        $pdo->exec("UPDATE wood_species SET disabled = 1, updated_at = CURRENT_TIMESTAMP WHERE disabled = 0 AND access_id NOT IN ($in)");
        $pdo->commit();
    } catch (Throwable $e) { $pdo->rollBack(); throw $e; }
    respond(200, ["data" => woodSpeciesAll($pdo)]);
    exit;
}
