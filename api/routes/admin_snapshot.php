<?php
/**
 * R-0144 B-1: Beaver_betaスナップショット保存・復元（Dodaikun v1受入テスト自動化用）
 * POST /admin/snapshot/save     現在のDBを名前付きで保存（VACUUM INTO）
 * POST /admin/snapshot/restore  保存済みDBで現在のDBを置換
 * GET  /admin/snapshot/list     保存済みスナップショット一覧
 *
 * 本番Beaverを絶対に巻き込まないため、以下3つの歯止め全てを満たさない限り403で拒否する。
 *   1. 環境変数 BETA_SNAPSHOT_ENABLED=1
 *   2. APP_ID === 'Beaver_beta'
 *   3. DB接続先の実ファイルパスに 'Beaver_beta' を含む
 */

require_once __DIR__ . '/sync_helpers.php';

define('BETA_SNAPSHOT_DIR', dirname(__DIR__) . '/beta_snapshots');
define('BETA_SNAPSHOT_LOCK_FILE', BETA_SNAPSHOT_DIR . '/.restoring');

function betaSnapshotGuardOk(PDO $pdo): bool {
    if (!BETA_SNAPSHOT_ENABLED) return false;
    if (APP_ID !== 'Beaver_beta') return false;
    $row = $pdo->query('PRAGMA database_list')->fetch();
    $dbFile = $row['file'] ?? '';
    if (strpos($dbFile, 'Beaver_beta') === false) return false;
    return true;
}

function betaSnapshotSafeName(string $name): ?string {
    if ($name === '' || !preg_match('/^[A-Za-z0-9_-]+$/', $name)) return null;
    return $name;
}

if (!authGateHasValidSyncToken()) {
    respond(401, ['error' => 'unauthenticated']);
    exit;
}

if (!betaSnapshotGuardOk($pdo)) {
    respond(403, ['error' => 'beta_snapshot_disabled']);
    exit;
}

if (!is_dir(BETA_SNAPSHOT_DIR)) {
    mkdir(BETA_SNAPSHOT_DIR, 0777, true);
}

$segments  = explode('/', trim($path, '/'));
$subAction = $segments[2] ?? null;

if ($method === 'POST' && $subAction === 'save') {
    $data = readJsonBody();
    $name = betaSnapshotSafeName((string)($data['name'] ?? ''));
    if ($name === null) {
        respond(400, ['error' => 'name は英数字・アンダースコア・ハイフンのみで指定してください']);
        exit;
    }
    $snapshotPath = BETA_SNAPSHOT_DIR . '/' . $name . '.sqlite';
    try {
        $pdo->exec('VACUUM INTO ' . $pdo->quote($snapshotPath));
    } catch (Throwable $e) {
        respondInternalError($e, 'betaSnapshotSave');
        exit;
    }
    respond(200, ['name' => $name, 'saved' => true, 'size' => filesize($snapshotPath)]);
    exit;
}

if ($method === 'POST' && $subAction === 'restore') {
    $data = readJsonBody();
    $name = betaSnapshotSafeName((string)($data['name'] ?? ''));
    if ($name === null) {
        respond(400, ['error' => 'name は英数字・アンダースコア・ハイフンのみで指定してください']);
        exit;
    }
    $snapshotPath = BETA_SNAPSHOT_DIR . '/' . $name . '.sqlite';
    if (!file_exists($snapshotPath)) {
        respond(404, ['error' => 'snapshot not found', 'name' => $name]);
        exit;
    }

    file_put_contents(BETA_SNAPSHOT_LOCK_FILE, (string)time());
    try {
        // 復元中の他リクエストとの競合を避けるため、このリクエストが保持するPDO接続を先に解放する
        Database::disconnect();
        $pdo = null;
        if (!copy($snapshotPath, DB_PATH)) {
            throw new RuntimeException('DBファイルの置換に失敗しました');
        }
        // WALモードの残骸が古い内容を指したままにならないよう削除する
        @unlink(DB_PATH . '-wal');
        @unlink(DB_PATH . '-shm');
    } catch (Throwable $e) {
        @unlink(BETA_SNAPSHOT_LOCK_FILE);
        respondInternalError($e, 'betaSnapshotRestore');
        exit;
    }
    @unlink(BETA_SNAPSHOT_LOCK_FILE);
    respond(200, ['name' => $name, 'restored' => true]);
    exit;
}

if ($method === 'GET' && $subAction === 'list') {
    $files = glob(BETA_SNAPSHOT_DIR . '/*.sqlite') ?: [];
    $list = [];
    foreach ($files as $f) {
        $list[] = [
            'name'       => basename($f, '.sqlite'),
            'size'       => filesize($f),
            'created_at' => date('Y-m-d H:i:s', filemtime($f)),
        ];
    }
    respond(200, ['snapshots' => $list]);
    exit;
}

respond(404, ['error' => 'Not found', 'path' => $path]);
