<?php
/**
 * /vouchers エンドポイント
 * GET    /vouchers                        一覧
 * GET    /vouchers/{id}                   詳細（明細含む）
 * POST   /vouchers                        新規作成（ヘッダーのみ。明細は /lines で）
 * PUT    /vouchers/{id}                   ヘッダー更新
 * DELETE /vouchers/{id}                   void（無効化）
 * POST   /vouchers/{id}/convert-to-sales  見積→売上変換（ディープコピー）
 * POST   /vouchers/{id}/reload-snapshots  スナップショット一括再読み込み
 * GET    /vouchers/{id}/lines             明細一覧
 * POST   /vouchers/{id}/lines             明細追加
 * PUT    /vouchers/{id}/lines/{lineId}    明細更新
 * DELETE /vouchers/{id}/lines/{lineId}    明細削除
 */

$segments   = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subAction  = $segments[2] ?? null;
$subId      = isset($segments[3]) && is_numeric($segments[3]) ? (int)$segments[3] : null;

require_once __DIR__ . '/sync_helpers.php';
require_once __DIR__ . '/list_helpers.php';
require_once dirname(__DIR__) . '/search_helpers.php';

// --- R-076 B2-3: Beaver発新規伝票の Access 採番IDを書き戻す ---
// PATCH /vouchers/{id}/access-link
if ($method === 'PATCH' && $resourceId && $subAction === 'access-link') {
    syncVoucherAccessLink($pdo, $resourceId);
    exit;
}

// --- R-025 Step E-Beaver: 案件番号なしの過去伝票 push 受信 ---
// POST /vouchers/sync
if ($method === 'POST' && isset($segments[1]) && $segments[1] === 'sync' && !$resourceId) {
    syncVoucherUpsert($pdo, null);
    exit;
}

// --- R-060 Phase2a: Beaver→Access 伝票同期用 軽量増分API ---
// GET /vouchers/sync[?updated_after=YYYY-MM-DD HH:NN:SS (JST)][&limit=N][&cursor=ID]
// 完全一致チェック（/vouchers/sync/anything を全件返却で誤通過させない）
if ($method === 'GET' && isset($segments[1]) && $segments[1] === 'sync' && isset($segments[2])) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found', 'path' => $path]);
    exit;
}
if ($method === 'GET' && isset($segments[1]) && $segments[1] === 'sync' && !isset($segments[2])) {
    // R-076 B1-1: updated_after は JST の 'Y-m-d H:i:s' として受け取る契約（Access側の送信形式）。
    // DB列 v.updated_at は UTC 保存のため、比較前に UTC へ逆変換する。
    $updatedAfterRaw = $_GET['updated_after'] ?? null;
    $updatedAfterSql = null;
    if ($updatedAfterRaw !== null && $updatedAfterRaw !== '') {
        $updatedAfterDt = DateTime::createFromFormat('Y-m-d H:i:s', $updatedAfterRaw, new DateTimeZone('Asia/Tokyo'));
        if ($updatedAfterDt === false || $updatedAfterDt->format('Y-m-d H:i:s') !== $updatedAfterRaw) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid updated_after format']);
            exit;
        }
        $updatedAfterDt->setTimezone(new DateTimeZone('UTC'));
        $updatedAfterSql = $updatedAfterDt->format('Y-m-d H:i:s');
    }

    // pagination: デフォルト limit=1000、最大 5000、cursor は since_id 方式（id > cursor 昇順）
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 1000;
    if ($limit < 1)    $limit = 1000;
    if ($limit > 5000) $limit = 5000;

    $cursor = null;
    if (isset($_GET['cursor']) && $_GET['cursor'] !== '') {
        if (!is_numeric($_GET['cursor'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Invalid cursor (numeric id required)']);
            exit;
        }
        $cursor = (int)$_GET['cursor'];
    }

    // R-076 B2-1: Access側の競合解決フォーム表示用にヘッダ項目を拡張。
    // customer_access_no は customers.access_customer_no を LEFT JOIN で取得する
    // （syncVoucherUpsert が customer_access_no から customer_id を解決する経路と対になる）。
    $sql = 'SELECT v.id, v.voucher_no, v.voucher_type, v.status, v.voucher_date,
                   v.access_voucher_id, v.access_voucher_no, v.customer_id, v.project_id,
                   v.total_amount, v.updated_at, v.last_synced_at,
                   v.trade_type, v.consumption_tax_type, v.description,
                   v.print_date_flag, v.print_tax_excl_flag, v.print_company_seal,
                   v.sales_category_id, v.delivery_date, v.billing_date,
                   v.source_estimate_no, v.validity_period,
                   c.access_customer_no AS customer_access_no
            FROM vouchers v
            LEFT JOIN customers c ON c.id = v.customer_id
            WHERE 1=1';
    $params = [];
    if ($updatedAfterSql !== null) {
        $sql .= ' AND v.updated_at > :updated_after';
        $params[':updated_after'] = $updatedAfterSql;
    }
    if ($cursor !== null) {
        $sql .= ' AND v.id > :cursor';
        $params[':cursor'] = $cursor;
    }
    $sql .= ' ORDER BY v.id ASC LIMIT :limit_plus_one';
    $params[':limit_plus_one'] = $limit + 1; // next_cursor 検出のため +1 件取得

    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $val) {
        $type = ($k === ':limit_plus_one' || $k === ':cursor') ? PDO::PARAM_INT : PDO::PARAM_STR;
        $stmt->bindValue($k, $val, $type);
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

    // R-060 Phase2b/2c Stage2: 各伝票に明細行単位の状態（access_line_id/updated_at/edited_in_beaver等）を含める。
    // 明細行競合の検知・解決は Access 側に一本化するため、Beaver は現状を正直に返すだけでよい（§7.4）。
    $voucherIds = array_column($rows, 'id');
    $linesByVoucherId = [];
    if (!empty($voucherIds)) {
        $placeholders = implode(',', array_fill(0, count($voucherIds), '?'));
        $lineStmt = $pdo->prepare("
            SELECT voucher_id, access_line_id, line_no, item_name, quantity,
                   price_body, price_hardware, price_glass, line_total,
                   tax_category, memo, updated_at, edited_in_beaver
            FROM voucher_lines
            WHERE voucher_id IN ($placeholders)
            ORDER BY voucher_id ASC, line_no ASC
        ");
        $lineStmt->execute($voucherIds);
        foreach ($lineStmt->fetchAll() as $lineRow) {
            $vid = (int)$lineRow['voucher_id'];
            unset($lineRow['voucher_id']);
            $lineRow['access_line_id']   = $lineRow['access_line_id'] !== null ? (int)$lineRow['access_line_id'] : null;
            $lineRow['edited_in_beaver'] = (int)$lineRow['edited_in_beaver'];
            if ($lineRow['tax_category'] === 'taxable') $lineRow['tax_category'] = '課税';
            if ($lineRow['tax_category'] === 'non_taxable') $lineRow['tax_category'] = '非課税';
            // R-076 B1-1: 明細の updated_at も UTC→JST に統一する。
            $lineRow['updated_at']       = utcToJst($lineRow['updated_at']);
            $linesByVoucherId[$vid][] = $lineRow;
        }
    }
    foreach ($rows as &$row) {
        // R-076 B1-1: ヘッダーの updated_at / last_synced_at を UTC→JST に統一する。
        $row['updated_at']     = utcToJst($row['updated_at']);
        $row['last_synced_at'] = utcToJst($row['last_synced_at']);
        $row['lines'] = $linesByVoucherId[(int)$row['id']] ?? [];
    }
    unset($row);

    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $response = [
        'synced_at' => $now->format('c'),
        'vouchers'  => $rows,
        'total'     => count($rows),
        'limit'     => $limit,
    ];
    if ($nextCursor !== null) {
        $response['next_cursor'] = $nextCursor;
    }
    echo json_encode($response);
    exit;
}

// --- 伝票番号採番 ---
function nextVoucherNo(PDO $pdo, string $type): string {
    $pdo->beginTransaction();
    $key = ($type === 'estimate') ? 'estimate' : 'sales';
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = ?');
    $stmt->execute([$key]);
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = ?')->execute([$no, $key]);
    $pdo->commit();
    $prefix = ($type === 'estimate') ? 'E' : 'S';
    return $prefix . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

// --- 伝票合計を再計算して vouchers を更新 ---
function recalcVoucher(PDO $pdo, int $voucherId): void {
    $stmt = $pdo->prepare('SELECT tax_input_type FROM vouchers WHERE id = ?');
    $stmt->execute([$voucherId]);
    $v = $stmt->fetch();

    $taxStmt = $pdo->query('SELECT rate FROM tax_rates ORDER BY valid_from DESC LIMIT 1');
    $taxRate = (float)$taxStmt->fetchColumn();

    $lStmt = $pdo->prepare('SELECT line_type, line_total, tax_category FROM voucher_lines WHERE voucher_id = ?');
    $lStmt->execute([$voucherId]);
    $lines = $lStmt->fetchAll();

    $taxable    = 0;
    $nontaxable = 0;
    $discount   = 0;

    foreach ($lines as $l) {
        $amt = (float)$l['line_total'];
        if ($l['line_type'] === 'discount') {
            $discount += $amt;
        } elseif ($l['tax_category'] === 'taxable') {
            $taxable += $amt;
        } else {
            $nontaxable += $amt;
        }
    }

    if ($v['tax_input_type'] === 'inclusive') {
        $taxAmount       = (int)floor($taxable * $taxRate / (1 + $taxRate));
        $subtotalTaxable = $taxable - $taxAmount;
        $total           = $taxable + $nontaxable - $discount;
        $pdo->prepare('
            UPDATE vouchers SET
                subtotal_taxable = ?, subtotal_nontaxable = ?, subtotal_discount = ?,
                tax_amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        ')->execute([$subtotalTaxable, $nontaxable, $discount, $taxAmount, $total, $voucherId]);
        return;
    }

    $taxAmount = (int)floor($taxable * $taxRate);
    $total     = $taxable + $nontaxable - $discount + $taxAmount;

    $pdo->prepare('
        UPDATE vouchers SET
            subtotal_taxable = ?, subtotal_nontaxable = ?, subtotal_discount = ?,
            tax_amount = ?, total_amount = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    ')->execute([$taxable, $nontaxable, $discount, $taxAmount, $total, $voucherId]);
}

// --- 明細行に建具台帳スナップショットをロード ---
function loadSnapshot(PDO $pdo, int $lineId): void {
    $stmt = $pdo->prepare('SELECT tategu_item_id FROM voucher_lines WHERE id = ?');
    $stmt->execute([$lineId]);
    $tId = $stmt->fetchColumn();
    if (!$tId) return;

    $t = $pdo->prepare('SELECT cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate FROM tategu_items WHERE id = ?');
    $t->execute([$tId]);
    $costs = $t->fetch();
    if (!$costs) return;

    $pdo->prepare('
        UPDATE voucher_lines SET
            cost_body = :cost_body, cost_hardware = :cost_hardware, cost_glass = :cost_glass,
            cost_factory_hours = :cost_factory_hours, cost_site_hours = :cost_site_hours,
            cost_labor_rate = :cost_labor_rate, snapshot_loaded_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ')->execute(array_merge($costs, [':id' => $lineId]));

    // cost_breakdown があれば voucher_line_costs へ同期
    $bdStmt = $pdo->prepare('SELECT * FROM tategu_item_cost_breakdown WHERE tategu_item_id = ? ORDER BY sort_order');
    $bdStmt->execute([$tId]);
    $breakdown = $bdStmt->fetchAll();
    if (!empty($breakdown)) {
        $pdo->prepare('DELETE FROM voucher_line_costs WHERE voucher_line_id = ?')->execute([$lineId]);
        $ins = $pdo->prepare('
            INSERT INTO voucher_line_costs (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
            VALUES (:voucher_line_id, :category_code, :category_name, :measure_type, :value, :sort_order)
        ');
        foreach ($breakdown as $bd) {
            $ins->execute([
                ':voucher_line_id' => $lineId,
                ':category_code'   => $bd['category_code'],
                ':category_name'   => $bd['category_name'],
                ':measure_type'    => $bd['measure_type'],
                ':value'           => (float)$bd['value'],
                ':sort_order'      => (int)$bd['sort_order'],
            ]);
        }
    }
}

// --- costs/prices サブテーブルへの書き込み ---
function saveLineCosts(PDO $pdo, int $lineId, array $costs): void {
    $pdo->prepare('DELETE FROM voucher_line_costs WHERE voucher_line_id = ?')->execute([$lineId]);
    $ins = $pdo->prepare('
        INSERT INTO voucher_line_costs (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
        VALUES (:voucher_line_id, :category_code, :category_name, :measure_type, :value, :sort_order)
    ');
    foreach ($costs as $c) {
        $ins->execute([
            ':voucher_line_id' => $lineId,
            ':category_code'   => $c['category_code'],
            ':category_name'   => $c['category_name'] ?? '',
            ':measure_type'    => $c['measure_type'],
            ':value'           => (float)($c['value'] ?? 0),
            ':sort_order'      => (int)($c['sort_order'] ?? 0),
        ]);
    }
}

function saveLinePrices(PDO $pdo, int $lineId, array $prices): void {
    $pdo->prepare('DELETE FROM voucher_line_prices WHERE voucher_line_id = ?')->execute([$lineId]);
    $ins = $pdo->prepare('
        INSERT INTO voucher_line_prices (voucher_line_id, category_code, category_name, measure_type, value, sort_order)
        VALUES (:voucher_line_id, :category_code, :category_name, :measure_type, :value, :sort_order)
    ');
    foreach ($prices as $p) {
        $ins->execute([
            ':voucher_line_id' => $lineId,
            ':category_code'   => $p['category_code'],
            ':category_name'   => $p['category_name'] ?? '',
            ':measure_type'    => $p['measure_type'],
            ':value'           => (float)($p['value'] ?? 0),
            ':sort_order'      => (int)($p['sort_order'] ?? 0),
        ]);
    }
}

// --- 固定列からのフォールバック変換 ---
function fallbackCosts(array $line): array {
    $map = [
        ['field' => 'cost_body',          'code' => 'MAIN',         'name' => '本体',     'type' => 'money', 'sort' => 1],
        ['field' => 'cost_hardware',      'code' => 'HARDWARE',     'name' => '金物',     'type' => 'money', 'sort' => 2],
        ['field' => 'cost_glass',         'code' => 'GLASS',        'name' => 'ガラス',   'type' => 'money', 'sort' => 3],
        ['field' => 'cost_factory_hours', 'code' => 'FACTORY_TIME', 'name' => '工場時間', 'type' => 'time',  'sort' => 4],
        ['field' => 'cost_site_hours',    'code' => 'SITE_TIME',    'name' => '現場時間', 'type' => 'time',  'sort' => 5],
    ];
    $costs = [];
    foreach ($map as $m) {
        $val = (float)($line[$m['field']] ?? 0);
        if ($val != 0) {
            $costs[] = [
                'id'              => null,
                'voucher_line_id' => (int)$line['id'],
                'category_code'   => $m['code'],
                'category_name'   => $m['name'],
                'measure_type'    => $m['type'],
                'value'           => $val,
                'sort_order'      => $m['sort'],
            ];
        }
    }
    return $costs;
}

function fallbackPrices(array $line): array {
    $map = [
        ['field' => 'price_body',     'code' => 'MAIN',     'name' => '本体',   'type' => 'money', 'sort' => 1],
        ['field' => 'price_hardware', 'code' => 'HARDWARE', 'name' => '金物',   'type' => 'money', 'sort' => 2],
        ['field' => 'price_glass',    'code' => 'GLASS',    'name' => 'ガラス', 'type' => 'money', 'sort' => 3],
    ];
    $prices = [];
    foreach ($map as $m) {
        $val = (float)($line[$m['field']] ?? 0);
        if ($val != 0) {
            $prices[] = [
                'id'              => null,
                'voucher_line_id' => (int)$line['id'],
                'category_code'   => $m['code'],
                'category_name'   => $m['name'],
                'measure_type'    => $m['type'],
                'value'           => $val,
                'sort_order'      => $m['sort'],
            ];
        }
    }
    return $prices;
}

// --- サブテーブルを明細行に付加 ---
function attachLineSubtables(PDO $pdo, array &$line): void {
    $cStmt = $pdo->prepare('SELECT * FROM voucher_line_costs WHERE voucher_line_id = ? ORDER BY sort_order');
    $cStmt->execute([$line['id']]);
    $costs = $cStmt->fetchAll();
    $line['costs'] = !empty($costs) ? $costs : fallbackCosts($line);

    $pStmt = $pdo->prepare('SELECT * FROM voucher_line_prices WHERE voucher_line_id = ? ORDER BY sort_order');
    $pStmt->execute([$line['id']]);
    $prices = $pStmt->fetchAll();
    $line['prices'] = !empty($prices) ? $prices : fallbackPrices($line);
}

// ---- POST /vouchers/migrate-fixed-columns ----
// 固定列のデータを costs/prices サブテーブルへ一括移行する
if ($method === 'POST' && !$resourceId && $path === '/vouchers/migrate-fixed-columns') {
    $body = json_decode(file_get_contents('php://input'), true) ?? [];
    // columnMapping: { cost_body: 'body', cost_hardware: 'hardware', ... }
    $mapping = $body['columnMapping'] ?? [];
    if (empty($mapping)) {
        http_response_code(400);
        echo json_encode(['error' => 'columnMapping が必要です']);
        exit;
    }

    // サブテーブルに未移行の明細行を全取得
    $lineStmt = $pdo->query('SELECT * FROM voucher_lines');
    $migratedCosts = 0;
    $migratedPrices = 0;

    $pdo->beginTransaction();
    foreach ($lineStmt->fetchAll() as $line) {
        $lineId = (int)$line['id'];

        // costs が未移行の行のみ処理
        $existsCosts = $pdo->prepare('SELECT COUNT(*) FROM voucher_line_costs WHERE voucher_line_id = ?');
        $existsCosts->execute([$lineId]);
        if ((int)$existsCosts->fetchColumn() === 0) {
            $newCosts = [];
            $sort = 0;
            $costCols = ['cost_body', 'cost_hardware', 'cost_glass', 'cost_factory_hours', 'cost_site_hours'];
            foreach ($costCols as $col) {
                $val = (float)($line[$col] ?? 0);
                if ($val == 0) { $sort++; continue; }
                $code = $mapping[$col] ?? null;
                if (!$code) { $sort++; continue; }
                // カテゴリ名を aggregation_category_master から取得
                $catStmt = $pdo->prepare('SELECT name, measure_type FROM aggregation_category_master WHERE code = ?');
                $catStmt->execute([$code]);
                $cat = $catStmt->fetch();
                if ($cat) {
                    $newCosts[] = [
                        'category_code' => $code,
                        'category_name' => $cat['name'],
                        'measure_type'  => $cat['measure_type'],
                        'value'         => $val,
                        'sort_order'    => $sort,
                    ];
                }
                $sort++;
            }
            if (!empty($newCosts)) {
                saveLineCosts($pdo, $lineId, $newCosts);
                $migratedCosts++;
            }
        }

        // prices が未移行の行のみ処理
        $existsPrices = $pdo->prepare('SELECT COUNT(*) FROM voucher_line_prices WHERE voucher_line_id = ?');
        $existsPrices->execute([$lineId]);
        if ((int)$existsPrices->fetchColumn() === 0) {
            $newPrices = [];
            $sort = 0;
            $priceCols = ['price_body', 'price_hardware', 'price_glass'];
            foreach ($priceCols as $col) {
                $val = (float)($line[$col] ?? 0);
                if ($val == 0) { $sort++; continue; }
                $code = $mapping[$col] ?? null;
                if (!$code) { $sort++; continue; }
                $catStmt = $pdo->prepare('SELECT name, measure_type FROM aggregation_category_master WHERE code = ?');
                $catStmt->execute([$code]);
                $cat = $catStmt->fetch();
                if ($cat) {
                    $newPrices[] = [
                        'category_code' => $code,
                        'category_name' => $cat['name'],
                        'measure_type'  => $cat['measure_type'],
                        'value'         => $val,
                        'sort_order'    => $sort,
                    ];
                }
                $sort++;
            }
            if (!empty($newPrices)) {
                saveLinePrices($pdo, $lineId, $newPrices);
                $migratedPrices++;
            }
        }
    }
    $pdo->commit();
    echo json_encode(['migrated_costs' => $migratedCosts, 'migrated_prices' => $migratedPrices]);
    exit;
}

switch ($method) {
    case 'GET':
        if ($resourceId && $subAction === 'lines') {
            $stmt = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no');
            $stmt->execute([$resourceId]);
            $lines = $stmt->fetchAll();
            foreach ($lines as &$line) {
                attachLineSubtables($pdo, $line);
            }
            unset($line);
            echo json_encode($lines);
            break;
        }
        if ($resourceId) {
            $stmt = $pdo->prepare('
                SELECT v.*, c.name AS customer_name, p.name AS project_name
                FROM vouchers v
                LEFT JOIN customers c ON c.id = v.customer_id
                LEFT JOIN projects  p ON p.id = v.project_id
                WHERE v.id = ?
            ');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) { http_response_code(404); echo json_encode(['error' => 'Not found']); exit; }

            $stmt2 = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no');
            $stmt2->execute([$resourceId]);
            $lines = $stmt2->fetchAll();
            foreach ($lines as &$line) {
                attachLineSubtables($pdo, $line);
            }
            unset($line);
            $row['lines'] = $lines;

            // 双方向トレース: 見積の場合は引用先売上を逆引きして付加
            if ($row['voucher_type'] === 'estimate') {
                $csStmt = $pdo->prepare(
                    'SELECT id, voucher_no, status, voucher_date, quoted_at FROM vouchers WHERE source_estimate_no = ? AND voucher_type = "sales" ORDER BY id'
                );
                $csStmt->execute([$row['voucher_no']]);
                $row['converted_sales'] = $csStmt->fetchAll();
            }

            echo json_encode($row);
        } else {
            $where = 'WHERE 1=1'; $params = [];
            if (!empty($_GET['voucher_type'])) { $where .= ' AND v.voucher_type = ?'; $params[] = $_GET['voucher_type']; }
            if (!empty($_GET['customer_id'])) { $where .= ' AND v.customer_id = ?'; $params[] = (int)$_GET['customer_id']; }
            if (!empty($_GET['project_id']))  { $where .= ' AND v.project_id = ?';  $params[] = (int)$_GET['project_id']; }
            if (!empty($_GET['status']))      { $where .= ' AND v.status = ?';      $params[] = $_GET['status']; }
            if (!empty($_GET['q'])) {
                [$searchClause, $searchParams] = buildMultiColumnSearchClause(
                    ['v.voucher_no', 'c.name', 'p.name', 'v.description', 'v.memo'],
                    $_GET['q']
                );
                $where .= ' AND ' . $searchClause;
                $params = array_merge($params, $searchParams);
            }
            if (isset($_GET['page'])) {
                $page    = max(1, (int)$_GET['page']);
                $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
                $offset  = ($page - 1) * $perPage;
                $cntStmt = $pdo->prepare("
                    SELECT COUNT(*) FROM vouchers v
                    LEFT JOIN customers c ON c.id = v.customer_id
                    LEFT JOIN projects p ON p.id = v.project_id
                    $where
                ");
                $cntStmt->execute($params);
                $total = (int)$cntStmt->fetchColumn();
                // R-076 Part A Phase 1: サーバソート（ホワイトリストは全てハードコード文字列・実カラム/JOIN別名のみ）
                $sortClause = resolveSortClause(
                    [
                        'voucher_no'    => 'v.voucher_no',
                        'voucher_type'  => 'v.voucher_type',
                        'status'        => 'v.status',
                        'customer_name' => 'c.name',
                        'description'   => 'v.description',
                        'project_name'  => 'p.name',
                        'voucher_date'  => 'v.voucher_date',
                        'total_amount'  => 'v.total_amount',
                    ],
                    'v.voucher_date',
                    'v.id',
                    'DESC'
                );
                $stmt  = $pdo->prepare("
                    SELECT v.*, c.name AS customer_name, p.name AS project_name
                    FROM vouchers v
                    LEFT JOIN customers c ON c.id = v.customer_id
                    LEFT JOIN projects  p ON p.id = v.project_id
                    $where $sortClause LIMIT $perPage OFFSET $offset
                ");
                $stmt->execute($params);
                echo json_encode([
                    'data' => $stmt->fetchAll(),
                    'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'last_page' => (int)ceil($total / $perPage)],
                ]);
            } else {
                $stmt = $pdo->prepare("
                    SELECT v.*, c.name AS customer_name, p.name AS project_name
                    FROM vouchers v
                    LEFT JOIN customers c ON c.id = v.customer_id
                    LEFT JOIN projects  p ON p.id = v.project_id
                    $where ORDER BY v.voucher_date DESC
                ");
                $stmt->execute($params);
                echo json_encode($stmt->fetchAll());
            }
        }
        break;

    case 'POST':
        // ---- 見積→売上変換（引用して売上） ----
        if ($resourceId && $subAction === 'convert-to-sales') {
            $src = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $src->execute([$resourceId]);
            $orig = $src->fetch();
            if (!$orig || $orig['voucher_type'] !== 'estimate') {
                http_response_code(400); echo json_encode(['error' => '見積伝票のみ変換可']); exit;
            }
            $today = date('Y-m-d');
            // nextVoucherNo は内部で独自トランザクションを完結させるため、外側 beginTransaction の前に呼ぶ
            $newNo = nextVoucherNo($pdo, 'sales');
            try {
            $pdo->beginTransaction();
            $pdo->prepare('
                INSERT INTO vouchers
                    (voucher_no, voucher_type, status, project_id, customer_id,
                     voucher_date, delivery_date, tax_input_type, consumption_tax_type,
                     cutoff_date, billing_date, override_billing_date,
                     source_voucher_id, source_estimate_no, quoted_at,
                     print_date_flag, print_tax_excl_flag, print_company_seal,
                     trade_type, profit_rate, memo, description,
                     subtotal_taxable, subtotal_nontaxable, subtotal_discount, tax_amount, total_amount)
                VALUES
                    (:voucher_no, "sales", "draft", :project_id, :customer_id,
                     :voucher_date, :delivery_date, :tax_input_type, :consumption_tax_type,
                     :cutoff_date, :billing_date, :override_billing_date,
                     :source_voucher_id, :source_estimate_no, :quoted_at,
                     :print_date_flag, :print_tax_excl_flag, :print_company_seal,
                     :trade_type, :profit_rate, :memo, :description,
                     :subtotal_taxable, :subtotal_nontaxable, :subtotal_discount, :tax_amount, :total_amount)
            ')->execute([
                ':voucher_no'           => $newNo,
                ':project_id'           => $orig['project_id'],
                ':customer_id'          => $orig['customer_id'],
                ':voucher_date'         => $today,
                ':delivery_date'        => $orig['delivery_date'],
                ':tax_input_type'       => $orig['tax_input_type'],
                ':consumption_tax_type' => $orig['consumption_tax_type'],
                ':cutoff_date'          => $orig['cutoff_date'],
                ':billing_date'         => $orig['billing_date'],
                ':override_billing_date'=> $orig['override_billing_date'],
                ':source_voucher_id'    => $resourceId,
                ':source_estimate_no'   => $orig['voucher_no'],
                ':quoted_at'            => $today,
                ':print_date_flag'      => $orig['print_date_flag'],
                ':print_tax_excl_flag'  => $orig['print_tax_excl_flag'],
                ':print_company_seal'   => $orig['print_company_seal'],
                ':trade_type'           => $orig['trade_type'],
                ':profit_rate'          => $orig['profit_rate'],
                ':memo'                 => $orig['memo'],
                ':description'          => $orig['description'],
                ':subtotal_taxable'     => $orig['subtotal_taxable'],
                ':subtotal_nontaxable'  => $orig['subtotal_nontaxable'],
                ':subtotal_discount'    => $orig['subtotal_discount'],
                ':tax_amount'           => $orig['tax_amount'],
                ':total_amount'         => $orig['total_amount'],
            ]);
            $newId = (int)$pdo->lastInsertId();

            $lines = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no');
            $lines->execute([$resourceId]);
            foreach ($lines->fetchAll() as $line) {
                $pdo->prepare('
                    INSERT INTO voucher_lines
                        (voucher_id, line_no, line_type, location_no, location_name,
                         tategu_item_id, source_catalog_item_id, item_name, quantity,
                         cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate,
                         snapshot_loaded_at, price_body, price_hardware, price_glass, line_total,
                         tax_category, memo, source, edited_in_beaver, updated_at)
                    VALUES
                        (:voucher_id, :line_no, :line_type, :location_no, :location_name,
                         :tategu_item_id, :source_catalog_item_id, :item_name, :quantity,
                         :cost_body, :cost_hardware, :cost_glass, :cost_factory_hours, :cost_site_hours, :cost_labor_rate,
                         :snapshot_loaded_at, :price_body, :price_hardware, :price_glass, :line_total,
                         :tax_category, :memo, "beaver", 1, CURRENT_TIMESTAMP)
                ')->execute([
                    ':voucher_id'             => $newId,
                    ':line_no'                => $line['line_no'],
                    ':line_type'              => $line['line_type'],
                    ':location_no'            => $line['location_no'],
                    ':location_name'          => $line['location_name'],
                    ':tategu_item_id'         => $line['tategu_item_id'],
                    ':source_catalog_item_id' => $line['source_catalog_item_id'] ?? null,
                    ':item_name'              => $line['item_name'],
                    ':quantity'               => $line['quantity'],
                    ':cost_body'              => $line['cost_body'],
                    ':cost_hardware'          => $line['cost_hardware'],
                    ':cost_glass'             => $line['cost_glass'],
                    ':cost_factory_hours'     => $line['cost_factory_hours'],
                    ':cost_site_hours'        => $line['cost_site_hours'],
                    ':cost_labor_rate'        => $line['cost_labor_rate'],
                    ':snapshot_loaded_at'     => $line['snapshot_loaded_at'],
                    ':price_body'             => $line['price_body'],
                    ':price_hardware'         => $line['price_hardware'],
                    ':price_glass'            => $line['price_glass'],
                    ':line_total'             => $line['line_total'],
                    ':tax_category'           => $line['tax_category'],
                    ':memo'                   => $line['memo'],
                ]);
                $newLineId = (int)$pdo->lastInsertId();

                // costs/prices もコピー
                $cStmt = $pdo->prepare('SELECT * FROM voucher_line_costs WHERE voucher_line_id = ? ORDER BY sort_order');
                $cStmt->execute([$line['id']]);
                $srcCosts = $cStmt->fetchAll();
                if (!empty($srcCosts)) {
                    saveLineCosts($pdo, $newLineId, $srcCosts);
                }
                $pStmt = $pdo->prepare('SELECT * FROM voucher_line_prices WHERE voucher_line_id = ? ORDER BY sort_order');
                $pStmt->execute([$line['id']]);
                $srcPrices = $pStmt->fetchAll();
                if (!empty($srcPrices)) {
                    saveLinePrices($pdo, $newLineId, $srcPrices);
                }
            }
            $pdo->commit();
            http_response_code(201);
            $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $s->execute([$newId]);
            echo json_encode($s->fetch());
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) { $pdo->rollBack(); }
                error_log('[convert-to-sales] ' . $e->getMessage());
                http_response_code(500);
                echo json_encode(['error' => '変換処理に失敗しました']);
            }
            break;
        }

        // ---- スナップショット一括再読み込み ----
        if ($resourceId && $subAction === 'reload-snapshots') {
            $lines = $pdo->prepare('SELECT id FROM voucher_lines WHERE voucher_id = ? AND tategu_item_id IS NOT NULL');
            $lines->execute([$resourceId]);
            foreach ($lines->fetchAll() as $line) {
                loadSnapshot($pdo, (int)$line['id']);
            }
            recalcVoucher($pdo, $resourceId);
            echo json_encode(['reloaded' => true]);
            break;
        }

        // ---- 明細追加 ----
        if ($resourceId && $subAction === 'lines') {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(line_no), 0) + 1 FROM voucher_lines WHERE voucher_id = ?');
            $maxStmt->execute([$resourceId]);
            $lineNo = (int)$maxStmt->fetchColumn();
            $stmt = $pdo->prepare('
                INSERT INTO voucher_lines
                    (voucher_id, line_no, line_type, location_no, location_name,
                     tategu_item_id, source_catalog_item_id, item_name, quantity,
                     cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate,
                     price_body, price_hardware, price_glass, line_total, tax_category, memo, updated_at)
                VALUES
                    (:voucher_id, :line_no, :line_type, :location_no, :location_name,
                     :tategu_item_id, :source_catalog_item_id, :item_name, :quantity,
                     :cost_body, :cost_hardware, :cost_glass, :cost_factory_hours, :cost_site_hours, :cost_labor_rate,
                     :price_body, :price_hardware, :price_glass, :line_total, :tax_category, :memo, CURRENT_TIMESTAMP)
            ');
            $stmt->execute([
                ':voucher_id'             => $resourceId,
                ':line_no'                => $lineNo,
                ':line_type'              => $data['line_type'] ?? 'normal',
                ':location_no'            => $data['location_no'] ?? null,
                ':location_name'          => $data['location_name'] ?? null,
                ':tategu_item_id'         => $data['tategu_item_id'] ?? null,
                ':source_catalog_item_id' => $data['source_catalog_item_id'] ?? null,
                ':item_name'              => $data['item_name'] ?? null,
                ':quantity'               => $data['quantity'] ?? 1,
                ':cost_body'              => $data['cost_body'] ?? 0,
                ':cost_hardware'          => $data['cost_hardware'] ?? 0,
                ':cost_glass'             => $data['cost_glass'] ?? 0,
                ':cost_factory_hours'     => $data['cost_factory_hours'] ?? 0,
                ':cost_site_hours'        => $data['cost_site_hours'] ?? 0,
                ':cost_labor_rate'        => $data['cost_labor_rate'] ?? 0,
                ':price_body'             => $data['price_body'] ?? 0,
                ':price_hardware'         => $data['price_hardware'] ?? 0,
                ':price_glass'            => $data['price_glass'] ?? 0,
                ':line_total'             => $data['line_total'] ?? 0,
                ':tax_category'           => $data['tax_category'] ?? 'taxable',
                ':memo'                   => $data['memo'] ?? null,
            ]);
            $lineId = (int)$pdo->lastInsertId();

            if (!empty($data['tategu_item_id'])) {
                loadSnapshot($pdo, $lineId);
            }
            if (!empty($data['costs']) && is_array($data['costs'])) {
                saveLineCosts($pdo, $lineId, $data['costs']);
            }
            if (!empty($data['prices']) && is_array($data['prices'])) {
                saveLinePrices($pdo, $lineId, $data['prices']);
            }

            recalcVoucher($pdo, $resourceId);
            http_response_code(201);
            $s = $pdo->prepare('SELECT * FROM voucher_lines WHERE id = ?');
            $s->execute([$lineId]);
            $newLine = $s->fetch();
            attachLineSubtables($pdo, $newLine);
            echo json_encode($newLine);
            break;
        }

        // ---- 新規伝票作成 ----
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $type = $data['voucher_type'] ?? 'estimate';
        $no = nextVoucherNo($pdo, $type);
        $stmt = $pdo->prepare('
            INSERT INTO vouchers
                (voucher_no, voucher_type, status, project_id, customer_id,
                 voucher_date, delivery_date, tax_input_type, consumption_tax_type,
                 cutoff_date, billing_date, override_billing_date,
                 trade_type, profit_rate, memo, description,
                 print_date_flag, print_tax_excl_flag, print_company_seal,
                 validity_period, sales_category_id)
            VALUES
                (:voucher_no, :voucher_type, "draft", :project_id, :customer_id,
                 :voucher_date, :delivery_date, :tax_input_type, :consumption_tax_type,
                 :cutoff_date, :billing_date, :override_billing_date,
                 :trade_type, :profit_rate, :memo, :description,
                 :print_date_flag, :print_tax_excl_flag, :print_company_seal,
                 :validity_period, :sales_category_id)
        ');
        $stmt->execute([
            ':voucher_no'           => $no,
            ':voucher_type'         => $type,
            ':project_id'           => $data['project_id'] ?? null,
            ':customer_id'          => $data['customer_id'] ?? null,
            ':voucher_date'         => $data['voucher_date'] ?? date('Y-m-d'),
            ':delivery_date'        => $data['delivery_date'] ?? null,
            ':tax_input_type'       => $data['tax_input_type'] ?? 'exclusive',
            ':consumption_tax_type' => $data['consumption_tax_type'] ?? '外税/伝票計',
            ':cutoff_date'          => $data['cutoff_date'] ?? null,
            ':billing_date'         => $data['billing_date'] ?? null,
            ':override_billing_date'=> $data['override_billing_date'] ?? null,
            ':trade_type'           => $data['trade_type'] ?? '掛売上',
            ':profit_rate'          => $data['profit_rate'] ?? 0.30,
            ':memo'                 => $data['memo'] ?? null,
            ':description'          => $data['description'] ?? null,
            ':print_date_flag'      => $data['print_date_flag'] ?? 1,
            ':print_tax_excl_flag'  => $data['print_tax_excl_flag'] ?? 0,
            ':print_company_seal'   => $data['print_company_seal'] ?? 0,
            ':validity_period'      => $data['validity_period'] ?? null,
            ':sales_category_id'    => $data['sales_category_id'] ?? null,
        ]);
        $id = (int)$pdo->lastInsertId();
        http_response_code(201);
        $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
        $s->execute([$id]);
        echo json_encode($s->fetch());
        break;

    case 'PUT':
        // ---- 明細更新 ----
        if ($resourceId && $subAction === 'lines' && $subId) {
            $data = json_decode(file_get_contents('php://input'), true) ?? [];
            $fields = ['line_type','location_no','location_name','tategu_item_id','source_catalog_item_id',
                       'item_name','quantity',
                       'cost_body','cost_hardware','cost_glass','cost_factory_hours','cost_site_hours','cost_labor_rate',
                       'price_body','price_hardware','price_glass','line_total','tax_category','memo'];
            $sets = []; $params = [];
            foreach ($fields as $f) {
                if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
            }
            if (!empty($sets)) {
                // R-066(c) Phase2: Beaver 側でユーザーが明細を編集したことを示すフラグを立てる。
                // Access 側は edited_in_beaver=1 の行を上書きせず保護するため、
                // ここで自動セットしないと保護機構が機能しない（冪等: 既に1でも1のまま）。
                $sets[] = 'edited_in_beaver = 1';
                // R-060 Phase2b/2c Stage2: 行単位競合検知のため編集時刻を記録する。
                $sets[] = 'updated_at = CURRENT_TIMESTAMP';
                $params[':id'] = $subId;
                $pdo->prepare('UPDATE voucher_lines SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
                if (array_key_exists('tategu_item_id', $data)) {
                    loadSnapshot($pdo, $subId);
                }
                recalcVoucher($pdo, $resourceId);
            }
            if (array_key_exists('costs', $data) && is_array($data['costs'])) {
                saveLineCosts($pdo, $subId, $data['costs']);
            }
            if (array_key_exists('prices', $data) && is_array($data['prices'])) {
                saveLinePrices($pdo, $subId, $data['prices']);
            }

            $s = $pdo->prepare('SELECT * FROM voucher_lines WHERE id = ?');
            $s->execute([$subId]);
            $updatedLine = $s->fetch();
            attachLineSubtables($pdo, $updatedLine);
            echo json_encode($updatedLine);
            break;
        }
        // ---- 伝票ヘッダー更新 ----
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = ['status','project_id','customer_id','voucher_date','delivery_date',
                   'tax_input_type','consumption_tax_type','cutoff_date','billing_date','override_billing_date',
                   'trade_type','profit_rate','memo','description',
                   'print_date_flag','print_tax_excl_flag','print_company_seal',
                   'validity_period','sales_category_id'];
        $sets = []; $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $params[':id'] = $resourceId;
        $pdo->prepare('UPDATE vouchers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        recalcVoucher($pdo, $resourceId);
        $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
        $s->execute([$resourceId]);
        echo json_encode($s->fetch());
        break;

    case 'DELETE':
        if ($resourceId && $subAction === 'lines' && $subId) {
            $pdo->prepare('DELETE FROM voucher_lines WHERE id = ?')->execute([$subId]);
            recalcVoucher($pdo, $resourceId);
            echo json_encode(['deleted' => true]);
            break;
        }
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $pdo->prepare('UPDATE vouchers SET status = "void", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        echo json_encode(['voided' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
