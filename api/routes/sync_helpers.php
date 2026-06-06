<?php
/**
 * R-025 Step E-Beaver: AccessTategu からの伝票 push 受信 共通ヘルパ
 *
 * - access_voucher_id を冪等性キーとした upsert
 * - 厳格 validation（customer_access_no / project_id 検証）
 * - INSERT 時は status = 'approved' 固定（Access 側で発行済み＝確定）
 * - 重複時は最新で上書きし、200 OK を黙って返す（Access に「重複」とは返さない）
 */

if (!function_exists('readJsonBody')) {
    function readJsonBody(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}

if (!function_exists('respond')) {
    function respond(int $code, array $body): void {
        http_response_code($code);
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
    }
}

/**
 * customer_access_no から customer_id を解決。存在しなければ null。
 */
function resolveCustomerId(PDO $pdo, ?string $accessCustomerNo): ?int {
    if ($accessCustomerNo === null || $accessCustomerNo === '') return null;
    $stmt = $pdo->prepare('SELECT id FROM customers WHERE access_customer_no = ?');
    $stmt->execute([$accessCustomerNo]);
    $id = $stmt->fetchColumn();
    return $id ? (int)$id : null;
}

/**
 * project_id が存在するか確認。
 */
function projectExists(PDO $pdo, int $projectId): bool {
    $stmt = $pdo->prepare('SELECT 1 FROM projects WHERE id = ?');
    $stmt->execute([$projectId]);
    return (bool)$stmt->fetchColumn();
}

/**
 * AccessTategu の伝票番号と Beaver の voucher_no を分離して保存するため、
 * INSERT 時は Beaver 内部 voucher_no を sequences から採番し、access_voucher_no は別列に格納。
 */
function nextVoucherNoForSync(PDO $pdo, string $type): string {
    $key = ($type === 'estimate') ? 'estimate' : 'sales';
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = ?');
    $stmt->execute([$key]);
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = ?')->execute([$no, $key]);
    $prefix = ($type === 'estimate') ? 'E' : 'S';
    return $prefix . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

/**
 * POST /projects/{id}/vouchers/sync 及び POST /vouchers/sync（project_id=null の過去伝票）
 * 厳格 validation 後、access_voucher_id で upsert。
 */
function syncVoucherUpsert(PDO $pdo, ?int $projectId): void {
    $data = readJsonBody();

    $accessVoucherId = isset($data['access_voucher_id']) ? (int)$data['access_voucher_id'] : 0;
    if ($accessVoucherId <= 0) {
        respond(400, ['error' => 'access_voucher_id は必須です']);
        return;
    }

    $voucherType = $data['voucher_type'] ?? '';
    if (!in_array($voucherType, ['estimate', 'sales'], true)) {
        respond(400, ['error' => 'voucher_type は estimate または sales のみ許可されます']);
        return;
    }

    if ($projectId !== null && !projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません', 'project_id' => $projectId]);
        return;
    }

    $accessCustomerNo = isset($data['customer_access_no']) ? (string)$data['customer_access_no'] : '';
    $customerId = resolveCustomerId($pdo, $accessCustomerNo);
    if ($accessCustomerNo !== '' && $customerId === null) {
        respond(400, [
            'error' => 'customer_access_no が customers.access_customer_no に存在しません',
            'customer_access_no' => $accessCustomerNo,
        ]);
        return;
    }

    $voucherDate    = $data['voucher_date']      ?? date('Y-m-d');
    $accessVoucherNo = isset($data['access_voucher_no']) ? (string)$data['access_voucher_no'] : null;
    $totalAmount    = isset($data['total_amount']) ? (float)$data['total_amount'] : 0;
    $memo           = $data['memo']              ?? null;
    $description    = $data['description']       ?? null;

    $pdo->beginTransaction();
    try {
        $existsStmt = $pdo->prepare('SELECT id, voucher_no FROM vouchers WHERE access_voucher_id = ?');
        $existsStmt->execute([$accessVoucherId]);
        $existing = $existsStmt->fetch();

        if ($existing) {
            $voucherId = (int)$existing['id'];
            $voucherNo = (string)$existing['voucher_no'];
            $pdo->prepare('
                UPDATE vouchers SET
                    voucher_type      = :voucher_type,
                    status            = "approved",
                    project_id        = :project_id,
                    customer_id       = :customer_id,
                    voucher_date      = :voucher_date,
                    total_amount      = :total_amount,
                    access_voucher_no = :access_voucher_no,
                    memo              = :memo,
                    description       = :description,
                    updated_at        = CURRENT_TIMESTAMP
                WHERE id = :id
            ')->execute([
                ':voucher_type'      => $voucherType,
                ':project_id'        => $projectId,
                ':customer_id'       => $customerId,
                ':voucher_date'      => $voucherDate,
                ':total_amount'      => $totalAmount,
                ':access_voucher_no' => $accessVoucherNo,
                ':memo'              => $memo,
                ':description'       => $description,
                ':id'                => $voucherId,
            ]);
        } else {
            $voucherNo = nextVoucherNoForSync($pdo, $voucherType);
            $pdo->prepare('
                INSERT INTO vouchers
                    (voucher_no, voucher_type, status, project_id, customer_id,
                     voucher_date, total_amount, access_voucher_id, access_voucher_no,
                     memo, description)
                VALUES
                    (:voucher_no, :voucher_type, "approved", :project_id, :customer_id,
                     :voucher_date, :total_amount, :access_voucher_id, :access_voucher_no,
                     :memo, :description)
            ')->execute([
                ':voucher_no'        => $voucherNo,
                ':voucher_type'      => $voucherType,
                ':project_id'        => $projectId,
                ':customer_id'       => $customerId,
                ':voucher_date'      => $voucherDate,
                ':total_amount'      => $totalAmount,
                ':access_voucher_id' => $accessVoucherId,
                ':access_voucher_no' => $accessVoucherNo,
                ':memo'              => $memo,
                ':description'       => $description,
            ]);
            $voucherId = (int)$pdo->lastInsertId();
        }

        // 明細行は AccessTategu 側スキーマと Beaver の voucher_lines の差異が大きいため、
        // 今回の Step E スコープでは lines は INSERT 時のみ取り込み、UPDATE 時は触らない。
        if (!$existing && !empty($data['lines']) && is_array($data['lines'])) {
            insertSyncedLines($pdo, $voucherId, $data['lines']);
        }

        $pdo->commit();
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(500, ['error' => $e->getMessage()]);
        return;
    }

    respond(200, [
        'voucher_id' => $voucherId,
        'voucher_no' => $voucherNo,
        'status'     => 'synced',
    ]);
}

/**
 * lines を最小フィールドで INSERT する。
 * AccessTategu からの行は item_name / quantity / line_total を最低限持つ想定。
 */
function insertSyncedLines(PDO $pdo, int $voucherId, array $lines): void {
    $lineNo = 1;
    $ins = $pdo->prepare('
        INSERT INTO voucher_lines
            (voucher_id, line_no, line_type, item_name, quantity, line_total, tax_category, memo)
        VALUES
            (:voucher_id, :line_no, :line_type, :item_name, :quantity, :line_total, :tax_category, :memo)
    ');
    foreach ($lines as $line) {
        $ins->execute([
            ':voucher_id'   => $voucherId,
            ':line_no'      => $lineNo,
            ':line_type'    => $line['line_type']    ?? 'normal',
            ':item_name'    => $line['item_name']    ?? null,
            ':quantity'     => $line['quantity']     ?? 1,
            ':line_total'   => $line['line_total']   ?? 0,
            ':tax_category' => $line['tax_category'] ?? '課税',
            ':memo'         => $line['memo']         ?? null,
        ]);
        $lineNo++;
    }
}

/**
 * PUT /projects/{id}/vouchers/{voucher_no}
 * voucher_no は AccessTategu 側の access_voucher_no で検索する仕様（設計書 §8.5）。
 */
function syncVoucherUpdate(PDO $pdo, int $projectId, string $accessVoucherNo): void {
    $data = readJsonBody();

    if (!projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません']);
        return;
    }

    $stmt = $pdo->prepare('SELECT id, voucher_no FROM vouchers WHERE access_voucher_no = ?');
    $stmt->execute([$accessVoucherNo]);
    $target = $stmt->fetch();
    if (!$target) {
        respond(404, ['error' => '指定された access_voucher_no の伝票が見つかりません']);
        return;
    }

    $voucherType = $data['voucher_type'] ?? null;
    if ($voucherType !== null && !in_array($voucherType, ['estimate', 'sales'], true)) {
        respond(400, ['error' => 'voucher_type は estimate または sales のみ許可されます']);
        return;
    }

    $accessCustomerNo = isset($data['customer_access_no']) ? (string)$data['customer_access_no'] : null;
    $customerId = null;
    if ($accessCustomerNo !== null) {
        $customerId = resolveCustomerId($pdo, $accessCustomerNo);
        if ($customerId === null) {
            respond(400, [
                'error' => 'customer_access_no が customers.access_customer_no に存在しません',
            ]);
            return;
        }
    }

    $sets = [];
    $params = [':id' => (int)$target['id']];
    if ($voucherType !== null)      { $sets[] = 'voucher_type = :voucher_type'; $params[':voucher_type'] = $voucherType; }
    if ($customerId !== null)       { $sets[] = 'customer_id = :customer_id';   $params[':customer_id']  = $customerId; }
    if (isset($data['voucher_date'])) { $sets[] = 'voucher_date = :voucher_date'; $params[':voucher_date'] = $data['voucher_date']; }
    if (isset($data['total_amount'])) { $sets[] = 'total_amount = :total_amount'; $params[':total_amount'] = (float)$data['total_amount']; }
    if (isset($data['memo']))         { $sets[] = 'memo = :memo';               $params[':memo']         = $data['memo']; }
    if (isset($data['description']))  { $sets[] = 'description = :description'; $params[':description']  = $data['description']; }
    $sets[] = 'project_id = :project_id';
    $params[':project_id'] = $projectId;
    $sets[] = 'updated_at = CURRENT_TIMESTAMP';

    $pdo->prepare('UPDATE vouchers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);

    $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $s->execute([(int)$target['id']]);
    respond(200, $s->fetch() ?: []);
}

/**
 * PATCH /projects/{id}/vouchers/{voucher_no}/shipped
 * 発送済フラグ更新。Body: {shipped: bool, shipped_at: ISO8601}
 */
function syncVoucherShipped(PDO $pdo, int $projectId, string $accessVoucherNo): void {
    $data = readJsonBody();

    if (!projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません']);
        return;
    }

    $stmt = $pdo->prepare('SELECT id FROM vouchers WHERE access_voucher_no = ?');
    $stmt->execute([$accessVoucherNo]);
    $id = $stmt->fetchColumn();
    if (!$id) {
        respond(404, ['error' => '指定された access_voucher_no の伝票が見つかりません']);
        return;
    }

    if (!array_key_exists('shipped', $data)) {
        respond(400, ['error' => 'shipped フィールドは必須です']);
        return;
    }

    $shipped   = $data['shipped'] ? 1 : 0;
    $shippedAt = $data['shipped_at'] ?? null;

    $pdo->prepare('
        UPDATE vouchers SET shipped = :shipped, shipped_at = :shipped_at, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ')->execute([
        ':shipped'    => $shipped,
        ':shipped_at' => $shippedAt,
        ':id'         => (int)$id,
    ]);

    respond(200, ['voucher_id' => (int)$id, 'shipped' => (bool)$shipped, 'shipped_at' => $shippedAt]);
}

/**
 * PATCH /projects/{id}/customer
 * 案件マスタの得意先変更を受信。Body: {customer_access_no: "456"}
 */
function syncProjectCustomer(PDO $pdo, int $projectId): void {
    $data = readJsonBody();

    if (!projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません']);
        return;
    }

    $accessCustomerNo = isset($data['customer_access_no']) ? (string)$data['customer_access_no'] : '';
    if ($accessCustomerNo === '') {
        respond(400, ['error' => 'customer_access_no は必須です']);
        return;
    }

    $customerId = resolveCustomerId($pdo, $accessCustomerNo);
    if ($customerId === null) {
        respond(400, [
            'error' => 'customer_access_no が customers.access_customer_no に存在しません',
            'customer_access_no' => $accessCustomerNo,
        ]);
        return;
    }

    $pdo->prepare('UPDATE projects SET customer_id = :customer_id, updated_at = CURRENT_TIMESTAMP WHERE id = :id')
        ->execute([':customer_id' => $customerId, ':id' => $projectId]);

    respond(200, [
        'project_id'  => $projectId,
        'customer_id' => $customerId,
        'status'      => 'updated',
    ]);
}
