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

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_customers.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}

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
 * customers.php の POST ロジックをインライン実行。
 * 戻り値: ['code' => int, 'body' => array]
 */
function customerPost(PDO $pdo, array $data): array {
    $accessCustomerNo = isset($data['access_customer_no']) && $data['access_customer_no'] !== null
        ? (string)$data['access_customer_no']
        : null;

    if ($accessCustomerNo !== null) {
        $checkStmt = $pdo->prepare('SELECT id FROM customers WHERE access_customer_no = ?');
        $checkStmt->execute([$accessCustomerNo]);
        $existingId = $checkStmt->fetchColumn();
        if ($existingId) {
            $fields = ['code','name','name_kana','honorific_type','gender',
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
            $sets[] = 'updated_at = CURRENT_TIMESTAMP';
            $params[':id'] = (int)$existingId;
            if (count($sets) > 1) {
                $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
            }
            $stmt2 = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
            $stmt2->execute([(int)$existingId]);
            return ['code' => 200, 'body' => $stmt2->fetch()];
        }
    }

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
            ':code'                 => $data['code'] ?? null,
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
 * customers.php の PUT ロジックをインライン実行。
 */
function customerPut(PDO $pdo, int $resourceId, array $data): array {
    $fields = ['code','name','name_kana','honorific_type','gender',
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

// T-03: PUT /customers/{id} で access_customer_no を更新
runTest('T-03: PUT /customers/{id} で access_customer_no を更新', function () use ($pdo) {
    $res1 = customerPost($pdo, ['name' => '仮登録得意先', 'access_customer_no' => null]);
    assertEq(201, $res1['code'], '事前INSERT');
    $id = (int)$res1['body']['id'];
    assertEq(null, $res1['body']['access_customer_no'], '初期は NULL');

    $res2 = customerPut($pdo, $id, ['access_customer_no' => '2002']);
    assertEq(200, $res2['code'], 'PUT status');
    assertEq('2002', $res2['body']['access_customer_no'], 'access_customer_no が更新された');
});

// T-04: UNIQUE 制約 - 別レコードに同じ access_customer_no → 409
runTest('T-04: UNIQUE 制約 - 別レコードに同じ access_customer_no → 409', function () use ($pdo) {
    $res = customerPost($pdo, [
        'name'               => 'UNIQUE違反テスト',
        'access_customer_no' => '1001',
    ]);
    // '1001' は T-01 で既に登録済みだが T-02 の upsert で 200 を返している
    // 別レコード（新規）として重複させるには別の access_customer_no 経由で
    // 既存と異なる access_customer_no を持つレコードに PUT で競合させる
    assertEq(200, $res['code'], 'upsert なので 200（既存 UPDATE）');

    // 別レコードに '1001' を PUT で強制設定 → UNIQUE 制約違反で 409
    $res2 = customerPost($pdo, ['name' => '競合テスト用', 'access_customer_no' => '9999']);
    assertEq(201, $res2['code'], '別レコード作成');
    $otherId = (int)$res2['body']['id'];

    $res3 = customerPut($pdo, $otherId, ['access_customer_no' => '1001']);
    assertEq(409, $res3['code'], '別レコードへの重複 access_customer_no 設定は 409');
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
