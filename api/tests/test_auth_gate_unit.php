<?php
/**
 * R-0109 authGateIsExempt() 単体テスト
 *
 * 起動: php api/tests/test_auth_gate_unit.php
 */

declare(strict_types=1);

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
    ['POST', '/projects/1/vouchers/sync'],
    ['GET', '/vouchers/sync'],
    ['POST', '/vouchers/sync'],
    ['PATCH', '/vouchers/5/access-link'],
    ['POST', '/aggregation-categories/sync'],
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
];
foreach ($guardedCases as [$method, $path]) {
    runTest("ゲート対象: $method $path", function () use ($method, $path) {
        assertTrue(!authGateIsExempt($path, $method), "$method $path はゲート対象であるべき");
    });
}

runTest('GET /feedback は対象外ではない（POSTのみ免除）', function () {
    assertTrue(!authGateIsExempt('/feedback', 'GET'));
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
