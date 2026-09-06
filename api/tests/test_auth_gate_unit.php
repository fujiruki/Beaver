<?php
/**
 * R-0109 authGateIsExempt() 単体テスト
 *
 * 起動: php api/tests/test_auth_gate_unit.php
 */

declare(strict_types=1);

define('BANTO_API_TOKEN', 'unit-test-banto-token');
define('SYNC_API_TOKEN', 'unit-test-sync-token');
require_once dirname(__DIR__) . '/auth_gate.php';

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

function assertTrue($cond, string $label = ''): void {
    if (!$cond) {
        throw new RuntimeException($label !== '' ? $label : 'assertion failed');
    }
}

echo "=== R-0109 authGateIsExempt() テスト ===\n\n";

$exemptCases = [
    ['GET', '/health'],
    ['POST', '/feedback'],
    ['GET', '/admin/feedback'],
    ['GET', '/projects/sync'],
    ['GET', '/vouchers/sync'],
    ['POST', '/vouchers/sync'],
    ['GET', '/customers/sync'],
    ['POST', '/invoices/sync'],
    ['POST', '/payments/sync'],
    ['POST', '/sync/heartbeat'],
    ['PATCH', '/vouchers/5/access-link'],
    ['PATCH', '/vouchers/5/sync-state'],
];
foreach ($exemptCases as [$method, $path]) {
    runTest("対象外: $method $path", function () use ($method, $path) {
        assertTrue(authGateIsExempt($path, $method), "$method $path は対象外であるべき");
    });
}

$guardedCases = [
    ['GET', '/customers'],
    ['GET', '/vouchers/5'],
    ['POST', '/vouchers'],
    ['GET', '/me'],
    ['GET', '/'],
    // R-0143 A-B-08: 完全一致の免除一覧に変更したため、部分一致でのみ免除されていたパスはゲート対象に戻る
    ['POST', '/projects/1/vouchers/sync'],
    ['POST', '/aggregation-categories/sync'],
    ['GET', '/vouchers/synchronize'],
    ['GET', '/sync/status'],
];
foreach ($guardedCases as [$method, $path]) {
    runTest("ゲート対象: $method $path", function () use ($method, $path) {
        assertTrue(!authGateIsExempt($path, $method), "$method $path はゲート対象であるべき");
    });
}

runTest('GET /feedback は対象外ではない（POSTのみ免除）', function () {
    assertTrue(!authGateIsExempt('/feedback', 'GET'));
});

echo "\n=== R-0110 authGateHasValidBantoToken() テスト ===\n\n";

runTest('一致するBearerトークンはtrue', function () {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer unit-test-banto-token';
    assertTrue(authGateHasValidBantoToken());
    unset($_SERVER['HTTP_AUTHORIZATION']);
});

runTest('不一致のBearerトークンはfalse', function () {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer wrong-token';
    assertTrue(!authGateHasValidBantoToken());
    unset($_SERVER['HTTP_AUTHORIZATION']);
});

runTest('Authorizationヘッダーなしはfalse', function () {
    unset($_SERVER['HTTP_AUTHORIZATION']);
    assertTrue(!authGateHasValidBantoToken());
});

runTest('Bearer以外のスキームはfalse', function () {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Basic dXNlcjpwYXNz';
    assertTrue(!authGateHasValidBantoToken());
    unset($_SERVER['HTTP_AUTHORIZATION']);
});

echo "\n=== R-0143 authGateHasValidSyncToken() テスト ===\n\n";

runTest('一致するBearerトークンはtrue', function () {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer unit-test-sync-token';
    assertTrue(authGateHasValidSyncToken());
    unset($_SERVER['HTTP_AUTHORIZATION']);
});

runTest('不一致のBearerトークンはfalse', function () {
    $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer wrong-token';
    assertTrue(!authGateHasValidSyncToken());
    unset($_SERVER['HTTP_AUTHORIZATION']);
});

runTest('Authorizationヘッダーなしはfalse', function () {
    unset($_SERVER['HTTP_AUTHORIZATION']);
    assertTrue(!authGateHasValidSyncToken());
});

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
