<?php
declare(strict_types=1);

$ROOT = dirname(__DIR__);
$testDbPath = __DIR__ . '/test_search_multi_property_phase2_' . getmypid() . '.sqlite';
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
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');
$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $migration) {
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($migration));
    foreach (explode(';', $sql) as $statement) {
        $statement = trim($statement);
        if ($statement === '') continue;
        try { $pdo->exec($statement); } catch (Throwable $_) { }
    }
}

$pdo->exec("INSERT INTO customers (id, name, honorific_type) VALUES
    (101, 'さくら建設', '御中'), (102, '北斗工務店', '御中')");
$pdo->exec("INSERT INTO projects (id, project_code, customer_id, name, status) VALUES
    (201, 'P201', 101, 'カタカナ改修', '進行中'), (202, 'P202', 102, '別案件', '進行中')");
$pdo->exec("INSERT INTO tategu_items (id, code, name, description, status) VALUES
    (301, 'TG-RED', 'ボウカドア', 'さくら 特別仕様', 'active'),
    (302, 'TG-BLUE', '引戸', '標準仕様', 'active')");
$pdo->exec("INSERT INTO vouchers (id, voucher_no, voucher_type, status, customer_id, project_id, voucher_date, description, memo) VALUES
    (401, 'E-R0084', 'estimate', 'draft', 101, 201, '2026-08-01', '防火 摘要', '現場メモ'),
    (402, 'E-OTHER', 'estimate', 'draft', 102, 202, '2026-08-02', '通常', '別メモ')");
$pdo->exec("INSERT INTO invoices (id, invoice_no, customer_id, invoice_date, cutoff_date, billing_date) VALUES
    (501, 'I-R0084', 101, '2026-08-01', '2026-08-31', '2026-09-05'),
    (502, 'I-OTHER', 102, '2026-08-01', '2026-08-31', '2026-09-05')");

$passed = 0;
$failed = 0;
function runTest(string $name, callable $test): void {
    global $passed, $failed;
    try { $test(); echo "  [OK] $name\n"; $passed++; }
    catch (Throwable $e) { echo "  [NG] $name :: {$e->getMessage()}\n"; $failed++; }
}
function assertSameValue($expected, $actual, string $label): void {
    if ($expected !== $actual) {
        throw new RuntimeException("$label expected=" . var_export($expected, true) . ' actual=' . var_export($actual, true));
    }
}
function callListRoute(string $route, array $query): array {
    global $ROOT, $testDbPath;
    $code = '$pdo=new PDO(' . var_export('sqlite:' . $testDbPath, true) . ');'
        . '$pdo->setAttribute(PDO::ATTR_ERRMODE,PDO::ERRMODE_EXCEPTION);'
        . '$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE,PDO::FETCH_ASSOC);'
        . '$path=' . var_export('/' . $route, true) . ';$method="GET";'
        . '$_GET=' . var_export($query, true) . ';'
        . 'require ' . var_export($ROOT . '/routes/' . $route . '.php', true) . ';';
    $proc = proc_open(['php', '-r', $code], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($proc)) throw new RuntimeException('route subprocess failed to start');
    $stdout = stream_get_contents($pipes[1]); fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]); fclose($pipes[2]);
    $exit = proc_close($proc);
    if ($exit !== 0) throw new RuntimeException("route failed: $stderr");
    $decoded = json_decode($stdout, true);
    if (!is_array($decoded)) throw new RuntimeException("invalid JSON: $stdout $stderr");
    return $decoded;
}
function ids(array $response): array {
    $rows = array_key_exists('data', $response) ? $response['data'] : $response;
    return array_map('intval', array_column($rows, 'id'));
}

runTest('建具: description・複数語AND・かな揺れ・非ヒット', function () {
    assertSameValue([301], ids(callListRoute('tategu_items', ['q' => 'さくら 特別'])), 'description AND');
    assertSameValue([301], ids(callListRoute('tategu_items', ['q' => 'ぼうか'])), 'kana');
    assertSameValue([], ids(callListRoute('tategu_items', ['q' => '存在しない'])), 'miss');
});
runTest('伝票: 全対象列・複数語AND・かな揺れ・非ヒット', function () {
    assertSameValue([401], ids(callListRoute('vouchers', ['q' => 'さくら 防火'])), 'customer + description AND');
    assertSameValue([401], ids(callListRoute('vouchers', ['q' => 'かたかな'])), 'project kana');
    assertSameValue([], ids(callListRoute('vouchers', ['q' => '存在しない'])), 'miss');
});
runTest('伝票: qとpage併用時にCOUNT JOINを含めて成功', function () {
    $response = callListRoute('vouchers', ['q' => 'さくら', 'page' => '1']);
    assertSameValue([401], ids($response), 'paged rows');
    assertSameValue(1, $response['meta']['total'] ?? null, 'paged total');
});
runTest('請求書: 番号・得意先・複数語AND・かな揺れ・非ヒット', function () {
    assertSameValue([501], ids(callListRoute('invoices', ['q' => 'I-R0084 さくら'])), 'invoice + customer AND');
    assertSameValue([501], ids(callListRoute('invoices', ['q' => 'サクラ'])), 'kana');
    assertSameValue([], ids(callListRoute('invoices', ['q' => '存在しない'])), 'miss');
});

echo "passed=$passed failed=$failed\n";
exit($failed === 0 ? 0 : 1);
