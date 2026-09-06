<?php
/**
 * /customers エンドポイント
 * GET    /customers         一覧
 * GET    /customers/{id}    詳細
 * POST   /customers         新規作成
 * PUT    /customers/{id}    更新
 * DELETE /customers/{id}    削除（論理削除）
 */

require_once __DIR__ . '/list_helpers.php';
require_once __DIR__ . '/../search_helpers.php';
require_once __DIR__ . '/history_helpers.php';

// IDとサブリソースを取り出す
$segments = explode('/', trim($path, '/'));
$resourceId = isset($segments[1]) && is_numeric($segments[1]) ? (int)$segments[1] : null;
$subResource = isset($segments[2]) ? $segments[2] : null;

/**
 * R-075: 得意先コードの自動採番。
 * Beaver新規得意先は90001〜の予約域で連番採番する（晴樹さん承認・Access側裏取り済み）。
 * Access側も得意先№を独立採番している（現在812まで、オートナンバーでない通常Long列）ため、
 * access_customer_noは採番に一切影響させない。将来のR-038同期時も90001域はAccess側と衝突しない。
 */
function nextCustomerCode(PDO $pdo): string {
    $row = $pdo->query("
        SELECT MAX(CAST(code AS INTEGER)) AS max_no FROM customers
            WHERE CAST(code AS INTEGER) >= 90001
    ")->fetch();
    $maxNo = ($row && $row['max_no'] !== null) ? (int)$row['max_no'] : 90000;
    return (string)($maxNo + 1);
}

/**
 * R-075: PDOExceptionのUNIQUE制約違反メッセージから対象カラム名を判別する。
 * 決め打ちせず実際に違反したカラムを返す（判別不能ならnull）。
 */
function classifyUniqueViolationColumn(string $message): ?string {
    if (str_contains($message, 'customers.code')) return 'code';
    if (str_contains($message, 'customers.access_customer_no')) return 'access_customer_no';
    return null;
}

// PATCH /customers/{id}/carry-forward — 繰越残高例外修正
if ($method === 'PATCH' && $resourceId && $subResource === 'carry-forward') {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    if (!isset($data['carry_forward_balance'])) {
        http_response_code(400);
        echo json_encode(['error' => 'carry_forward_balance is required']);
        exit;
    }
    $pdo->prepare('
        UPDATE customers
        SET carry_forward_balance = :bal, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ')->execute([':bal' => (float)$data['carry_forward_balance'], ':id' => $resourceId]);
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([$resourceId]);
    echo json_encode($stmt->fetch());
    exit;
}

// PATCH /customers/{id}/access-link — R-0140 (2): AccessTategu 得意先番号の紐付け・解除
if ($method === 'PATCH' && $resourceId && $subResource === 'access-link') {
    customerAccessLink($pdo, $resourceId);
    exit;
}

/**
 * PATCH /customers/{id}/access-link
 * routes/sync_helpers.php の syncVoucherAccessLink（PATCH /vouchers/{id}/access-link）と同型。
 * B-01: access_customer_no を指定 → 紐付け（同値の再送も200で冪等）
 * B-02: access_customer_no=null → 紐付け解除。code は nextCustomerCode() で90001〜の仮コードに戻す
 */
function customerAccessLink(PDO $pdo, int $customerId): void {
    $data = json_decode(file_get_contents('php://input'), true) ?? [];
    if (!array_key_exists('access_customer_no', $data)) {
        http_response_code(400);
        echo json_encode(['error' => 'access_customer_no is required']);
        return;
    }

    $checkStmt = $pdo->prepare('SELECT id FROM customers WHERE id = ?');
    $checkStmt->execute([$customerId]);
    if (!$checkStmt->fetch()) {
        http_response_code(404);
        echo json_encode(['error' => 'Not found']);
        return;
    }

    $accessCustomerNo = $data['access_customer_no'];

    try {
        if ($accessCustomerNo === null) {
            $code = nextCustomerCode($pdo);
            $pdo->prepare('
                UPDATE customers
                SET access_customer_no = NULL, code = :code, updated_at = CURRENT_TIMESTAMP, last_synced_at = CURRENT_TIMESTAMP
                WHERE id = :id
            ')->execute([':code' => $code, ':id' => $customerId]);
            $status = 'unlinked';
        } else {
            $accessCustomerNo = (string)$accessCustomerNo;
            $pdo->prepare('
                UPDATE customers
                SET access_customer_no = :n, code = :n, updated_at = CURRENT_TIMESTAMP, last_synced_at = CURRENT_TIMESTAMP
                WHERE id = :id
            ')->execute([':n' => $accessCustomerNo, ':id' => $customerId]);
            $status = 'linked';
        }
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) {
            $violated = classifyUniqueViolationColumn($e->getMessage()) ?? 'access_customer_no';
            http_response_code(409);
            echo json_encode(['error' => "$violated が既に存在します", 'column' => $violated]);
            return;
        }
        throw $e;
    }

    $stmt = $pdo->prepare('SELECT access_customer_no, code, last_synced_at FROM customers WHERE id = ?');
    $stmt->execute([$customerId]);
    $row = $stmt->fetch();
    http_response_code(200);
    echo json_encode([
        'customer_id'        => $customerId,
        'access_customer_no' => $row['access_customer_no'],
        'code'                => $row['code'],
        'last_synced_at'      => $row['last_synced_at'],
        'status'              => $status,
    ]);
}

// --- AccessTategu連携契約 A-B-01: Beaver→Access 得意先同期用 軽量増分API ---
// GET /customers/sync[?updated_after=YYYY-MM-DD HH:NN:SS (JST)][&limit=N][&cursor=ID]
// 完全一致チェック（/customers/sync/anything を全件返却で誤通過させない）
if ($method === 'GET' && isset($segments[1]) && $segments[1] === 'sync' && isset($segments[2])) {
    http_response_code(404);
    echo json_encode(['error' => 'Not found', 'path' => $path]);
    exit;
}
if ($method === 'GET' && isset($segments[1]) && $segments[1] === 'sync' && !isset($segments[2])) {
    require_once __DIR__ . '/sync_helpers.php';

    // updated_after は JST の 'Y-m-d H:i:s' として受け取る契約（vouchers/sync と同じ）。
    // DB列 updated_at は UTC 保存のため、比較前に UTC へ逆変換する。
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

    // carry_forward_balance は正本がAccess側のため絶対にSELECTしない
    $sql = 'SELECT id, access_customer_no, code, name, name_kana, honorific_type, gender,
                   postal_code, address1, address2, tel, mobile, fax, email, cutoff_day, memo,
                   is_active, updated_at, last_synced_at
            FROM customers WHERE 1=1';
    $params = [];
    if ($updatedAfterSql !== null) {
        $sql .= ' AND updated_at > :updated_after';
        $params[':updated_after'] = $updatedAfterSql;
    }
    if ($cursor !== null) {
        $sql .= ' AND id > :cursor';
        $params[':cursor'] = $cursor;
    }
    $sql .= ' ORDER BY id ASC LIMIT :limit_plus_one';
    $params[':limit_plus_one'] = $limit + 1; // next_cursor 検出のため +1 件取得

    $stmt = $pdo->prepare($sql);
    foreach ($params as $k => $val) {
        $type = ($k === ':limit_plus_one' || $k === ':cursor') ? PDO::PARAM_INT : PDO::PARAM_STR;
        $stmt->bindValue($k, $val, $type);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll();

    // limit+1件目 = 次ページ先頭になるはずのレコード（next_cursor_atの出所）。
    // next_cursor自体は現ページ最終行のid（id > cursorで次ページを取得する契約のため、
    // limit+1件目のidを渡すとその行がスキップされてしまう）。
    $nextCursor = null;
    $nextCursorAt = null;
    if (count($rows) > $limit) {
        $extraRow = $rows[$limit];
        $rows = array_slice($rows, 0, $limit);
        $lastRow = end($rows);
        $nextCursor = (int)$lastRow['id'];
        $nextCursorAt = utcToJst($extraRow['updated_at']);
        reset($rows);
    }

    foreach ($rows as &$row) {
        $row['updated_at']     = utcToJst($row['updated_at']);
        $row['last_synced_at'] = utcToJst($row['last_synced_at']);
    }
    unset($row);

    $now = new DateTime('now', new DateTimeZone('Asia/Tokyo'));
    $response = [
        'synced_at' => $now->format('c'),
        'customers' => $rows,
    ];
    if ($nextCursor !== null) {
        $response['next_cursor']    = $nextCursor;
        $response['next_cursor_at'] = $nextCursorAt;
    }
    echo json_encode($response);
    exit;
}

switch ($method) {
    case 'GET':
        if ($resourceId) {
            // 詳細
            $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
            $stmt->execute([$resourceId]);
            $row = $stmt->fetch();
            if (!$row) {
                http_response_code(404);
                echo json_encode(['error' => 'Not found']);
                exit;
            }
            echo json_encode($row);
        } else {
            // 一覧
            $where = 'WHERE 1=1';
            $params = [];
            if (!empty($_GET['q'])) {
                // R-0083: 得意先検索は名前・コードに加え、読み・電話番号・住所・備考も対象にする
                [$searchClause, $searchParams] = buildMultiColumnSearchClause(
                    ['name', 'code', 'name_kana', 'tel', 'mobile', 'address1', 'address2', 'memo'],
                    $_GET['q']
                );
                $where .= ' AND ' . $searchClause;
                $params = array_merge($params, $searchParams);
            }
            if (!isset($_GET['include_inactive'])) {
                $where .= ' AND is_active = 1';
            }
            if (isset($_GET['page'])) {
                $page    = max(1, (int)$_GET['page']);
                $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
                $offset  = ($page - 1) * $perPage;
                $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM customers $where");
                $cntStmt->execute($params);
                $total = (int)$cntStmt->fetchColumn();
                // R-076 Part A Phase 1: サーバソート（ホワイトリストは全てハードコード文字列）
                $sortClause = resolveSortClause(
                    ['code' => 'code', 'name' => 'name', 'tel' => 'tel', 'address1' => 'address1'],
                    'code',
                    'id'
                );
                $stmt  = $pdo->prepare("SELECT * FROM customers $where $sortClause LIMIT $perPage OFFSET $offset");
                $stmt->execute($params);
                echo json_encode([
                    'data' => $stmt->fetchAll(),
                    'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'last_page' => (int)ceil($total / $perPage)],
                ]);
            } else {
                $stmt = $pdo->prepare("SELECT * FROM customers $where ORDER BY code");
                $stmt->execute($params);
                echo json_encode($stmt->fetchAll());
            }
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $accessCustomerNo = isset($data['access_customer_no']) && $data['access_customer_no'] !== null
            ? (string)$data['access_customer_no']
            : null;

        // access_customer_no が指定されていれば既存レコードを検索して upsert
        if ($accessCustomerNo !== null) {
            $checkStmt = $pdo->prepare('SELECT id, code FROM customers WHERE access_customer_no = ?');
            $checkStmt->execute([$accessCustomerNo]);
            $existing = $checkStmt->fetch();

            // access_customer_no で見つからなければ code でフォールバック照合
            if (!$existing && isset($data['code']) && $data['code'] !== null && $data['code'] !== '') {
                $codeStmt = $pdo->prepare('SELECT id, code FROM customers WHERE code = ?');
                $codeStmt->execute([(string)$data['code']]);
                $existing = $codeStmt->fetch();
            }

            if ($existing) {
                $existingId = $existing['id'];
                // 既存レコードを UPDATE して 200 返却
                // R-075: codeはクライアント送信値を使わない。既存codeがNULL/空の場合のみ
                // access_customer_noで埋める（B-2で整合済みの既存値は上書きしない）。
                $fields = ['name','name_kana','honorific_type','gender',
                           'postal_code','address1','address2','tel','mobile','fax','email',
                           'memo','billing_name','billing_date_print',
                           'cutoff_day','billing_offset_days','payment_due_days','is_active'];
                $sets = [];
                $params = [];
                foreach ($fields as $f) {
                    if (array_key_exists($f, $data)) {
                        $sets[] = "$f = :$f";
                        $params[":$f"] = $data[$f];
                    }
                }
                if ($existing['code'] === null || $existing['code'] === '') {
                    $sets[] = 'code = :code';
                    $params[':code'] = $accessCustomerNo;
                }
                $sets[] = 'access_customer_no = :access_customer_no';
                $params[':access_customer_no'] = $accessCustomerNo;
                $sets[] = 'updated_at = CURRENT_TIMESTAMP';
                $params[':id'] = (int)$existingId;
                $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
                $stmt2 = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
                $stmt2->execute([(int)$existingId]);
                http_response_code(200);
                echo json_encode($stmt2->fetch());
                break;
            }
        }

        // R-075: UI経由の新規作成（access_customer_noなし）はクライアント指定のcodeを無視して自動採番する。
        // Access同期経路（access_customer_noあり）の新規作成はcode=access_customer_noに統一する
        // （晴樹さん方針: Beaverのcodeを常にAccessの得意先番号と一致させる。クライアント送信のcodeは無視）。
        $code = $accessCustomerNo === null
            ? nextCustomerCode($pdo)
            : $accessCustomerNo;

        // UNIQUE 制約違反（access_customer_no または code の重複）は PDOException で 409 返却
        try {
            $stmt = $pdo->prepare('
                INSERT INTO customers
                    (code, name, name_kana, honorific_type, gender,
                     postal_code, address1, address2, tel, mobile, fax, email,
                     memo, billing_name, billing_date_print,
                     cutoff_day, billing_offset_days, payment_due_days,
                     carry_forward_balance, is_active, access_customer_no)
                VALUES
                    (:code, :name, :name_kana, :honorific_type, :gender,
                     :postal_code, :address1, :address2, :tel, :mobile, :fax, :email,
                     :memo, :billing_name, :billing_date_print,
                     :cutoff_day, :billing_offset_days, :payment_due_days,
                     :carry_forward_balance, 1, :access_customer_no)
            ');
            $stmt->execute([
                ':code'                 => $code,
                ':name'                 => $data['name'] ?? '',
                ':name_kana'            => $data['name_kana'] ?? null,
                ':honorific_type'       => $data['honorific_type'] ?? '御中',
                ':gender'               => $data['gender'] ?? null,
                ':postal_code'          => $data['postal_code'] ?? null,
                ':address1'             => $data['address1'] ?? null,
                ':address2'             => $data['address2'] ?? null,
                ':tel'                  => $data['tel'] ?? null,
                ':mobile'               => $data['mobile'] ?? null,
                ':fax'                  => $data['fax'] ?? null,
                ':email'                => $data['email'] ?? null,
                ':memo'                 => $data['memo'] ?? null,
                ':billing_name'         => $data['billing_name'] ?? null,
                ':billing_date_print'   => $data['billing_date_print'] ?? 0,
                ':cutoff_day'           => $data['cutoff_day'] ?? 31,
                ':billing_offset_days'  => $data['billing_offset_days'] ?? 15,
                ':payment_due_days'     => $data['payment_due_days'] ?? 30,
                ':carry_forward_balance'=> $data['carry_forward_balance'] ?? 0,
                ':access_customer_no'   => $accessCustomerNo,
            ]);
        } catch (PDOException $e) {
            if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) {
                $violated = classifyUniqueViolationColumn($e->getMessage());
                if ($violated === 'code') {
                    http_response_code(409);
                    echo json_encode(['error' => 'code が既に存在します', 'code' => $code]);
                    break;
                }
                http_response_code(409);
                echo json_encode(['error' => 'access_customer_no が既に存在します', 'access_customer_no' => $accessCustomerNo]);
                break;
            }
            throw $e;
        }
        $id = $pdo->lastInsertId();
        http_response_code(201);
        $stmt2 = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
        $stmt2->execute([$id]);
        echo json_encode($stmt2->fetch());
        break;

    case 'PUT':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        // carry_forward_balance は PATCH /carry-forward 専用。通常更新では変更不可
        // R-075: codeはユーザーが変更できない（自動採番のみ）ため更新対象から除外
        // R-0140 (2) B-04: access_customer_no も PATCH /access-link 専用（誤操作防止）のため除外
        $fields = ['name','name_kana','honorific_type','gender',
                   'postal_code','address1','address2','tel','mobile','fax','email',
                   'memo','billing_name','billing_date_print',
                   'cutoff_day','billing_offset_days','payment_due_days','is_active'];
        $sets = [];
        $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) {
                $sets[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $params[':id'] = $resourceId;
        // R-0098: 更新前の状態をUndo用に記録する（差分がある場合のみ）
        $beforeStmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
        $beforeStmt->execute([$resourceId]);
        $beforeRow = $beforeStmt->fetch();
        $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
        $stmt->execute([$resourceId]);
        $afterRow = $stmt->fetch();
        if ($beforeRow) {
            recordCustomerUpdateIfChanged($pdo, $beforeRow, $afterRow);
        }
        echo json_encode($afterRow);
        break;

    case 'DELETE':
        if (!$resourceId) { http_response_code(400); echo json_encode(['error' => 'ID required']); exit; }
        $pdo->prepare('UPDATE customers SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$resourceId]);
        echo json_encode(['deleted' => true]);
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
