<?php
/**
 * Beaver R-038 customers API 単体テスト
 *
 * 起動: php api/tests/test_customers.php
 *
 * - customers.php の POST/PUT ロジックを PDO 直接呼び出しで検証
 * - 専用 SQLite DB を使って既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
require_once $ROOT . '/search_helpers.php';

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_customers_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
    $GLOBALS['pdo'] = null;
    if (file_exists($testDbPath)) {
        @unlink($testDbPath);
    }
});

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');

$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $m) {
    $sql = file_get_contents($m);
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}

// ============================================================
// テストハーネス
// ============================================================
$passed = 0;
$failed = 0;
$failures = [];

function runTest(string $name, callable $fn): void {
    global $passed, $failed, $failures;
    try {
        $fn();
        echo "  [OK] $name\n";
        $passed++;
    } catch (Throwable $e) {
        echo "  [NG] $name :: " . $e->getMessage() . "\n";
        $failed++;
        $failures[] = $name . ': ' . $e->getMessage();
    }
}

function assertEq($expected, $actual, string $label = ''): void {
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf(
            "%s expected=%s actual=%s",
            $label,
            var_export($expected, true),
            var_export($actual, true)
        ));
    }
}

function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

// ============================================================
// customers POST/PUT をシミュレートするヘルパ
// ============================================================

/**
 * R-075: routes/customers.php の nextCustomerCode() と同一ロジック（90001域予約方式）。
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
 * R-075: routes/customers.php の classifyUniqueViolationColumn() と同一ロジック。
 */
function classifyUniqueViolationColumn(string $message): ?string {
    if (str_contains($message, 'customers.code')) return 'code';
    if (str_contains($message, 'customers.access_customer_no')) return 'access_customer_no';
    return null;
}

/**
 * customers.php の POST ロジックをインライン実行。
 * 戻り値: ['code' => int, 'body' => array]
 */
function customerPost(PDO $pdo, array $data): array {
    $accessCustomerNo = isset($data['access_customer_no']) && $data['access_customer_no'] !== null
        ? (string)$data['access_customer_no']
        : null;

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
            return ['code' => 200, 'body' => $stmt2->fetch()];
        }
    }

    // R-075: UI経由の新規作成（access_customer_noなし）はクライアント指定のcodeを無視して自動採番する。
    // Access同期経路（access_customer_noあり）の新規作成はcode=access_customer_noに統一する
    // （晴樹さん方針: Beaverのcodeを常にAccessの得意先番号と一致させる。クライアント送信のcodeは無視）。
    $code = $accessCustomerNo === null
        ? nextCustomerCode($pdo)
        : $accessCustomerNo;

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
                return ['code' => 409, 'body' => ['error' => 'code が既に存在します', 'code' => $code]];
            }
            return ['code' => 409, 'body' => ['error' => 'access_customer_no が既に存在します', 'access_customer_no' => $accessCustomerNo]];
        }
        throw $e;
    }
    $id = $pdo->lastInsertId();
    $stmt2 = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt2->execute([$id]);
    return ['code' => 201, 'body' => $stmt2->fetch()];
}

/**
 * R-0083: customers.php GET一覧の検索ロジック（複数プロパティ対象）をインライン実行。
 */
function customerSearch(PDO $pdo, string $q): array {
    $where = 'WHERE 1=1 AND is_active = 1';
    $params = [];
    if ($q !== '') {
        [$clause, $qParams] = buildMultiColumnSearchClause(
            ['name', 'code', 'name_kana', 'tel', 'mobile', 'address1', 'address2', 'memo'],
            $q
        );
        $where .= ' AND ' . $clause;
        $params = array_merge($params, $qParams);
    }
    $stmt = $pdo->prepare("SELECT * FROM customers $where ORDER BY code");
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * customers.php の PUT ロジックをインライン実行。
 */
function customerPut(PDO $pdo, int $resourceId, array $data): array {
    // R-075: codeはユーザーが変更できない（自動採番のみ）ため更新対象から除外
    // R-0140 (2) B-04: access_customer_noもPATCH /access-link専用のため除外
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
    if (empty($sets)) {
        return ['code' => 400, 'body' => ['error' => 'No fields']];
    }
    $sets[] = 'updated_at = CURRENT_TIMESTAMP';
    $params[':id'] = $resourceId;
    try {
        $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    } catch (PDOException $e) {
        if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) {
            return ['code' => 409, 'body' => ['error' => 'access_customer_no が既に存在します']];
        }
        throw $e;
    }
    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([$resourceId]);
    return ['code' => 200, 'body' => $stmt->fetch()];
}

/**
 * R-0140 (2): routes/customers.php の customerAccessLink() と同一ロジック。
 * PATCH /customers/{id}/access-link をインライン実行。
 * 戻り値: ['code' => int, 'body' => array]
 */
function customerAccessLink(PDO $pdo, int $customerId, array $data): array {
    if (!array_key_exists('access_customer_no', $data)) {
        return ['code' => 400, 'body' => ['error' => 'access_customer_no is required']];
    }

    $checkStmt = $pdo->prepare('SELECT id FROM customers WHERE id = ?');
    $checkStmt->execute([$customerId]);
    if (!$checkStmt->fetch()) {
        return ['code' => 404, 'body' => ['error' => 'Not found']];
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
            return ['code' => 409, 'body' => ['error' => "$violated が既に存在します", 'column' => $violated]];
        }
        throw $e;
    }

    $stmt = $pdo->prepare('SELECT access_customer_no, code, last_synced_at FROM customers WHERE id = ?');
    $stmt->execute([$customerId]);
    $row = $stmt->fetch();
    return ['code' => 200, 'body' => [
        'customer_id'        => $customerId,
        'access_customer_no' => $row['access_customer_no'],
        'code'                => $row['code'],
        'last_synced_at'      => $row['last_synced_at'],
        'status'              => $status,
    ]];
}

// ============================================================
// テスト本体
// ============================================================
echo "=== R-038 customers API テスト ===\n\n";

// T-01: access_customer_no 指定で新規 INSERT → 201
runTest('T-01: access_customer_no 指定で新規 INSERT → 201', function () use ($pdo) {
    $res = customerPost($pdo, [
        'name'               => '藤田建具店',
        'access_customer_no' => '1001',
    ]);
    assertEq(201, $res['code'], 'HTTP status');
    assertEq('1001', $res['body']['access_customer_no'], 'access_customer_no 保存');
    assertTrue(is_int((int)$res['body']['id']) && $res['body']['id'] > 0, 'id が払い出されている');
});

// T-02: 同じ access_customer_no で POST → 200 UPDATE (upsert)
runTest('T-02: 同じ access_customer_no で POST → 200 UPDATE (upsert)', function () use ($pdo) {
    $res = customerPost($pdo, [
        'name'               => '藤田建具店 更新後',
        'access_customer_no' => '1001',
        'tel'                => '090-1234-5678',
    ]);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq('藤田建具店 更新後', $res['body']['name'], 'name が更新されている');
    assertEq('090-1234-5678', $res['body']['tel'], 'tel が更新されている');
    assertEq('1001', $res['body']['access_customer_no'], 'access_customer_no は変わらない');
});

// T-03: R-0140 (2) B-04で仕様変更。PUT /customers/{id} は access_customer_no を更新しない
// （紐付けは PATCH /customers/{id}/access-link 専用。誤操作防止のため PUT からは除外した）。
// 従来は PUT 経由の更新を許していたが、この受入条件変更に合わせて期待値を書き換える。
runTest('T-03: PUT /customers/{id} は access_customer_no を更新しない（R-0140 B-04で無視される）', function () use ($pdo) {
    $res1 = customerPost($pdo, ['name' => '仮登録得意先', 'access_customer_no' => null]);
    assertEq(201, $res1['code'], '事前INSERT');
    $id = (int)$res1['body']['id'];
    assertEq(null, $res1['body']['access_customer_no'], '初期は NULL');

    $res2 = customerPut($pdo, $id, ['name' => '仮登録得意先（更新後）', 'access_customer_no' => '2002']);
    assertEq(200, $res2['code'], 'PUT status');
    assertEq(null, $res2['body']['access_customer_no'], 'PUTでは access_customer_no は変更されない');
    assertEq('仮登録得意先（更新後）', $res2['body']['name'], 'nameは通常通り更新される');

    // 紐付けは access-link 専用エンドポイントで行う
    $res3 = customerAccessLink($pdo, $id, ['access_customer_no' => '2002']);
    assertEq(200, $res3['code'], 'access-link status');
    assertEq('2002', $res3['body']['access_customer_no'], 'access-linkでは access_customer_no が更新される');
});

// T-04: UNIQUE 制約 - 別レコードに同じ access_customer_no → 409
// R-0140 (2) B-04で仕様変更。PUTはaccess_customer_noを扱わなくなったため、
// 競合の発生経路を PATCH /customers/{id}/access-link に差し替える。
runTest('T-04: UNIQUE 制約 - 別レコードに同じ access_customer_no を access-link で設定 → 409', function () use ($pdo) {
    $res = customerPost($pdo, [
        'name'               => 'UNIQUE違反テスト',
        'access_customer_no' => '1001',
    ]);
    // '1001' は T-01 で既に登録済みだが T-02 の upsert で 200 を返している
    // 別レコード（新規）として重複させるには別の access_customer_no 経由で
    // 既存と異なる access_customer_no を持つレコードに access-link で競合させる
    assertEq(200, $res['code'], 'upsert なので 200（既存 UPDATE）');

    // 別レコードに '1001' を access-link で強制設定 → UNIQUE 制約違反で 409
    $res2 = customerPost($pdo, ['name' => '競合テスト用', 'access_customer_no' => '9999']);
    assertEq(201, $res2['code'], '別レコード作成');
    $otherId = (int)$res2['body']['id'];

    $res3 = customerAccessLink($pdo, $otherId, ['access_customer_no' => '1001']);
    assertEq(409, $res3['code'], '別レコードへの重複 access_customer_no 設定は 409');
});

// T-05: code 一致 + access_customer_no NULL の既存レコードに POST → 200 UPDATE で access_customer_no がセットされる
runTest('T-05: code 照合 upsert - access_customer_no NULL レコードに POST → 200 + access_customer_no セット', function () use ($pdo) {
    // code=110 で access_customer_no NULL のレコードを事前作成（シード状態の再現）
    $pdo->prepare('INSERT INTO customers (code, name, is_active) VALUES (?, ?, 1)')
        ->execute(['110', '徳山住宅']);

    $res = customerPost($pdo, [
        'code'               => '110',
        'name'               => '徳山住宅（Access連携後）',
        'access_customer_no' => 'ACN-110',
    ]);
    assertEq(200, $res['code'], 'HTTP status は 200 UPDATE');
    assertEq('ACN-110', $res['body']['access_customer_no'], 'access_customer_no がセットされた');
    assertEq('徳山住宅（Access連携後）', $res['body']['name'], 'name が更新された');
});

// T-06: access_customer_no 一致の既存レコードに POST → access_customer_no が維持される（回帰防止）
runTest('T-06: access_customer_no 照合 upsert の回帰防止 - access_customer_no が維持される', function () use ($pdo) {
    $res1 = customerPost($pdo, [
        'name'               => '回帰テスト得意先',
        'code'               => '999',
        'access_customer_no' => 'ACN-999',
    ]);
    assertEq(201, $res1['code'], '事前 INSERT');
    assertEq('ACN-999', $res1['body']['access_customer_no'], '初期 access_customer_no');

    $res2 = customerPost($pdo, [
        'name'               => '回帰テスト得意先（更新）',
        'code'               => '999',
        'access_customer_no' => 'ACN-999',
        'tel'                => '06-1111-2222',
    ]);
    assertEq(200, $res2['code'], '2回目 POST は 200 UPDATE');
    assertEq('ACN-999', $res2['body']['access_customer_no'], 'access_customer_no が維持されている');
    assertEq('06-1111-2222', $res2['body']['tel'], 'tel が更新されている');
});

// T-07: UI経由の新規登録2件連続でコードが90001域の連番で自動付与される
runTest('T-07: UI経由の新規登録2件連続で90001域の連番が自動付与される', function () use ($pdo) {
    $res1 = customerPost($pdo, ['name' => '新規得意先A']);
    assertEq(201, $res1['code'], '1件目 HTTP status');
    $code1 = (int)$res1['body']['code'];
    assertTrue($code1 >= 90001, '1件目 code は予約域90001以上: ' . $code1);

    $res2 = customerPost($pdo, ['name' => '新規得意先B']);
    assertEq(201, $res2['code'], '2件目 HTTP status');
    $code2 = (int)$res2['body']['code'];
    assertEq($code1 + 1, $code2, '2件目 code は1件目+1の連番');
});

// T-07b: 既に90001域の最大値(90005)が存在する状態では次は90006
runTest('T-07b: 既にcode=90005が存在する状態では次は90006になる', function () use ($pdo) {
    $pdo->prepare('INSERT INTO customers (code, name, is_active) VALUES (?, ?, 1)')
        ->execute(['90005', '90001域テスト用得意先']);

    $res = customerPost($pdo, ['name' => '新規得意先C']);
    assertEq(201, $res['code'], 'HTTP status');
    assertEq(90006, (int)$res['body']['code'], '既存最大値90005の次として90006が採番される');
});

// T-08: クライアント指定codeが無視される
runTest('T-08: UI経由の新規登録でクライアント指定codeは無視される', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => 'コード指定テスト', 'code' => 'HACKED-CODE']);
    assertEq(201, $res['code'], 'HTTP status');
    assertTrue($res['body']['code'] !== 'HACKED-CODE', 'クライアント指定codeがそのまま使われていない');
    assertTrue((int)$res['body']['code'] >= 90001, '自動採番された90001域のcodeになっている: ' . $res['body']['code']);
});

// T-09: access_customer_noの値は採番に一切影響しない（Access番号域と完全に独立）
runTest('T-09: access_customer_noがあっても採番は90001域のまま影響されない', function () use ($pdo) {
    // Access同期経路でaccess_customer_no=812（Access側の現在値に近い小さい数値）の得意先を作る
    $accessRes = customerPost($pdo, ['name' => 'Access得意先', 'access_customer_no' => '812']);
    assertEq(201, $accessRes['code'], 'Access経路の事前登録');
    assertTrue(((int)$accessRes['body']['code']) < 90001, 'Access経路のcodeは90001域に影響されない（今回はnull想定）');

    // UI経由で新規登録しても、90001域の連番のまま（812の影響を受けない）
    $uiRes = customerPost($pdo, ['name' => 'UI経由得意先']);
    assertEq(201, $uiRes['code'], 'UI経由登録 HTTP status');
    assertTrue((int)$uiRes['body']['code'] >= 90001, 'access_customer_noに関わらず90001域で採番される: ' . $uiRes['body']['code']);
});

// T-10: code重複時のUNIQUE制約メッセージがcodeを正しく指す
// 注記: POST /customers はaccess_customer_no指定時にcodeでのフォールバック照合を先に行うため
// （同じcodeの既存レコードが見つかるとUPDATEにフォールバックする）、customerPost経由では
// code側のUNIQUE制約違反に実際には到達できない（フォールバック照合が先にヒットしてしまう）。
// そのため、INSERT文を直接使ってUNIQUE制約違反を発生させ、classifyUniqueViolationColumn() が
// 「access_customer_noへの決め打ち」をせず正しくcodeを判別することを検証する。
runTest('T-10: code重複のUNIQUE制約メッセージはaccess_customer_noに決め打ちせずcodeと判別される', function () use ($pdo) {
    $pdo->prepare('INSERT INTO customers (code, name, is_active) VALUES (?, ?, 1)')
        ->execute(['66666', 'コード重複テスト1']);

    try {
        $pdo->prepare('INSERT INTO customers (code, name, is_active) VALUES (?, ?, 1)')
            ->execute(['66666', 'コード重複テスト2']);
        throw new RuntimeException('UNIQUE制約違反が発生しなかった');
    } catch (PDOException $e) {
        assertTrue(str_contains($e->getMessage(), 'UNIQUE constraint failed'), 'UNIQUE制約違反であること: ' . $e->getMessage());
        assertEq('code', classifyUniqueViolationColumn($e->getMessage()), 'access_customer_noへの決め打ちでなくcodeと判別される');
    }
});

// T-11: access_customer_no指定の新規syncでcode=access_customer_noが自動セットされる
runTest('T-11: access_customer_no指定の新規syncでcode=access_customer_noが自動セットされる', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '同期整合テスト得意先', 'access_customer_no' => '500']);
    assertEq(201, $res['code'], 'HTTP status');
    assertEq('500', $res['body']['code'], 'codeがaccess_customer_noと一致してセットされる');
});

// T-12: codeが空でaccess_customer_noが既に紐付いている得意先にsyncが来るとcodeが埋まる
// （R-075発見事項: 修正前はAccess同期経路のINSERTでcodeがnullのまま作成されていたため、
// 既存本番データにはこのような「access_customer_noはあるがcode空」のレコードが存在しうる）
runTest('T-12: codeが空でaccess_customer_noが既に紐付いている得意先にsyncが来るとcodeが埋まる', function () use ($pdo) {
    $pdo->prepare('INSERT INTO customers (name, access_customer_no, is_active) VALUES (?, ?, 1)')
        ->execute(['未整合得意先', '502']);
    $id = (int)$pdo->lastInsertId();
    $before = $pdo->query("SELECT code FROM customers WHERE id = $id")->fetch();
    assertEq(null, $before['code'], '前提: codeは未設定');

    $res = customerPost($pdo, ['name' => '未整合得意先（再sync）', 'access_customer_no' => '502']);
    assertEq(200, $res['code'], 'HTTP status（既存レコードのUPDATE）');
    assertEq('502', $res['body']['code'], 'codeがaccess_customer_noで埋まる');
});

// T-13: codeが既に設定済みの得意先はsyncが来てもcodeを上書きされない（B-2整合済みデータの保護）
runTest('T-13: codeが既に設定済みの得意先はsyncが来てもcodeを上書きされない', function () use ($pdo) {
    $res1 = customerPost($pdo, ['name' => '整合済み得意先', 'access_customer_no' => '503']);
    assertEq(201, $res1['code'], '事前作成');
    assertEq('503', $res1['body']['code'], '前提: codeは503');

    $res2 = customerPost($pdo, ['name' => '整合済み得意先（再sync）', 'access_customer_no' => '503', 'code' => '999999']);
    assertEq(200, $res2['code'], 'HTTP status');
    assertEq('503', $res2['body']['code'], 'codeは上書きされず維持される（クライアント指定999999は無視）');
});

// T-14: R-0083 得意先一覧検索が name_kana でもヒットする
runTest('T-14: R-0083 検索が name_kana でもヒットする', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '検索対象商店', 'name_kana' => 'ケンサクタイショウショウテン']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, 'ケンサクタイショウショウテン');
    assertTrue(count($hits) >= 1, 'name_kanaでヒットする');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        '登録した得意先がname_kana検索結果に含まれる'
    );
});

// T-15: R-0083 得意先一覧検索が tel でもヒットする
runTest('T-15: R-0083 検索が tel でもヒットする', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '電話検索商店', 'tel' => '03-9999-8888']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, '9999-8888');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        '登録した得意先がtel検索結果に含まれる'
    );
});

// T-16: R-0083 得意先一覧検索が address1 でもヒットする
runTest('T-16: R-0083 検索が address1 でもヒットする', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '住所検索商店', 'address1' => '大阪府大阪市住之江区']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, '住之江区');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        '登録した得意先がaddress1検索結果に含まれる'
    );
});

// T-17: R-0083 得意先一覧検索が memo でもヒットする
runTest('T-17: R-0083 検索が memo でもヒットする', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '備考検索商店', 'memo' => '特記事項：休業日は水曜日']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, '水曜日');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        '登録した得意先がmemo検索結果に含まれる'
    );
});

// T-18: R-0083 検索が既存どおり name でもヒットする（回帰防止）
runTest('T-18: R-0083 検索がnameで引き続きヒットする（回帰防止）', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '名前検索回帰商店']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, '名前検索回帰商店');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        '登録した得意先がname検索結果に含まれる'
    );
});

// T-19: R-0090 ひらがな入力でカタカナ表記のname_kanaにマッチする
runTest('T-19: R-0090 ひらがな入力でカタカナのname_kanaにヒットする', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => 'かな正規化商店', 'name_kana' => 'カナセイキカショウテン']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, 'かなせいきか');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        'ひらがな入力でカタカナのname_kanaにヒットする'
    );
});

// T-20: R-0090 カタカナ入力でひらがな表記のnameにマッチする（逆方向）
runTest('T-20: R-0090 カタカナ入力でひらがなのnameにヒットする（逆方向）', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => 'ぎゃくむき商店']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, 'ギャクムキ');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        'カタカナ入力でひらがなのnameにヒットする'
    );
});

// T-21: R-0090 空白区切りの複数キーワードがAND条件でヒットする
runTest('T-21: R-0090 空白区切りの複数キーワードがAND条件でヒットする', function () use ($pdo) {
    $res = customerPost($pdo, [
        'name'     => 'AND検索対象商店',
        'address1' => '大阪府堺市',
        'tel'      => '072-1234-5678',
    ]);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, 'AND検索対象 堺市');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        '複数キーワードが全て含まれる行がヒットする'
    );

    $noHits = customerSearch($pdo, 'AND検索対象 存在しないキーワードxyz');
    assertTrue(
        !in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $noHits), true),
        '一部のキーワードしか含まれない場合はヒットしない（AND条件）'
    );
});

// T-22: R-0090 全角スペース区切りでもAND条件が機能する
runTest('T-22: R-0090 全角スペース区切りでもAND条件が機能する', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '全角スペース商店', 'memo' => '全角空白テスト用']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, '全角スペース　空白テスト');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        '全角スペース区切りでもAND条件でヒットする'
    );
});

// T-23: R-0135 ひらがな入力で半角カタカナ表記のname_kanaにマッチする
runTest('T-23: R-0135 ひらがな入力で半角カタカナのname_kanaにヒットする', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => '門田組', 'name_kana' => 'ｶﾄﾞﾀｸﾞﾐ']);
    assertEq(201, $res['code'], '事前登録');

    $hits = customerSearch($pdo, 'かどた');
    assertTrue(
        in_array((int)$res['body']['id'], array_map(fn($r) => (int)$r['id'], $hits), true),
        'ひらがな入力で半角カタカナのname_kanaにヒットする'
    );
});

// ============================================================
// R-0140 (2) PATCH /customers/{id}/access-link テスト（受入条件 2-1〜2-6）
// ============================================================
echo "\n=== R-0140 (2) PATCH /customers/{id}/access-link テスト ===\n\n";

$r0140FixtureDir = dirname($ROOT) . '/docs/spec/fixtures/accesstategu_r086';

// 2-1: 検体customer_755.jsonからaccess_customer_noを抜いて作成 → access-linkで紐付け
runTest('2-1: 検体customer_755.jsonからaccess_customer_noを抜いて作成→access-link{"755"}で200・linked', function () use ($pdo, $r0140FixtureDir) {
    $fixture = json_decode(file_get_contents($r0140FixtureDir . '/customer_755.json'), true);
    unset($fixture['access_customer_no']);
    $created = customerPost($pdo, $fixture);
    assertEq(201, $created['code'], '事前作成 HTTP status');
    $id = (int)$created['body']['id'];
    assertEq(null, $created['body']['access_customer_no'], '作成直後は access_customer_no 未設定');

    $res = customerAccessLink($pdo, $id, ['access_customer_no' => '755']);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq('755', $res['body']['access_customer_no'], 'access_customer_no が755になる');
    assertEq('755', $res['body']['code'], 'codeも755になる');
    assertTrue($res['body']['last_synced_at'] !== null, 'last_synced_atが非NULL');
    assertEq('linked', $res['body']['status'], 'status=linked');
});

// 2-2: 同じ内容をもう一度送っても冪等に200
runTest('2-2: 2-1をもう一度送っても200（冪等、409にならない）', function () use ($pdo) {
    $row = $pdo->query("SELECT id FROM customers WHERE access_customer_no = '755'")->fetch();
    $res = customerAccessLink($pdo, (int)$row['id'], ['access_customer_no' => '755']);
    assertEq(200, $res['code'], '再送でも200');
    assertEq('linked', $res['body']['status'], 'status=linked');
});

// 2-3: 別の得意先に同じ"755"を送ると409
runTest('2-3: 別の得意先に同じ"755"を送ると409、違反列名を含む', function () use ($pdo) {
    $other = customerPost($pdo, ['name' => '別得意先']);
    assertEq(201, $other['code'], '別得意先の事前作成');
    $res = customerAccessLink($pdo, (int)$other['body']['id'], ['access_customer_no' => '755']);
    assertEq(409, $res['code'], 'HTTP status');
    assertTrue(
        str_contains($res['body']['column'] ?? '', 'access_customer_no') || str_contains($res['body']['column'] ?? '', 'code'),
        '違反列名(access_customer_noまたはcode)を含む: ' . ($res['body']['column'] ?? '')
    );
});

// 2-4: 存在しないidは404
runTest('2-4: 存在しないidは404', function () use ($pdo) {
    $res = customerAccessLink($pdo, 999999, ['access_customer_no' => '9999']);
    assertEq(404, $res['code'], 'HTTP status');
});

// 2-5: 紐付け解除
runTest('2-5: 2-1の得意先に{"access_customer_no":null}で解除→90001以上の仮コード・unlinked', function () use ($pdo) {
    $row = $pdo->query("SELECT id FROM customers WHERE access_customer_no = '755'")->fetch();
    $res = customerAccessLink($pdo, (int)$row['id'], ['access_customer_no' => null]);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq(null, $res['body']['access_customer_no'], 'access_customer_noがNULLになる');
    assertTrue((int)$res['body']['code'] >= 90001, '仮コードが90001域: ' . $res['body']['code']);
    assertEq('unlinked', $res['body']['status'], 'status=unlinked');
});

// 2-6: PUT /customers/{id} で access_customer_no を変えようとしても無視される（決定事項、仕様書にも追記済み）
runTest('2-6: PUT /customers/{id}でaccess_customer_noを変えようとしても無視される（値が変わらず200）', function () use ($pdo) {
    $created = customerPost($pdo, ['name' => 'PUT無視テスト得意先', 'access_customer_no' => '600']);
    assertEq(201, $created['code'], '事前作成');
    $id = (int)$created['body']['id'];

    $res = customerPut($pdo, $id, ['name' => 'PUT無視テスト得意先（更新後）', 'access_customer_no' => '999999']);
    assertEq(200, $res['code'], 'PUT status');
    assertEq('600', $res['body']['access_customer_no'], 'access_customer_noは変更されず維持される');
    assertEq('PUT無視テスト得意先（更新後）', $res['body']['name'], 'nameは通常通り更新される');
});

// ============================================================
// 結果サマリ
// ============================================================
echo "\n";
echo "結果: {$passed} PASS / {$failed} FAIL\n";
if (!empty($failures)) {
    echo "\n失敗したテスト:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
    exit(1);
}
exit(0);
