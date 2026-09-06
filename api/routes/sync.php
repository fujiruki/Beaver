<?php
/**
 * /sync エンドポイント（R-0143 A-B-06）
 * POST /sync/heartbeat  Accessからの最終疎通時刻を保存
 * GET  /sync/status     同期先AppID・最終同期時刻を返す（通常認証）
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

respond(404, ['error' => 'Not found', 'path' => $path]);
