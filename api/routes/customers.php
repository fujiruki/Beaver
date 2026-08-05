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
        $fields = ['name','name_kana','honorific_type','gender',
                   'postal_code','address1','address2','tel','mobile','fax','email',
                   'memo','billing_name','billing_date_print',
                   'cutoff_day','billing_offset_days','payment_due_days','is_active',
                   'access_customer_no'];
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
        $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
        $stmt->execute([$resourceId]);
        echo json_encode($stmt->fetch());
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
