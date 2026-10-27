<?php
/**
 * /sync エンドポイント（R-0143 A-B-06）
 * POST /sync/heartbeat  Accessからの最終疎通時刻を保存
 * GET  /sync/status     同期先AppID・最終同期時刻を返す（通常認証）
 * GET  /sync/changes    指定時刻以降にBeaverで変更された件数を返す
 */

require_once __DIR__ . '/sync_helpers.php';

$segments  = explode('/', trim($path, '/'));
$subAction = $segments[1] ?? null;

if ($method === 'POST' && $subAction === 'heartbeat') {
    $data = readJsonBody();
    $syncedAt = isset($data['synced_at']) ? (string)$data['synced_at'] : null;
    $source   = isset($data['source']) ? (string)$data['source'] : null;
    $pdo->prepare('UPDATE sync_heartbeats SET synced_at = :synced_at, source = :source WHERE id = 1')
        ->execute([':synced_at' => $syncedAt, ':source' => $source]);
    respond(200, ['status' => 'ok']);
    exit;
}

if ($method === 'GET' && $subAction === 'status') {
    $row = $pdo->query('SELECT synced_at, source FROM sync_heartbeats WHERE id = 1')->fetch();
    respond(200, [
        'app_id'         => APP_ID,
        'last_synced_at' => ($row && $row['synced_at'] !== null) ? utcToJst($row['synced_at']) : null,
        'source'         => $row['source'] ?? null,
    ]);
    exit;
}

if ($method === 'GET' && $subAction === 'changes') {
    $since = isset($_GET['since']) && is_string($_GET['since'])
        ? jstToUtc($_GET['since'])
        : null;
    if ($since === null) {
        respond(400, ['error' => 'Invalid since']);
        exit;
    }

    $counts = [];
    foreach (['customers', 'vouchers'] as $table) {
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM $table
             WHERE updated_at > :since
               AND (last_synced_at IS NULL OR updated_at > last_synced_at)"
        );
        $stmt->execute([':since' => $since]);
        $counts[$table] = (int)$stmt->fetchColumn();
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE updated_at > :since');
    $stmt->execute([':since' => $since]);
    $counts['projects'] = (int)$stmt->fetchColumn();

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM tategu_items WHERE updated_at > :since');
    $stmt->execute([':since' => $since]);
    $counts['tategu_items'] = (int)$stmt->fetchColumn();

    respond(200, [
        'customers'  => $counts['customers'],
        'vouchers'   => $counts['vouchers'],
        'projects'   => $counts['projects'],
        'tategu_items' => $counts['tategu_items'],
        'server_time' => utcToJst(gmdate('Y-m-d H:i:s')),
    ]);
    exit;
}

respond(404, ['error' => 'Not found', 'path' => $path]);
