<?php
/**
 * R-0143 (6) 重複得意先統合スクリプト（A-B-10）単体テスト
 *
 * 起動: php api/tests/test_r0143_merge_duplicate_customers.php
 *
 * api/manual/r0143_merge_duplicate_customers.php のロジックを
 * テスト専用 SQLite DB に対してのみ実行して検証する。
 * 実DB（api/database.sqlite）には一切触れない。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

require_once $ROOT . '/manual/r0143_merge_duplicate_customers.php';

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

/**
 * 専用テストDBを新規作成し、schema+migrationsを適用したPDOを返す。
 */
function makeTestPdo(string $ROOT, string $testDbPath): PDO {
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
    return $pdo;
}

/**
 * keep/dup 2得意先と、dupを参照する projects/vouchers/invoices/payments を各1件作成する。
 * @return array{keepId:int,dupId:int}
 */
function seedKeepDupFixture(PDO $pdo): array {
    $pdo->exec("INSERT INTO customers (code, name, access_customer_no, memo) VALUES ('00010', 'keep得意先', NULL, NULL)");
    $keepId = (int)$pdo->lastInsertId();
    $pdo->exec("INSERT INTO customers (code, name, access_customer_no, memo) VALUES ('00011', 'dup得意先', '99999', '既存メモ')");
    $dupId = (int)$pdo->lastInsertId();

    $pdo->exec("INSERT INTO projects (customer_id, name) VALUES ({$dupId}, 'テスト案件')");
    $pdo->exec("
        INSERT INTO vouchers (voucher_no, voucher_type, customer_id, voucher_date)
        VALUES ('MRG-E00001', 'estimate', {$dupId}, '2026-01-01')
    ");
    $pdo->exec("
        INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date)
        VALUES ('MRG-I00001', {$dupId}, '2026-01-01', '2026-01-31', '2026-02-15')
    ");
    $pdo->exec("
        INSERT INTO payments (payment_no, customer_id, payment_date, amount)
        VALUES ('MRG-P00001', {$dupId}, '2026-01-01', 1000)
    ");

    return ['keepId' => $keepId, 'dupId' => $dupId];
}

function countByCustomer(PDO $pdo, string $table, int $customerId): int {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE customer_id = ?");
    $stmt->execute([$customerId]);
    return (int)$stmt->fetchColumn();
}

echo "=== R-0143 (6) 重複得意先統合スクリプト テスト ===\n\n";

runTest('6-1: keep/dupを用意し各テーブル1件ずつ紐付けた状態でマージ実行すると customer_id が keep_id に付け替わる', function () use ($ROOT) {
    $testDbPath = __DIR__ . '/test_r0143_merge_61_' . getmypid() . '.sqlite';
    $pdo = makeTestPdo($ROOT, $testDbPath);
    try {
        $fixture = seedKeepDupFixture($pdo);
        r0143MergeDuplicateCustomers($pdo, [['keep_id' => $fixture['keepId'], 'dup_id' => $fixture['dupId']]]);

        foreach (['projects', 'vouchers', 'invoices', 'payments'] as $table) {
            assertEq(1, countByCustomer($pdo, $table, $fixture['keepId']), "{$table} が keep_id に付け替わる");
            assertEq(0, countByCustomer($pdo, $table, $fixture['dupId']), "{$table} に dup_id が残らない");
        }
    } finally {
        unset($pdo);
        @unlink($testDbPath);
    }
});

runTest('6-2: マージ後のdup_idのcustomers行はis_active=0・access_customer_no=NULL・codeがDUP-始まり・memoに統合タグを含む', function () use ($ROOT) {
    $testDbPath = __DIR__ . '/test_r0143_merge_62_' . getmypid() . '.sqlite';
    $pdo = makeTestPdo($ROOT, $testDbPath);
    try {
        $fixture = seedKeepDupFixture($pdo);
        r0143MergeDuplicateCustomers($pdo, [['keep_id' => $fixture['keepId'], 'dup_id' => $fixture['dupId']]]);

        $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
        $stmt->execute([$fixture['dupId']]);
        $row = $stmt->fetch();

        assertEq(0, (int)$row['is_active'], 'is_active=0');
        assertEq(null, $row['access_customer_no'], 'access_customer_no=NULL');
        assertTrue(str_starts_with($row['code'], 'DUP-'), 'codeがDUP-で始まる: ' . $row['code']);
        assertTrue(
            str_contains($row['memo'], '[重複統合→' . $fixture['keepId'] . ']'),
            'memoに統合タグを含む: ' . $row['memo']
        );
    } finally {
        unset($pdo);
        @unlink($testDbPath);
    }
});

runTest('6-3: dup_idのcustomers行は物理削除されずSELECTで取得できる', function () use ($ROOT) {
    $testDbPath = __DIR__ . '/test_r0143_merge_63_' . getmypid() . '.sqlite';
    $pdo = makeTestPdo($ROOT, $testDbPath);
    try {
        $fixture = seedKeepDupFixture($pdo);
        r0143MergeDuplicateCustomers($pdo, [['keep_id' => $fixture['keepId'], 'dup_id' => $fixture['dupId']]]);

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM customers WHERE id = ?');
        $stmt->execute([$fixture['dupId']]);
        assertEq(1, (int)$stmt->fetchColumn(), 'dup_idの行がSELECTで取得できる（論理削除のみ）');
    } finally {
        unset($pdo);
        @unlink($testDbPath);
    }
});

runTest('6-4: 存在しないdup_idを含むケースはトランザクション全体がロールバックされ、いずれのテーブルも変更されない', function () use ($ROOT) {
    $testDbPath = __DIR__ . '/test_r0143_merge_64_' . getmypid() . '.sqlite';
    $pdo = makeTestPdo($ROOT, $testDbPath);
    try {
        $fixture = seedKeepDupFixture($pdo);
        $nonExistentDupId = $fixture['dupId'] + 9999;

        $threw = false;
        try {
            r0143MergeDuplicateCustomers($pdo, [
                ['keep_id' => $fixture['keepId'], 'dup_id' => $fixture['dupId']],
                ['keep_id' => $fixture['keepId'], 'dup_id' => $nonExistentDupId],
            ]);
        } catch (Throwable $e) {
            $threw = true;
        }
        assertTrue($threw, '存在しないdup_idでは例外が投げられる');

        // 1組目（正常な組）を含め、いずれのテーブルも変更されていないこと
        foreach (['projects', 'vouchers', 'invoices', 'payments'] as $table) {
            assertEq(1, countByCustomer($pdo, $table, $fixture['dupId']), "{$table} は dup_id のまま（ロールバック）");
            assertEq(0, countByCustomer($pdo, $table, $fixture['keepId']), "{$table} は keep_id に変更されていない（ロールバック）");
        }
        $stmt = $pdo->prepare('SELECT is_active FROM customers WHERE id = ?');
        $stmt->execute([$fixture['dupId']]);
        assertEq(1, (int)$stmt->fetchColumn(), 'dup_idのcustomers行のis_activeも変更されていない（ロールバック）');
    } finally {
        unset($pdo);
        @unlink($testDbPath);
    }
});

runTest('6-5: dry-runモードでは対象件数のみ表示され、実際のUPDATEは発生しない（実行前後で不変）', function () use ($ROOT) {
    $testDbPath = __DIR__ . '/test_r0143_merge_65_' . getmypid() . '.sqlite';
    $pdo = makeTestPdo($ROOT, $testDbPath);
    try {
        $fixture = seedKeepDupFixture($pdo);
        $result = r0143MergeDuplicateCustomers(
            $pdo,
            [['keep_id' => $fixture['keepId'], 'dup_id' => $fixture['dupId']]],
            true
        );

        assertEq(1, $result[0]['counts']['projects'], 'dry-runでも対象件数は返る（projects）');
        assertEq(1, $result[0]['counts']['vouchers'], 'dry-runでも対象件数は返る（vouchers）');
        assertEq(1, $result[0]['counts']['invoices'], 'dry-runでも対象件数は返る（invoices）');
        assertEq(1, $result[0]['counts']['payments'], 'dry-runでも対象件数は返る（payments）');

        foreach (['projects', 'vouchers', 'invoices', 'payments'] as $table) {
            assertEq(1, countByCustomer($pdo, $table, $fixture['dupId']), "{$table} はdry-runでは変更されない");
            assertEq(0, countByCustomer($pdo, $table, $fixture['keepId']), "{$table} はdry-runではkeep_idに変わらない");
        }
        $stmt = $pdo->prepare('SELECT is_active, access_customer_no, code FROM customers WHERE id = ?');
        $stmt->execute([$fixture['dupId']]);
        $row = $stmt->fetch();
        assertEq(1, (int)$row['is_active'], 'dry-runではis_activeは変わらない');
        assertEq('99999', $row['access_customer_no'], 'dry-runではaccess_customer_noは変わらない');
        assertEq('00011', $row['code'], 'dry-runではcodeは変わらない');
    } finally {
        unset($pdo);
        @unlink($testDbPath);
    }
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
