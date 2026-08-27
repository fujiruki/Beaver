<?php
/**
 * R-0117: Beaver-Youkan連携 B1 — 案件工数の外部契約API（読み取り専用）
 *
 * GET /integrations/youkan/projects[?updated_after=...][&limit=200][&cursor=ID]  一覧
 * GET /integrations/youkan/projects/{id}                                         単体
 *
 * 認証は index.php の authGateHasValidYoukanToken() で完了済み。
 * 契約仕様: docs/spec/R-0117_youkan_integration_b1.md / docs/spec/R-0117_youkan_api_contract.md
 */

require_once __DIR__ . '/list_helpers.php';

$segments = explode('/', trim($path, '/'));
// $path 例: /integrations/youkan/projects または /integrations/youkan/projects/123
$resource     = $segments[2] ?? null;
$idSegment    = $segments[3] ?? null;
$extraSegment = $segments[4] ?? null;

// R-034(b)の教訓: 完全一致ガード。余分なパスセグメントや未知のリソースは404。
if ($resource !== 'projects' || $extraSegment !== null) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found', 'path' => $path]);
    exit;
}

$resourceId = null;
if ($idSegment !== null) {
    if (!is_numeric($idSegment)) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found', 'path' => $path]);
        exit;
    }
    $resourceId = (int)$idSegment;
}

if ($method !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

/** DB(UTC)の日時文字列をJSTのISO8601へ変換する。null/空/パース不能はnullを返す。 */
function youkanToIso8601(?string $utcValue): ?string {
    if ($utcValue === null || $utcValue === '') return null;
    try {
        $dt = new DateTime($utcValue, new DateTimeZone('UTC'));
        $dt->setTimezone(new DateTimeZone('Asia/Tokyo'));
        return $dt->format('c');
    } catch (Throwable $e) {
        return null;
    }
}

/** R-0120: 見積明細を行単位・カテゴリ単位のwork_packages契約へ整形する。 */
function youkanWorkPackages(array $rows): array {
    $packages = [];
    foreach ($rows as $row) {
        $voucherId = (int)$row['voucher_id'];
        $lineId = (int)$row['line_id'];
        $label = trim((string)($row['item_name'] ?? ''));
        if ($label === '') $label = '明細' . (int)$row['line_no'];

        foreach (['factory' => 'cost_factory_hours', 'site' => 'cost_site_hours'] as $category => $column) {
            $estimatedHours = round((float)$row[$column] * (int)$row['quantity'], 2);
            if ($estimatedHours <= 0) continue;
            $packages[] = [
                'external_work_package_id' => "beaver:voucher:$voucherId:line:$lineId:$category",
                'label'                    => $label,
                'category'                 => $category,
                'estimated_hours'          => $estimatedHours,
                'source_voucher_id'        => $voucherId,
                'source_line_id'           => $lineId,
                'updated_at'               => youkanToIso8601($row['updated_at']),
            ];
        }
    }
    return $packages;
}

/** 契約フィールドへ整形する（計画書§4.3 / 仕様書のサンプルJSON準拠）。 */
function youkanProjectRow(array $p, array $baseline, array $workPackageRows = []): array {
    return [
        'source'              => 'beaver',
        'external_project_id' => (int)$p['id'],
        'project_code'        => $p['project_code'],
        'name'                => $p['name'],
        'customer_name'       => $p['customer_name'],
        'status'              => $p['status'],
        'delivery_date'       => $p['delivery_date'],
        'baseline_hours'      => $baseline['hours'],
        'baseline_source'     => $baseline['source'],
        'baseline_updated_at' => youkanToIso8601($baseline['updated_at']),
        'updated_at'          => youkanToIso8601($p['updated_at']),
        'work_packages'       => $baseline['source'] === 'estimate' ? youkanWorkPackages($workPackageRows) : [],
    ];
}

const YOUKAN_PROJECT_SELECT = '
    SELECT p.id, p.project_code, p.name, p.status, p.delivery_date, p.manual_estimated_hours, p.updated_at,
           c.name AS customer_name
    FROM projects p
    LEFT JOIN customers c ON c.id = p.customer_id
';

if ($resourceId !== null) {
    $stmt = $pdo->prepare(YOUKAN_PROJECT_SELECT . ' WHERE p.id = ?');
    $stmt->execute([$resourceId]);
    $row = $stmt->fetch();
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        exit;
    }
    $baselines = fetchProjectBaselines($pdo, [$row]);
    $baseline = $baselines[(int)$row['id']];
    $workPackagesByVoucherId = $baseline['voucher_id'] === null
        ? []
        : fetchWorkPackagesByVoucherIds($pdo, [$baseline['voucher_id']]);
    echo json_encode(youkanProjectRow($row, $baseline, $workPackagesByVoucherId[$baseline['voucher_id']] ?? []));
    exit;
}

// --- 一覧: updated_after / limit(既定200・最大1000) / cursor(since_id方式) ---
$updatedAfterRaw = $_GET['updated_after'] ?? null;
$updatedAfterSql = null;
if ($updatedAfterRaw !== null && $updatedAfterRaw !== '') {
    $ts = strtotime($updatedAfterRaw);
    if ($ts === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid updated_after format']);
        exit;
    }
    $updatedAfterSql = gmdate('Y-m-d H:i:s', $ts);
}

$limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
if ($limit < 1)    $limit = 200;
if ($limit > 1000) $limit = 1000;

$cursor = null;
if (isset($_GET['cursor']) && $_GET['cursor'] !== '') {
    if (!is_numeric($_GET['cursor'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid cursor (numeric id required)']);
        exit;
    }
    $cursor = (int)$_GET['cursor'];
}

$sql = YOUKAN_PROJECT_SELECT . ' WHERE 1=1';
$params = [];
if ($updatedAfterSql !== null) {
    $sql .= ' AND p.updated_at > :updated_after';
    $params[':updated_after'] = $updatedAfterSql;
}
if ($cursor !== null) {
    $sql .= ' AND p.id > :cursor';
    $params[':cursor'] = $cursor;
}
// cursorページングの安定性のため id ASC（updated_at DESCではページング順が崩れる）
$sql .= ' ORDER BY p.id ASC LIMIT :limit_plus_one';
$params[':limit_plus_one'] = $limit + 1;

$stmt = $pdo->prepare($sql);
foreach ($params as $k => $v) {
    $type = ($k === ':limit_plus_one' || $k === ':cursor') ? PDO::PARAM_INT : PDO::PARAM_STR;
    $stmt->bindValue($k, $v, $type);
}
$stmt->execute();
$rows = $stmt->fetchAll();

$nextCursor = null;
if (count($rows) > $limit) {
    $rows = array_slice($rows, 0, $limit);
    $lastRow = end($rows);
    if (is_array($lastRow) && isset($lastRow['id'])) {
        $nextCursor = (int)$lastRow['id'];
    }
    reset($rows);
}

$baselines = fetchProjectBaselines($pdo, $rows);
$voucherIds = array_values(array_filter(array_column($baselines, 'voucher_id'), fn($id) => $id !== null));
$workPackagesByVoucherId = fetchWorkPackagesByVoucherIds($pdo, $voucherIds);
$data = [];
foreach ($rows as $row) {
    $baseline = $baselines[(int)$row['id']];
    $data[] = youkanProjectRow($row, $baseline, $workPackagesByVoucherId[$baseline['voucher_id']] ?? []);
}

echo json_encode(['data' => $data, 'next_cursor' => $nextCursor]);
exit;
