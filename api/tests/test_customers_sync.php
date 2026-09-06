<?php
/**
 * AccessTategu連携契約 A-B-01: GET /customers/sync テスト
 *
 * 起動: php api/tests/test_customers_sync.php
 *
 * - php ビルトインサーバを起動して実際にHTTPで叩く（GET /vouchers/sync のテストと同じ方式）
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_customers_sync_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
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

// テスト用得意先3件。updated_atはUTC生値を直接固定する（DB保存契約はUTC）。
$pdo->exec("INSERT INTO customers (code, name, carry_forward_balance) VALUES ('CS001', '得意先A', 5000)");
$custAId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO customers (code, name, carry_forward_balance) VALUES ('CS002', '得意先B', 0)");
$custBId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO customers (code, name, carry_forward_balance) VALUES ('CS003', '得意先C', 0)");
$custCId = (int)$pdo->lastInsertId();
$pdo->exec("UPDATE customers SET updated_at = '2026-01-01 00:00:00' WHERE id = $custAId");
$pdo->exec("UPDATE customers SET updated_at = '2026-01-02 00:00:00' WHERE id = $custBId");
$pdo->exec("UPDATE customers SET updated_at = '2026-01-03 00:00:00' WHERE id = $custCId");
$pdo = null;

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

// DB_PATH を上書きするための bootstrap を生成
$bootstrap = __DIR__ . '/_customers_sync_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18093;
$serverProc = proc_open(
    [
        'php',
        '-d', 'auto_prepend_file=' . $bootstrap,
        '-S', "127.0.0.1:$port",
        '-t', $ROOT,
        $ROOT . '/index.php',
    ],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $serverPipes,
    $ROOT
);
if (!is_resource($serverProc)) {
    @unlink($bootstrap);
    throw new RuntimeException('php ビルトインサーバを起動できませんでした');
}

$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
    $r   = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
    if ($r !== false) { $ready = true; break; }
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    $base  = "http://127.0.0.1:$port/contents/Beaver/api/customers/sync";
    $fetch = function (string $url) {
        $ctx = stream_context_create(['http' => ['header' => "Connection: close\r\n", 'timeout' => 5, 'ignore_errors' => true]]);
        $body = false; $hdr = [];
        for ($t = 0; $t < 3 && $body === false; $t++) {
            if ($t > 0) usleep(200000);
            $body = @file_get_contents($url, false, $ctx);
            if (isset($http_response_header)) $hdr = $http_response_header;
        }
        return ['body' => (string)$body, 'status' => $hdr[0] ?? ''];
    };

    runTest('/customers/sync/anything は 404', function () use ($base) {
        $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
        @file_get_contents($base . '/anything', false, $ctx);
        $statusLine = $http_response_header[0] ?? '';
        assertTrue(str_contains($statusLine, '404'), 'expected 404 got: ' . $statusLine);
    });

    runTest('/customers/sync は 200 で customers/synced_at を返す', function () use ($fetch, $base) {
        $data = json_decode($fetch($base)['body'], true);
        assertTrue(isset($data['customers']), 'customers key exists');
        assertTrue(isset($data['synced_at']), 'synced_at key exists');
        assertEq(3, count($data['customers']), '3件登録した得意先が全件返る');
    });

    runTest('受入条件1: updated_after指定でそれ以降に更新された2件だけ返る', function () use ($fetch, $base) {
        // JST 2026-01-01 09:00:00 = UTC 2026-01-01 00:00:00（得意先Aの更新時刻と同時刻→>で除外）
        $data = json_decode($fetch($base . '?updated_after=' . urlencode('2026-01-01 09:00:00'))['body'], true);
        assertEq(2, count($data['customers']), '2件だけ返ること');
        $names = array_column($data['customers'], 'name');
        assertTrue(!in_array('得意先A', $names, true), '得意先Aは含まれない');
        assertTrue(in_array('得意先B', $names, true), '得意先Bは含まれる');
        assertTrue(in_array('得意先C', $names, true), '得意先Cは含まれる');
    });

    runTest('updated_afterの形式が不正なら400', function () use ($fetch, $base) {
        $r = $fetch($base . '?updated_after=' . urlencode('not-a-date'));
        assertTrue(str_contains($r['status'], '400'), 'expected 400 got: ' . $r['status']);
    });

    runTest('cursorが数値でなければ400', function () use ($fetch, $base) {
        $r = $fetch($base . '?cursor=abc');
        assertTrue(str_contains($r['status'], '400'), 'expected 400 got: ' . $r['status']);
    });

    runTest('受入条件2: limit=1で1ページ目にnext_cursor/next_cursor_atが付き、続きが取得できる', function () use ($fetch, $base) {
        $page1 = json_decode($fetch($base . '?limit=1')['body'], true);
        assertEq(1, count($page1['customers']), '1件だけ返る');
        assertTrue(isset($page1['next_cursor']), 'next_cursor present');
        assertTrue(isset($page1['next_cursor_at']), 'next_cursor_at present');
        // next_cursor_at は次ページ先頭になるはずの得意先B(JST 2026-01-02 09:00:00)のupdated_at
        assertEq('2026-01-02 09:00:00', $page1['next_cursor_at'], 'next_cursor_atが次ページ先頭のupdated_at(JST)と一致');

        $cursor = $page1['next_cursor'];
        $page2 = json_decode($fetch($base . '?cursor=' . $cursor)['body'], true);
        assertEq(2, count($page2['customers']), '残り2件が返る');
        assertTrue(!isset($page2['next_cursor']), '最終ページにnext_cursorは付かない');
        assertTrue(!isset($page2['next_cursor_at']), '最終ページにnext_cursor_atは付かない');
        $firstIds  = array_column($page1['customers'], 'id');
        $secondIds = array_column($page2['customers'], 'id');
        assertTrue(empty(array_intersect($firstIds, $secondIds)), 'ページ間で重複しない');
    });

    runTest('受入条件3: いずれの得意先オブジェクトにもcarry_forward_balanceキーが存在しない', function () use ($fetch, $base) {
        $data = json_decode($fetch($base)['body'], true);
        foreach ($data['customers'] as $c) {
            assertTrue(!array_key_exists('carry_forward_balance', $c), 'carry_forward_balanceキーが含まれない');
        }
    });

    runTest('存在しない列(tax_type/trade_type)は応答に含まれない', function () use ($fetch, $base) {
        $data = json_decode($fetch($base)['body'], true);
        foreach ($data['customers'] as $c) {
            assertTrue(!array_key_exists('tax_type', $c), 'tax_typeキーが含まれない');
            assertTrue(!array_key_exists('trade_type', $c), 'trade_typeキーが含まれない');
        }
    });

    runTest('受入条件4: synced_atがISO8601形式でパース可能', function () use ($fetch, $base) {
        $data = json_decode($fetch($base)['body'], true);
        $dt = DateTime::createFromFormat(DateTime::ATOM, $data['synced_at']);
        assertTrue($dt !== false, 'synced_atがATOM形式でパースできる: ' . $data['synced_at']);
    });

    runTest('honorific_type/address1/address2の列が含まれる', function () use ($fetch, $base) {
        $data = json_decode($fetch($base)['body'], true);
        $first = $data['customers'][0];
        foreach (['honorific_type', 'address1', 'address2'] as $key) {
            assertTrue(array_key_exists($key, $first), "$key キーが存在すること");
        }
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

// ============================================================
// 結果サマリ
// ============================================================
echo "\n========================================\n";
echo "PASSED: $passed\n";
echo "FAILED: $failed\n";
if ($failed > 0) {
    echo "----- failures -----\n";
    foreach ($failures as $f) echo " - $f\n";
    exit(1);
}
@unlink($testDbPath);
exit(0);
