<?php
/**
 * 案件の予定（R-0220）
 * GET    /project-schedules            全案件の予定（論理削除の案件を除く）
 * GET    /projects/{id}/schedules      その案件の予定
 * POST   /projects/{id}/schedules      追加
 * PUT    /project-schedules/{id}       部分更新
 * DELETE /project-schedules/{id}       削除
 *
 * Access とは同期しないので projects.updated_at は進めない。
 */

const PROJECT_SCHEDULE_KINDS = ['見積', '見積依頼', '現調', '打合せ', '材料発注', '外注依頼', '取付', 'その他'];

function scheduleFail(int $code, string $error): void {
    http_response_code($code);
    echo json_encode(['error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}

function scheduleDateOrNull($value): ?string {
    if ($value === null || $value === '') return null;
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) || strtotime($value) === false) {
        scheduleFail(422, 'invalid_date');
    }
    return $value;
}

function scheduleFind(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM project_schedules WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetch() ?: null;
}

function scheduleListSql(string $where): string {
    return "SELECT s.* FROM project_schedules s JOIN projects p ON p.id = s.project_id
            WHERE p.deleted_at IS NULL $where ORDER BY s.end_date, s.id";
}

$segments = explode('/', trim($path, '/'));
$data = in_array($method, ['POST', 'PUT'], true)
    ? (json_decode(file_get_contents('php://input'), true) ?? [])
    : [];

if ($segments[0] === 'projects') {
    $projectId = (int)($segments[1] ?? 0);

    if ($method === 'GET') {
        $stmt = $pdo->prepare(scheduleListSql('AND s.project_id = ?'));
        $stmt->execute([$projectId]);
        echo json_encode($stmt->fetchAll());
        exit;
    }

    if ($method === 'POST') {
        $exists = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE id = ? AND deleted_at IS NULL');
        $exists->execute([$projectId]);
        if (!$exists->fetchColumn()) scheduleFail(404, 'project_not_found');

        $kind = $data['kind'] ?? null;
        if (!in_array($kind, PROJECT_SCHEDULE_KINDS, true)) scheduleFail(422, 'invalid_kind');
        $start = scheduleDateOrNull($data['start_date'] ?? null);
        $end = scheduleDateOrNull($data['end_date'] ?? null);
        if ($end === null) scheduleFail(422, 'end_date_required');
        if ($start !== null && $start > $end) scheduleFail(422, 'start_after_end');

        $pdo->prepare('INSERT INTO project_schedules (project_id, kind, start_date, end_date, memo, done) VALUES (?, ?, ?, ?, ?, ?)')
            ->execute([$projectId, $kind, $start, $end, (string)($data['memo'] ?? ''), empty($data['done']) ? 0 : 1]);
        http_response_code(201);
        echo json_encode(scheduleFind($pdo, (int)$pdo->lastInsertId()));
        exit;
    }

    scheduleFail(405, 'method_not_allowed');
}

$id = (int)($segments[1] ?? 0);

if ($id === 0) {
    if ($method !== 'GET') scheduleFail(405, 'method_not_allowed');
    echo json_encode($pdo->query(scheduleListSql(''))->fetchAll());
    exit;
}

$current = scheduleFind($pdo, $id);
if ($current === null) scheduleFail(404, 'not_found');

if ($method === 'DELETE') {
    $pdo->prepare('DELETE FROM project_schedules WHERE id = ?')->execute([$id]);
    echo json_encode(['deleted' => true]);
    exit;
}

if ($method !== 'PUT') scheduleFail(405, 'method_not_allowed');

$kind = array_key_exists('kind', $data) ? $data['kind'] : $current['kind'];
if (!in_array($kind, PROJECT_SCHEDULE_KINDS, true)) scheduleFail(422, 'invalid_kind');
$start = array_key_exists('start_date', $data) ? scheduleDateOrNull($data['start_date']) : $current['start_date'];
$end = array_key_exists('end_date', $data) ? scheduleDateOrNull($data['end_date']) : $current['end_date'];
if ($end === null) scheduleFail(422, 'end_date_required');
if ($start !== null && $start > $end) scheduleFail(422, 'start_after_end');
$memo = array_key_exists('memo', $data) ? (string)$data['memo'] : $current['memo'];
$done = array_key_exists('done', $data) ? (empty($data['done']) ? 0 : 1) : (int)$current['done'];

$pdo->prepare('UPDATE project_schedules SET kind = ?, start_date = ?, end_date = ?, memo = ?, done = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    ->execute([$kind, $start, $end, $memo, $done, $id]);
echo json_encode(scheduleFind($pdo, $id));
