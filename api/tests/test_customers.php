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

        // access_customer_no で見つからなければ code でフォールバック照合
        if (!$existingId && isset($data['code']) && $data['code'] !== null && $data['code'] !== '') {
            $codeStmt = $pdo->prepare('SELECT id FROM customers WHERE code = ?');
            $codeStmt->execute([(string)$data['code']]);
            $existingId = $codeStmt->fetchColumn();
        }

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

// T-07: UI経由の新規登録2件連続でコードが連番自動付与される
runTest('T-07: UI経由の新規登録2件連続でコードが連番自動付与される', function () use ($pdo) {
    $res1 = customerPost($pdo, ['name' => '新規得意先A']);
    assertEq(201, $res1['code'], '1件目 HTTP status');
    $code1 = (int)$res1['body']['code'];
    assertTrue($code1 > 0, '1件目 code は正の数値');

    $res2 = customerPost($pdo, ['name' => '新規得意先B']);
    assertEq(201, $res2['code'], '2件目 HTTP status');
    $code2 = (int)$res2['body']['code'];
    assertEq($code1 + 1, $code2, '2件目 code は1件目+1の連番');
});

// T-08: クライアント指定codeが無視される
runTest('T-08: UI経由の新規登録でクライアント指定codeは無視される', function () use ($pdo) {
    $res = customerPost($pdo, ['name' => 'コード指定テスト', 'code' => 'HACKED-CODE']);
    assertEq(201, $res['code'], 'HTTP status');
    assertTrue($res['body']['code'] !== 'HACKED-CODE', 'クライアント指定codeがそのまま使われていない');
    assertTrue(is_numeric($res['body']['code']), '自動採番された数値codeになっている');
});

// T-09: access_customer_no=数値最大の得意先が存在する状態でも採番衝突しない
runTest('T-09: access_customer_noの数値最大値を考慮して採番される（Access番号域と衝突しない）', function () use ($pdo) {
    // Access同期経路で access_customer_no=90000（他のcode/access_customer_noより大きい数値）の得意先を作る
    $accessRes = customerPost($pdo, ['name' => 'Access得意先', 'access_customer_no' => '90000']);
    assertEq(201, $accessRes['code'], 'Access経路の事前登録');

    // UI経由で新規登録すると、90000を超える番号が採番されるはず
    $uiRes = customerPost($pdo, ['name' => 'UI経由得意先']);
    assertEq(201, $uiRes['code'], 'UI経由登録 HTTP status');
    assertTrue((int)$uiRes['body']['code'] > 90000, 'access_customer_noの最大値を超えた番号が採番されている: ' . $uiRes['body']['code']);
});

// T-10: code重複時の409メッセージが正しい列名になっている
runTest('T-10: code重複時は「code」を指す409メッセージになる（access_customer_noの決め打ちをしない）', function () use ($pdo) {
    // Access同期経路（access_customer_noあり）は従来どおりクライアント指定codeをそのまま使うため、
    // 意図的に同じcodeを持つ2件を作ってUNIQUE制約をcode側で違反させる。
    $res1 = customerPost($pdo, ['name' => 'コード重複テスト1', 'access_customer_no' => '77001', 'code' => '55555']);
    assertEq(201, $res1['code'], '1件目登録');

    $res2 = customerPost($pdo, ['name' => 'コード重複テスト2', 'access_customer_no' => '77002', 'code' => '55555']);
    assertEq(409, $res2['code'], '2件目は409');
    assertEq('code が既に存在します', $res2['body']['error'], 'codeを指す409メッセージになっている（access_customer_noの決め打ちでない）');
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
