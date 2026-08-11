<?php
/**
 * R-076 Part A Phase 1: サーバソート基盤（list_helpers.php）のテスト
 *
 * 起動: php api/tests/test_list_sort.php
 *
 * - resolveSortClause() の単体テスト（ホワイトリスト検証・不正値フォールバック）
 * - GET /customers?page=1&sort=...&order=... の統合テスト（実データでの並び順）
 * - 専用 SQLite DB を使って既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_list_sort_' . getmypid() . '.sqlite';
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

// code順とname順が食い違うようにテストデータを投入する
$pdo->exec("DELETE FROM customers WHERE code LIKE 'LS%'");
$rows = [
    ['LS003', 'あ得意先', '03-0000-0001', '東京都A'],
    ['LS001', 'ん得意先', '01-0000-0001', '東京都B'],
    ['LS002', 'い得意先', '02-0000-0001', '東京都C'],
];
foreach ($rows as [$code, $name, $tel, $addr1]) {
    $pdo->exec("INSERT INTO customers (code, name, tel, address1, is_active) VALUES ('$code', '$name', '$tel', '$addr1', 1)");
}

// 建具台帳: code順・name順・total_cost順のすべてが互いに食い違うように投入する
// （3つの並び順のいずれかが偶然一致すると、未実装のままでも見かけ上テストが通ってしまうため）
$pdo->exec("DELETE FROM tategu_items WHERE code LIKE 'LT%'");
$titems = [
    // code, name, cost_body（他原価は0固定でtotal_cost=cost_bodyになる）
    ['LT001', 'い建具', 3000],
    ['LT002', 'ん建具', 1000],
    ['LT003', 'あ建具', 2000],
];
foreach ($titems as [$code, $name, $body]) {
    $pdo->exec("
        INSERT INTO tategu_items (code, name, status, cost_body, cost_hardware, cost_glass, cost_factory_hours, cost_site_hours, cost_labor_rate)
        VALUES ('$code', '$name', 'active', $body, 0, 0, 0, 0, 0)
    ");
}

// 案件: project_code順・name順・updated_at順のすべてが互いに食い違うように投入する（既定はupdated_at DESC）
$pdo->exec("DELETE FROM projects WHERE project_code LIKE 'LP%'");
$customerIdForProjects = (int)$pdo->query("SELECT id FROM customers WHERE code = 'LS001'")->fetchColumn();
$lprojects = [
    ['LP001', 'い案件', '2026-01-03'],
    ['LP002', 'ん案件', '2026-01-01'],
    ['LP003', 'あ案件', '2026-01-02'],
];
foreach ($lprojects as [$code, $name, $updatedAt]) {
    $pdo->exec("
        INSERT INTO projects (project_code, customer_id, name, status, updated_at)
        VALUES ('$code', $customerIdForProjects, '$name', '進行中', '$updatedAt 00:00:00')
    ");
}

// 伝票: voucher_no順・voucher_date順・total_amount順のすべてが互いに食い違うように投入する
$pdo->exec("DELETE FROM vouchers WHERE voucher_no LIKE 'LV%'");
$customerIdForVouchers = (int)$pdo->query("SELECT id FROM customers WHERE code = 'LS001'")->fetchColumn();
$lvouchers = [
    // voucher_no, voucher_date, total_amount
    ['LV001', '2026-03-02', 3000],
    ['LV002', '2026-03-03', 1000],
    ['LV003', '2026-03-01', 2000],
];
foreach ($lvouchers as [$no, $date, $total]) {
    $pdo->exec("
        INSERT INTO vouchers (voucher_no, voucher_type, status, customer_id, voucher_date, total_amount)
        VALUES ('$no', 'estimate', 'draft', $customerIdForVouchers, '$date', $total)
    ");
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
// resolveSortClause 単体テスト
// ============================================================
require_once $ROOT . '/routes/list_helpers.php';

echo "=== resolveSortClause 単体 ===\n";

runTest('ホワイトリスト内の列・ascを正しく組み立てる', function () {
    $_GET = ['sort' => 'name', 'order' => 'asc'];
    $clause = resolveSortClause(['name' => 'name', 'code' => 'code'], 'code', 'id');
    assertEq('ORDER BY name ASC, id ASC', $clause);
});

runTest('order=desc を正しく組み立てる', function () {
    $_GET = ['sort' => 'name', 'order' => 'desc'];
    $clause = resolveSortClause(['name' => 'name', 'code' => 'code'], 'code', 'id');
    assertEq('ORDER BY name DESC, id ASC', $clause);
});

runTest('ホワイトリストにない列名はデフォルト句へフォールバックする（400にしない）', function () {
    $_GET = ['sort' => 'DROP TABLE customers; --', 'order' => 'asc'];
    $clause = resolveSortClause(['name' => 'name', 'code' => 'code'], 'code', 'id');
    assertEq('ORDER BY code ASC, id ASC', $clause);
});

runTest('不正な order 値は asc へフォールバックする', function () {
    $_GET = ['sort' => 'name', 'order' => 'DROP TABLE customers'];
    $clause = resolveSortClause(['name' => 'name', 'code' => 'code'], 'code', 'id');
    assertEq('ORDER BY name ASC, id ASC', $clause);
});

runTest('sort 未指定時はデフォルト列を使う', function () {
    $_GET = [];
    $clause = resolveSortClause(['name' => 'name', 'code' => 'code'], 'code', 'id');
    assertEq('ORDER BY code ASC, id ASC', $clause);
});

runTest('tiebreaker が必ず末尾に付与される', function () {
    $_GET = ['sort' => 'code', 'order' => 'desc'];
    $clause = resolveSortClause(['code' => 'code'], 'code', 'id');
    assertTrue(str_ends_with($clause, ', id ASC'), 'tiebreaker id ASC が末尾にあること');
});

// ============================================================
// resolveSortClause 第4引数 $defaultOrder（DESC既定を維持したいエンドポイント向け）
// ============================================================
echo "\n=== resolveSortClause 第4引数 defaultOrder ===\n";

runTest('order未指定・第4引数省略時はASC（既存の3引数呼び出し互換）', function () {
    $_GET = ['sort' => 'code'];
    $clause = resolveSortClause(['code' => 'code'], 'code', 'id');
    assertEq('ORDER BY code ASC, id ASC', $clause);
});

runTest('order未指定・defaultOrder=DESC指定時はDESCになる', function () {
    $_GET = ['sort' => 'code'];
    $clause = resolveSortClause(['code' => 'code'], 'code', 'id', 'DESC');
    assertEq('ORDER BY code DESC, id ASC', $clause);
});

runTest('defaultOrder=DESCでもorder=ascを明示指定すればASCが優先される', function () {
    $_GET = ['sort' => 'code', 'order' => 'asc'];
    $clause = resolveSortClause(['code' => 'code'], 'code', 'id', 'DESC');
    assertEq('ORDER BY code ASC, id ASC', $clause);
});

runTest('defaultOrder=DESC時、不正なorder値はdefaultOrder(DESC)へフォールバックする', function () {
    $_GET = ['sort' => 'code', 'order' => 'not-a-direction'];
    $clause = resolveSortClause(['code' => 'code'], 'code', 'id', 'DESC');
    assertEq('ORDER BY code DESC, id ASC', $clause);
});

$_GET = [];

// ============================================================
// R-0092: resolveSortClause 複合ソート（カンマ区切り）
// ============================================================
echo "\n=== resolveSortClause 複合ソート（カンマ区切り） ===\n";

runTest('sort=a,b&order=asc,desc で複数カラムのORDER BYが順に組み立てられる', function () {
    $_GET = ['sort' => 'a,b', 'order' => 'asc,desc'];
    $clause = resolveSortClause(['a' => 'col_a', 'b' => 'col_b'], 'code', 'id');
    assertEq('ORDER BY col_a ASC, col_b DESC, id ASC', $clause);
});

runTest('複合ソートでもtiebreakerは末尾に一度だけ付与される', function () {
    $_GET = ['sort' => 'a,b', 'order' => 'desc,asc'];
    $clause = resolveSortClause(['a' => 'col_a', 'b' => 'col_b'], 'code', 'id');
    assertTrue(str_ends_with($clause, ', id ASC'), 'tiebreakerが末尾に一度だけ');
    assertEq(1, substr_count($clause, 'id ASC'), 'id ASCの出現回数は1回');
});

runTest('複合ソートでorderの指定数がsortより少ない場合は不足分をdefaultOrderで補う', function () {
    $_GET = ['sort' => 'a,b', 'order' => 'desc'];
    $clause = resolveSortClause(['a' => 'col_a', 'b' => 'col_b'], 'code', 'id');
    assertEq('ORDER BY col_a DESC, col_b ASC, id ASC', $clause);
});

runTest('複合ソートでホワイトリスト外のカラムは無視され、有効なカラムのみでORDER BYが組み立てられる', function () {
    $_GET = ['sort' => 'a,invalid,b', 'order' => 'asc,asc,desc'];
    $clause = resolveSortClause(['a' => 'col_a', 'b' => 'col_b'], 'code', 'id');
    assertEq('ORDER BY col_a ASC, col_b DESC, id ASC', $clause);
});

runTest('複合ソート指定で全カラムがホワイトリスト外ならデフォルト単一カラムにフォールバックする', function () {
    $_GET = ['sort' => 'invalid1,invalid2', 'order' => 'asc,asc'];
    $clause = resolveSortClause(['a' => 'col_a', 'b' => 'col_b'], 'code', 'id');
    assertEq('ORDER BY code ASC, id ASC', $clause);
});

runTest('カンマが無い単一カラム指定は既存動作と完全に同じ結果になる（後方互換）', function () {
    $_GET = ['sort' => 'a', 'order' => 'desc'];
    $single = resolveSortClause(['a' => 'col_a', 'b' => 'col_b'], 'code', 'id');
    $_GET = ['sort' => 'a,', 'order' => 'desc'];
    assertEq('ORDER BY col_a DESC, id ASC', $single, '単一カラム指定は従来通り');
});

$_GET = [];

// ============================================================
// GET /customers?page=1 実データでのソート統合テスト
// ============================================================
echo "\n=== GET /customers?page=1 サーバソート統合 ===\n";

$bootstrap = __DIR__ . '/_server_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

$port = 18085;
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

    runTest('sort=name&order=asc で name 昇順に並ぶ（実データ）', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/customers?page=1&per_page=200&sort=name&order=asc");
        $data = json_decode($body, true);
        $names = array_values(array_filter(array_column($data['data'], 'name'), fn($n) => in_array($n, ['あ得意先', 'い得意先', 'ん得意先'], true)));
        assertEq(['あ得意先', 'い得意先', 'ん得意先'], $names, 'name昇順（あ→い→ん）');
    });

    runTest('sort=name&order=desc で name 降順に並ぶ', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/customers?page=1&per_page=200&sort=name&order=desc");
        $data = json_decode($body, true);
        $names = array_values(array_filter(array_column($data['data'], 'name'), fn($n) => in_array($n, ['あ得意先', 'い得意先', 'ん得意先'], true)));
        assertEq(['ん得意先', 'い得意先', 'あ得意先'], $names, 'name降順（ん→い→あ）');
    });

    runTest('ホワイトリスト外の列名を指定しても400にならずcode順にフォールバックする', function () use ($port) {
        $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
        $body = file_get_contents(
            "http://127.0.0.1:$port/contents/Beaver/api/customers?page=1&per_page=200&sort=" . urlencode('access_customer_no') . "&order=asc",
            false,
            $ctx
        );
        $statusLine = $http_response_header[0] ?? '';
        assertTrue(str_contains($statusLine, '200'), 'expected 200 got: ' . $statusLine);
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'code'), fn($c) => str_starts_with((string)$c, 'LS')));
        assertEq(['LS001', 'LS002', 'LS003'], $codes, 'code昇順（デフォルト）にフォールバック');
    });

    runTest('sort 未指定時は従来通り code 順で返る（既存挙動を維持）', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/customers?page=1&per_page=200");
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'code'), fn($c) => str_starts_with((string)$c, 'LS')));
        assertEq(['LS001', 'LS002', 'LS003'], $codes, 'sort未指定はcode昇順');
    });

    // ============================================================
    // GET /tategu-items?page=1 実データでのソート統合テスト
    // ============================================================
    echo "\n=== GET /tategu-items?page=1 サーバソート統合 ===\n";

    runTest('sort 未指定時は従来通り code 降順で返る（既存挙動を維持）', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/tategu-items?page=1&per_page=200");
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'code'), fn($c) => str_starts_with((string)$c, 'LT')));
        assertEq(['LT003', 'LT002', 'LT001'], $codes, 'sort未指定はcode降順（既存動作）');
    });

    runTest('sort=name&order=asc で name 昇順に並ぶ', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/tategu-items?page=1&per_page=200&sort=name&order=asc");
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'code'), fn($c) => str_starts_with((string)$c, 'LT')));
        assertEq(['LT003', 'LT001', 'LT002'], $codes, 'name昇順（あ建具=LT003→い建具=LT001→ん建具=LT002）');
    });

    runTest('sort=total_cost&order=asc で原価合計の昇順に並ぶ（SQL式ホワイトリスト）', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/tategu-items?page=1&per_page=200&sort=total_cost&order=asc");
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'code'), fn($c) => str_starts_with((string)$c, 'LT')));
        assertEq(['LT002', 'LT003', 'LT001'], $codes, 'total_cost昇順（1000=LT002→2000=LT003→3000=LT001）');
    });

    runTest('sort=total_cost&order=desc で原価合計の降順に並ぶ', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/tategu-items?page=1&per_page=200&sort=total_cost&order=desc");
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'code'), fn($c) => str_starts_with((string)$c, 'LT')));
        assertEq(['LT001', 'LT003', 'LT002'], $codes, 'total_cost降順（3000=LT001→2000=LT003→1000=LT002）');
    });

    // ============================================================
    // GET /projects?page=1 実データでのソート統合テスト
    // ============================================================
    echo "\n=== GET /projects?page=1 サーバソート統合 ===\n";

    runTest('sort 未指定時は従来通り updated_at 降順で返る（既存挙動を維持）', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects?page=1&per_page=200");
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'project_code'), fn($c) => str_starts_with((string)$c, 'LP')));
        assertEq(['LP001', 'LP003', 'LP002'], $codes, 'sort未指定はupdated_at降順（既存動作）');
    });

    runTest('sort=name&order=asc で案件名の昇順に並ぶ', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects?page=1&per_page=200&sort=name&order=asc");
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'project_code'), fn($c) => str_starts_with((string)$c, 'LP')));
        assertEq(['LP003', 'LP001', 'LP002'], $codes, 'name昇順（あ案件=LP003→い案件=LP001→ん案件=LP002）');
    });

    runTest('projectsでホワイトリスト外の列名を指定しても400にならずupdated_at降順にフォールバックする', function () use ($port) {
        // order未指定のため、列名フォールバック(p.updated_at)と方向フォールバック(defaultOrder=DESC)の
        // 両方が効くことを確認する（order=ascを明示指定した場合は列だけフォールバックし
        // 方向は要求通りASCになるのが正しい挙動であり、それは別の関心事のためここでは検証しない）。
        $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
        $body = file_get_contents(
            "http://127.0.0.1:$port/contents/Beaver/api/projects?page=1&per_page=200&sort=" . urlencode('memo'),
            false,
            $ctx
        );
        $statusLine = $http_response_header[0] ?? '';
        assertTrue(str_contains($statusLine, '200'), 'expected 200 got: ' . $statusLine);
        $data = json_decode($body, true);
        $codes = array_values(array_filter(array_column($data['data'], 'project_code'), fn($c) => str_starts_with((string)$c, 'LP')));
        assertEq(['LP001', 'LP003', 'LP002'], $codes, 'updated_at降順（デフォルト）にフォールバック');
    });

    // ============================================================
    // GET /vouchers?page=1 実データでのソート統合テスト
    // ============================================================
    echo "\n=== GET /vouchers?page=1 サーバソート統合 ===\n";

    runTest('sort 未指定時は従来通り voucher_date 降順で返る（既存挙動を維持）', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/vouchers?page=1&per_page=200");
        $data = json_decode($body, true);
        $nos = array_values(array_filter(array_column($data['data'], 'voucher_no'), fn($n) => str_starts_with((string)$n, 'LV')));
        assertEq(['LV002', 'LV001', 'LV003'], $nos, 'sort未指定はvoucher_date降順（2026-03-03=LV002→03-02=LV001→03-01=LV003）');
    });

    runTest('sort=voucher_no&order=asc で伝票番号の昇順に並ぶ', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/vouchers?page=1&per_page=200&sort=voucher_no&order=asc");
        $data = json_decode($body, true);
        $nos = array_values(array_filter(array_column($data['data'], 'voucher_no'), fn($n) => str_starts_with((string)$n, 'LV')));
        assertEq(['LV001', 'LV002', 'LV003'], $nos, 'voucher_no昇順');
    });

    runTest('sort=total_amount&order=asc で合計金額の昇順に並ぶ', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/vouchers?page=1&per_page=200&sort=total_amount&order=asc");
        $data = json_decode($body, true);
        $nos = array_values(array_filter(array_column($data['data'], 'voucher_no'), fn($n) => str_starts_with((string)$n, 'LV')));
        assertEq(['LV002', 'LV003', 'LV001'], $nos, 'total_amount昇順（1000=LV002→2000=LV003→3000=LV001）');
    });

    runTest('sort=total_amount&order=desc で合計金額の降順に並ぶ', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/vouchers?page=1&per_page=200&sort=total_amount&order=desc");
        $data = json_decode($body, true);
        $nos = array_values(array_filter(array_column($data['data'], 'voucher_no'), fn($n) => str_starts_with((string)$n, 'LV')));
        assertEq(['LV001', 'LV003', 'LV002'], $nos, 'total_amount降順（3000=LV001→2000=LV003→1000=LV002）');
    });

    runTest('vouchersでホワイトリスト外の列名を指定しても400にならずvoucher_date降順にフォールバックする', function () use ($port) {
        $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
        $body = file_get_contents(
            "http://127.0.0.1:$port/contents/Beaver/api/vouchers?page=1&per_page=200&sort=" . urlencode('memo'),
            false,
            $ctx
        );
        $statusLine = $http_response_header[0] ?? '';
        assertTrue(str_contains($statusLine, '200'), 'expected 200 got: ' . $statusLine);
        $data = json_decode($body, true);
        $nos = array_values(array_filter(array_column($data['data'], 'voucher_no'), fn($n) => str_starts_with((string)$n, 'LV')));
        assertEq(['LV002', 'LV001', 'LV003'], $nos, 'voucher_date降順（デフォルト）にフォールバック');
    });
} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

echo "\n========================================\n";
echo "PASSED: $passed\n";
echo "FAILED: $failed\n";
if ($failed > 0) {
    echo "----- failures -----\n";
    foreach ($failures as $f) {
        echo " - $f\n";
    }
    exit(1);
}
exit(0);
