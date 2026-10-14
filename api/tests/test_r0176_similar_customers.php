<?php
/**
 * R-0176 似た得意先候補API。
 *
 * 起動: php api/tests/test_r0176_similar_customers.php
 */

declare(strict_types=1);

$root = dirname(__DIR__);
require_once $root . '/search_helpers.php';
$dbPath = __DIR__ . '/test_r0176_similar_customers_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_server_bootstrap_r0176.php';
@unlink($dbPath);

$pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec(file_get_contents($root . '/schema.sql'));
$migrations = glob($root . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $migration) {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($migration));
    foreach (explode(';', $sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '') continue;
        try { $pdo->exec($statement); } catch (PDOException $e) {
            if (!str_contains($e->getMessage(), 'duplicate column name')) throw $e;
        }
    }
}

function addCustomer(PDO $pdo, array $values): int {
    $defaults = [
        'code' => 'R0176-' . bin2hex(random_bytes(3)), 'name' => '', 'name_kana' => null,
        'tel' => null, 'mobile' => null, 'fax' => null, 'address1' => null,
        'is_active' => 1, 'access_customer_no' => null,
    ];
    $row = array_merge($defaults, $values);
    $pdo->prepare('INSERT INTO customers
        (code, name, name_kana, tel, mobile, fax, address1, is_active, access_customer_no)
        VALUES (:code, :name, :name_kana, :tel, :mobile, :fax, :address1, :is_active, :access_customer_no)')
        ->execute($row);
    return (int)$pdo->lastInsertId();
}

function getJson(int $port, array $query): array {
    $url = "http://127.0.0.1:$port/contents/Beaver/api/customers/similar?" . http_build_query($query);
    $raw = file_get_contents($url);
    $body = json_decode((string)$raw, true);
    if (!is_array($body)) throw new RuntimeException('JSON配列ではありません');
    return $body;
}

function assertSameValue(mixed $expected, mixed $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$label expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}

function assertTrue(bool $condition, string $label): void {
    if (!$condition) throw new RuntimeException($label);
}

$passed = 0;
$failed = 0;
function runTest(string $name, callable $test): void {
    global $passed, $failed;
    try { $test(); echo "[OK] $name\n"; $passed++; }
    catch (Throwable $e) { echo "[NG] $name: {$e->getMessage()}\n"; $failed++; }
}

$companyId = addCustomer($pdo, [
    'code' => '001', 'name' => '株式会社 山田工務店', 'name_kana' => 'ヤマダコウムテン',
    'tel' => '06-1234-5678', 'mobile' => '090-1111-2222', 'fax' => '06-9876-5432',
    'address1' => '大阪府大阪市', 'access_customer_no' => '501',
]);
$inactiveId = addCustomer($pdo, ['code' => '002', 'name' => '無効商店', 'tel' => '03-1111-2222', 'is_active' => 0]);

file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($dbPath, true) . ");\n");
$port = 18176;
$process = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $root, $root . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $pipes,
    $root
);
if (!is_resource($process)) throw new RuntimeException('phpビルトインサーバーを起動できませんでした');
register_shutdown_function(function () use ($process, $bootstrap, $dbPath): void {
    proc_terminate($process);
    proc_close($process);
    @unlink($bootstrap);
    @unlink($dbPath);
});
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health") !== false) break;
}

runTest('1. 法人格・空白を除いた名前で一致する', function () use ($port, $companyId): void {
    foreach (['山田工務店', '(株)山田工務店', '山田　工務店'] as $name) {
        $rows = getJson($port, ['name' => $name]);
        assertSameValue($companyId, (int)($rows[0]['id'] ?? 0), "$name の候補");
        assertTrue(in_array('name', $rows[0]['matched'] ?? [], true), 'matchedにname');
    }
});

runTest('2. カナはひらがな・半角カナを正規化して一致する', function () use ($port, $companyId): void {
    foreach (['やまだこうむてん', 'ﾔﾏﾀﾞｺｳﾑﾃﾝ'] as $kana) {
        $rows = getJson($port, ['name_kana' => $kana]);
        assertSameValue($companyId, (int)($rows[0]['id'] ?? 0), "$kana の候補");
        assertTrue(in_array('name_kana', $rows[0]['matched'] ?? [], true), 'matchedにname_kana');
    }
});

runTest('2b. カナの法人格略記を除いて一致する', function () use ($port, $companyId): void {
    foreach (['ｶ)ﾔﾏﾀﾞｺｳﾑﾃﾝ', '（カヤマダコウムテン', 'ﾕ)ﾔﾏﾀﾞｺｳﾑﾃﾝ', '(ユヤマダコウムテン'] as $kana) {
        assertSameValue('やまだこうむてん', normalizeSimilarCustomerText($kana), "$kana の正規化");
        $rows = getJson($port, ['name_kana' => $kana]);
        assertSameValue($companyId, (int)($rows[0]['id'] ?? 0), "$kana の候補");
    }
});

runTest('3. 電話・携帯・FAXに数字だけで一致し、5桁以下は照合しない', function () use ($port, $companyId): void {
    foreach (['0612345678', '+81-6-1234-5678', '09011112222', '+81-90-1111-2222', '0698765432'] as $tel) {
        $rows = getJson($port, ['tel' => $tel]);
        assertSameValue($companyId, (int)($rows[0]['id'] ?? 0), "$tel の候補");
        assertTrue(in_array('tel', $rows[0]['matched'] ?? [], true), 'matchedにtel');
    }
    assertSameValue([], getJson($port, ['tel' => '12345']), '5桁は空配列');
});

runTest('3b. +81表記は国内電話番号へ正規化する', function (): void {
    assertSameValue('0612345678', normalizeSimilarCustomerTel('+81-6-1234-5678'), '固定電話');
    assertSameValue('09011112222', normalizeSimilarCustomerTel('＋８１（９０）１１１１－２２２２'), '携帯電話');
});

runTest('4. 無効な得意先も候補になる', function () use ($port, $inactiveId): void {
    $rows = getJson($port, ['tel' => '0311112222']);
    assertSameValue($inactiveId, (int)($rows[0]['id'] ?? 0), '無効得意先のid');
    assertSameValue(0, (int)($rows[0]['is_active'] ?? 1), 'is_active=0');
});

runTest('5. 末尾の敬称を繰り返し除いて一致する', function () use ($pdo, $port): void {
    $id = addCustomer($pdo, ['code' => '003', 'name' => '青空工房', 'name_kana' => 'アオゾラコウボウ様']);
    foreach (['青空工房様', '青空工房御中', '青空工房殿', '青空工房邸', '青空工房宅', '青空工房様御中殿邸宅'] as $name) {
        assertSameValue('青空工房', normalizeSimilarCustomerText($name), "$name の正規化");
        $rows = getJson($port, ['name' => $name]);
        assertSameValue($id, (int)($rows[0]['id'] ?? 0), "$name の候補");
    }
    $rows = getJson($port, ['name_kana' => 'アオゾラコウボウ']);
    assertSameValue($id, (int)($rows[0]['id'] ?? 0), 'カナ末尾の敬称も除く');
});

runTest('5b. 追加の法人格と全角括弧の略記を除いて一致する', function () use ($pdo, $port): void {
    $forms = ['一般社団法人', '医療法人', '社会福祉法人', '学校法人', '宗教法人', '（株）', '（有）', '（合）'];
    foreach ($forms as $index => $form) {
        $baseName = '法人照合' . chr(65 + $index);
        $id = addCustomer($pdo, ['code' => 'H' . $index, 'name' => $form . ' ' . $baseName]);
        assertSameValue($baseName, normalizeSimilarCustomerText($form . ' ' . $baseName), "$form の正規化");
        $rows = getJson($port, ['name' => $baseName]);
        assertSameValue($id, (int)($rows[0]['id'] ?? 0), "$form の候補");
    }
});

runTest('5c. 1文字の名前と全空入力は空配列', function () use ($port): void {
    assertSameValue([], getJson($port, ['name' => '山']), '1文字');
    assertSameValue([], getJson($port, ['name' => '', 'name_kana' => '', 'tel' => '']), '全空');
});

runTest('6. 最大10件で電話一致が名前一致より先', function () use ($pdo, $port): void {
    for ($i = 0; $i < 11; $i++) {
        addCustomer($pdo, ['code' => sprintf('A%02d', $i), 'name' => '並び順テスト' . $i]);
    }
    $telId = addCustomer($pdo, ['code' => 'Z99', 'name' => '別名', 'tel' => '0120-123-456']);
    $rows = getJson($port, ['name' => '並び順テスト', 'tel' => '0120123456']);
    assertSameValue(10, count($rows), '最大件数');
    assertSameValue($telId, (int)$rows[0]['id'], '電話一致が先頭');
});

echo "PASS: $passed, FAIL: $failed\n";
exit($failed === 0 ? 0 : 1);
