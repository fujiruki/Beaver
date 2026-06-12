<?php
/**
 * Beaver R-034 / R-035 単体・統合テスト
 *
 * 起動: php api/tests/test_sync.php
 *
 * - sync_helpers.php の関数を直接呼び出して JSON レスポンスを検証
 * - GET /projects/sync の pagination は php ビルトインサーバを起動して curl 相当で叩く
 * - 専用の SQLite DB を tests ディレクトリ配下に用意して既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_sync.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}

$pdo = new PDO('sqlite:' . $testDbPath, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');

// schema.sql + 全マイグレーションを順に流し込む
$pdo->exec(file_get_contents($ROOT . '/schema.sql'));
$migrations = glob($ROOT . '/migrations/*.sql');
sort($migrations);
foreach ($migrations as $m) {
    $sql = file_get_contents($m);
    // コメント行を除去
    $sql = preg_replace('/^\s*--.*$/m', '', $sql);
    // ステートメントごとに split して個別実行（重複 ALTER などはスキップ）
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}

// sequences 初期値
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0)");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('sales', 0)");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");

// tax_rates 初期値（recalcVoucher 用ではないが既存テーブル制約への保険）
$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");

// テスト用得意先・案件
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先A', '100')");
$customerAId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先B', '200')");

$pdo->exec("INSERT INTO projects (project_code, customer_id, name, status)
            VALUES ('P00001', $customerAId, 'テスト案件1', '進行中')");
$projectId = (int)$pdo->lastInsertId();

// sync_helpers.php を読み込む
require_once $ROOT . '/routes/sync_helpers.php';

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

function assertEq($expected, $actual, string $label = '', array $debug = []): void {
    if ($expected !== $actual) {
        $dbg = empty($debug) ? '' : ' debug=' . json_encode($debug, JSON_UNESCAPED_UNICODE);
        throw new RuntimeException(sprintf(
            "%s expected=%s actual=%s%s",
            $label,
            var_export($expected, true),
            var_export($actual, true),
            $dbg
        ));
    }
}

function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

/**
 * sync_helpers の関数を呼び、出力 JSON と HTTP コードを取得するラッパ。
 * php://input を擬似化するため readJsonBody は引数として受ける版を使えないので、
 * 一時的に tmpfile に書いて wrapper を切り替えるのは面倒。
 * → readJsonBody は file_get_contents('php://input') を読むが、
 *   PHP CLI でテストする場合は STDIN もしくは空。
 *   そこで簡易に json_decode 済み配列を直接食わせるラッパを利用するため、
 *   sync_helpers の関数を一旦呼ばず、validation 部分だけ別関数として
 *   テストする戦略を取る。
 *
 * しかし R-034/R-035 の核心は呼び出し全体なので、readJsonBody を
 * 入れ替えられるよう、テストでは $_GLOBALS のフックを使用する。
 * sync_helpers.php の readJsonBody は function_exists ガードで定義されているため、
 * 先に readJsonBody を上書き定義すれば差し替え可能。
 */

// PHP では一度定義された関数を上書きできないが、sync_helpers.php 側は function_exists ガードで
// 既に定義されている。テストでは readJsonBody を「我々が制御する別関数」に転送するため、
// グローバル変数経由で投入する JSON を切り替える方法を取る。
$GLOBALS['__TEST_BODY'] = [];

// readJsonBody を差し替えるため、sync_helpers.php より先に定義しておく必要があった。
// → このファイルは既に require_once 済みなので、php://input を上書きする runkit がない以上、
//    syncVoucherUpsert などの $data 注入は別経路で行う。
// 代替策: file_get_contents('php://input') をモックするため、
// php スクリプト引数 (CLI) では入力データを STDIN から流せる。
// テストランナーから子プロセスを起動して各ケースを子プロセスに渡し、stdin に JSON を渡す方式。

// === 子プロセスでのケース実行ヘルパ ===
function runHelperCase(string $func, $arg1, ?array $body): array {
    global $testDbPath;
    $worker = __DIR__ . '/_worker.php';
    $payload = json_encode([
        'db'   => $testDbPath,
        'func' => $func,
        'arg1' => $arg1,
        'body' => $body,
    ], JSON_UNESCAPED_UNICODE);

    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];
    $proc = proc_open(['php', $worker], $descriptors, $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException('子プロセス起動に失敗');
    }
    fwrite($pipes[0], $payload);
    fclose($pipes[0]);
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($proc);

    $decoded = json_decode($stdout, true);
    if (!is_array($decoded)) {
        throw new RuntimeException("worker からの JSON パース失敗。stdout=$stdout stderr=$stderr");
    }
    return $decoded;
}

// ============================================================
// テスト本体
// ============================================================
echo "=== R-034 (a) customer_access_no 空時の挙動 ===\n";

runTest('過去伝票モード（project_id=null）かつ customer_access_no 空 → 200 OK で customer_id=NULL', function () use (&$pdo) {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9001,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-01',
        'total_amount'      => 12000,
    ]);
    assertEq(200, $r['code'], 'http code', ['stderr' => $r['stderr'] ?? '', 'body' => $r['body'] ?? null]);
    assertEq('synced', $r['body']['status'] ?? null, 'response status');
    $row = $pdo->query('SELECT customer_id, project_id FROM vouchers WHERE access_voucher_id = 9001')->fetch();
    assertTrue($row !== false, 'inserted row exists');
    assertEq(null, $row['customer_id'], 'customer_id is null');
    assertEq(null, $row['project_id'], 'project_id is null');
});

runTest('案件付き伝票（project_id 指定）で customer_access_no 空 → 400', function () use (&$pdo, $projectId) {
    $r = runHelperCase('syncVoucherUpsert', $projectId, [
        'access_voucher_id' => 9002,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-01',
        'total_amount'      => 5000,
    ]);
    assertEq(400, $r['code'], 'http code');
    assertTrue(str_contains($r['body']['error'] ?? '', '必須'), 'error mentions 必須');
});

runTest('案件付き伝票で customer_access_no 正常 → 200 OK', function () use (&$pdo, $projectId) {
    $r = runHelperCase('syncVoucherUpsert', $projectId, [
        'access_voucher_id' => 9003,
        'voucher_type'      => 'sales',
        'customer_access_no'=> '100',
        'voucher_date'      => '2026-06-02',
        'total_amount'      => 8000,
    ]);
    assertEq(200, $r['code'], 'http code');
    $row = $pdo->query('SELECT customer_id, project_id FROM vouchers WHERE access_voucher_id = 9003')->fetch();
    assertTrue($row['customer_id'] !== null, 'customer_id resolved');
});

runTest('過去伝票モードで customer_access_no 不正値 → 400', function () {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9004,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '999999',
        'voucher_date'      => '2026-06-02',
        'total_amount'      => 1000,
    ]);
    assertEq(400, $r['code'], 'http code');
});

echo "\n=== R-034 (c) voucher_lines validation ===\n";

runTest('line_type 不正値 → 422', function () {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9101,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-03',
        'total_amount'      => 1000,
        'lines' => [
            ['line_type' => 'EVIL', 'item_name' => 'X', 'quantity' => 1, 'line_total' => 1000, 'tax_category' => '課税'],
        ],
    ]);
    assertEq(422, $r['code']);
    assertEq('invalid_line', $r['body']['error']);
    assertEq('line_type', $r['body']['field']);
});

runTest('tax_category 不正値 → 422', function () {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9102,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-03',
        'total_amount'      => 1000,
        'lines' => [
            ['line_type' => 'normal', 'item_name' => 'X', 'quantity' => 1, 'line_total' => 1000, 'tax_category' => 'BAD'],
        ],
    ]);
    assertEq(422, $r['code']);
    assertEq('tax_category', $r['body']['field']);
});

runTest('quantity 負値 → 422', function () {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9103,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-03',
        'total_amount'      => 1000,
        'lines' => [
            ['line_type' => 'normal', 'item_name' => 'X', 'quantity' => -1, 'line_total' => 1000, 'tax_category' => '課税'],
        ],
    ]);
    assertEq(422, $r['code']);
    assertEq('quantity', $r['body']['field']);
});

runTest('line_total 非数値 → 422', function () {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9104,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-03',
        'total_amount'      => 1000,
        'lines' => [
            ['line_type' => 'normal', 'item_name' => 'X', 'quantity' => 1, 'line_total' => 'abc', 'tax_category' => '課税'],
        ],
    ]);
    assertEq(422, $r['code']);
    assertEq('line_total', $r['body']['field']);
});

runTest('正常な lines は 200 で INSERT される', function () use (&$pdo) {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9105,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-03',
        'total_amount'      => 2000,
        'lines' => [
            ['line_type' => 'normal',   'item_name' => 'A', 'quantity' => 2, 'line_total' => 1000, 'tax_category' => '課税'],
            ['line_type' => 'discount', 'item_name' => '値引', 'quantity' => 1, 'line_total' => 500, 'tax_category' => '課税'],
        ],
    ]);
    assertEq(200, $r['code']);
    $cnt = $pdo->query("
        SELECT COUNT(*) FROM voucher_lines vl
        JOIN vouchers v ON v.id = vl.voucher_id
        WHERE v.access_voucher_id = 9105
    ")->fetchColumn();
    assertEq('2', (string)$cnt);
});

runTest('422 のときは voucher 本体も INSERT されない（rollback 確認）', function () use (&$pdo) {
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id' => 9106,
        'voucher_type'      => 'estimate',
        'customer_access_no'=> '',
        'voucher_date'      => '2026-06-03',
        'total_amount'      => 999,
        'lines' => [
            ['line_type' => 'WRONG', 'item_name' => 'X', 'quantity' => 1, 'line_total' => 999, 'tax_category' => '課税'],
        ],
    ]);
    assertEq(422, $r['code']);
    $row = $pdo->query('SELECT id FROM vouchers WHERE access_voucher_id = 9106')->fetch();
    assertEq(false, $row, 'voucher row should not exist (rolled back)');
});

echo "\n=== R-035 (b) access_voucher_no 重複時の防御 ===\n";

runTest('access_voucher_no が複数件ヒットしても LIMIT 1 で更新は成功する', function () use (&$pdo, $projectId) {
    // 同一 access_voucher_no を持つ 2 件を強制作成（UNIQUE 制約は access_voucher_id のみ）
    $pdo->exec("DELETE FROM vouchers WHERE access_voucher_no = 'DUP-001'");
    $pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, project_id, customer_id, voucher_date, total_amount, access_voucher_id, access_voucher_no)
                VALUES ('E99001', 'estimate', 'approved', $projectId, 1, '2026-06-04', 1000, 99001, 'DUP-001')");
    $pdo->exec("INSERT INTO vouchers (voucher_no, voucher_type, status, project_id, customer_id, voucher_date, total_amount, access_voucher_id, access_voucher_no)
                VALUES ('E99002', 'estimate', 'approved', $projectId, 1, '2026-06-04', 2000, 99002, 'DUP-001')");

    $r = runHelperCase('syncVoucherUpdate', ['project_id' => $projectId, 'voucher_no' => 'DUP-001'], [
        'voucher_type' => 'sales',
        'total_amount' => 3000,
    ]);
    assertEq(200, $r['code']);

    // 先頭 id の伝票だけ更新される
    $rows = $pdo->query("SELECT id, voucher_type, total_amount FROM vouchers WHERE access_voucher_no = 'DUP-001' ORDER BY id ASC")->fetchAll();
    assertEq(2, count($rows));
    assertEq('sales', $rows[0]['voucher_type'], 'first row updated');
    assertEq('estimate', $rows[1]['voucher_type'], 'second row untouched');

    // 警告ログが stderr に出ているか
    assertTrue(str_contains($r['stderr'] ?? '', 'access_voucher_no=DUP-001'), 'warning log emitted');
});

runTest('syncVoucherShipped も重複時に警告ログを出して LIMIT 1 で更新', function () use (&$pdo, $projectId) {
    $r = runHelperCase('syncVoucherShipped', ['project_id' => $projectId, 'voucher_no' => 'DUP-001'], [
        'shipped'    => true,
        'shipped_at' => '2026-06-05T10:00:00+09:00',
    ]);
    assertEq(200, $r['code']);
    $rows = $pdo->query("SELECT id, shipped FROM vouchers WHERE access_voucher_no = 'DUP-001' ORDER BY id ASC")->fetchAll();
    assertEq(1, (int)$rows[0]['shipped'], 'first shipped=1');
    assertEq(0, (int)$rows[1]['shipped'], 'second shipped=0');
    assertTrue(str_contains($r['stderr'] ?? '', 'syncVoucherShipped'), 'warning includes function name');
});

// ============================================================
// R-034 review MEDIUM-1: 再 push で customer_id / project_id を degrade させない
// ============================================================
echo "\n=== R-034 review MEDIUM-1 UPSERT で customer_id/project_id を degrade させない ===\n";

runTest('test_upsert_preserves_existing_customer_id_on_null_push', function () use (&$pdo, $projectId, $customerAId) {
    // 案件付き伝票として INSERT (customer_id=$customerAId で access_voucher_id=999)
    $r1 = runHelperCase('syncVoucherUpsert', $projectId, [
        'access_voucher_id'  => 999,
        'voucher_type'       => 'sales',
        'customer_access_no' => '100',
        'voucher_date'       => '2026-06-05',
        'total_amount'       => 10000,
    ]);
    assertEq(200, $r1['code'], 'first insert http code');
    $row1 = $pdo->query('SELECT customer_id, project_id FROM vouchers WHERE access_voucher_id = 999')->fetch();
    assertEq($customerAId, (int)$row1['customer_id'], 'customer_id initially set');
    assertEq($projectId, (int)$row1['project_id'], 'project_id initially set');

    // 過去伝票モードで再 push (project_id=NULL, customer_access_no='', access_voucher_id=999)
    $r2 = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id'  => 999,
        'voucher_type'       => 'sales',
        'customer_access_no' => '',
        'voucher_date'       => '2026-06-06',
        'total_amount'       => 11000,
    ]);
    assertEq(200, $r2['code'], 'second push http code');

    // customer_id / project_id は degrade せず元の値が保持される
    $row2 = $pdo->query('SELECT customer_id, project_id, total_amount, voucher_date FROM vouchers WHERE access_voucher_id = 999')->fetch();
    assertEq($customerAId, (int)$row2['customer_id'], 'customer_id preserved (NOT degraded to NULL)');
    assertEq($projectId, (int)$row2['project_id'], 'project_id preserved (NOT degraded to NULL)');
    // 他のフィールドは通常通り更新されることも確認
    assertEq(11000.0, (float)$row2['total_amount'], 'total_amount updated');
    assertEq('2026-06-06', $row2['voucher_date'], 'voucher_date updated');
});

// ============================================================
// GET /projects/sync の pagination と routing 厳格化
// ============================================================
echo "\n=== R-034 (b) / R-035 (a) GET /projects/sync ===\n";

// php ビルトインサーバを起動して curl 相当で叩く
// 実 DB（api/database.sqlite）は絶対に触らない。auto_prepend_file で DB_PATH を上書きする。

// pagination 検証のため、テスト DB に案件を追加
$pdo2 = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo2->exec("DELETE FROM projects WHERE project_code LIKE 'PG%'");
for ($i = 1; $i <= 5; $i++) {
    $code = sprintf('PG%03d', $i);
    $pdo2->exec("INSERT INTO projects (project_code, customer_id, name, status) VALUES ('$code', 1, 'ページング案件$i', '進行中')");
}
$pdo2 = null;

// DB_PATH を上書きするための bootstrap を生成
$bootstrap = __DIR__ . '/_server_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");

// php ビルトインサーバ起動（-d auto_prepend_file=... で先に bootstrap を読み込む）
$port = 18083;
$serverProc = proc_open(
    [
        'php',
        '-d', 'auto_prepend_file=' . $bootstrap,
        '-S', "127.0.0.1:$port",
        '-t', $ROOT,
        $ROOT . '/index.php',
    ],
    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
    $serverPipes,
    $ROOT
);
if (!is_resource($serverProc)) {
    @unlink($bootstrap);
    throw new RuntimeException('php ビルトインサーバを起動できませんでした');
}

// サーバ起動待ち
$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
    $r   = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx);
    if ($r !== false) { $ready = true; break; }
}

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');

    runTest('/projects/sync/anything は 404', function () use ($port) {
        $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync/anything", false, $ctx);
        $statusLine = $http_response_header[0] ?? '';
        assertTrue(str_contains($statusLine, '404'), 'expected 404 got: ' . $statusLine);
    });

    runTest('/projects/sync は 200 で projects/limit/total を返す', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync");
        $data = json_decode($body, true);
        assertTrue(isset($data['projects']), 'projects key exists');
        assertTrue(isset($data['limit']), 'limit key exists');
        assertEq(1000, $data['limit']);
    });

    runTest('/projects/sync?limit=2 は 2 件返し next_cursor を含む', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync?limit=2");
        $data = json_decode($body, true);
        assertEq(2, count($data['projects']), 'projects count');
        assertEq(2, $data['limit']);
        assertTrue(isset($data['next_cursor']), 'next_cursor present');
    });

    runTest('/projects/sync?limit=2&cursor=N で次ページを取得できる', function () use ($port) {
        $body1 = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync?limit=2");
        $data1 = json_decode($body1, true);
        $cursor = $data1['next_cursor'];
        $firstIds = array_column($data1['projects'], 'id');

        $body2 = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync?limit=2&cursor=$cursor");
        $data2 = json_decode($body2, true);
        $secondIds = array_column($data2['projects'], 'id');

        assertTrue(count($data2['projects']) > 0, 'second page has results');
        assertTrue(empty(array_intersect($firstIds, $secondIds)), 'pages do not overlap');
        assertTrue(min($secondIds) > $cursor, 'all second-page ids > cursor');
    });

    runTest('/projects/sync?limit=99999 は 5000 にクランプされる', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync?limit=99999");
        $data = json_decode($body, true);
        assertEq(5000, $data['limit']);
    });

    runTest('/projects/sync?cursor=abc は 400', function () use ($port) {
        $ctx = stream_context_create(['http' => ['ignore_errors' => true]]);
        @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync?cursor=abc", false, $ctx);
        $statusLine = $http_response_header[0] ?? '';
        assertTrue(str_contains($statusLine, '400'), 'expected 400 got: ' . $statusLine);
    });

    // ============================================================
    // R-047: GET /projects/sync レスポンスに customer_access_no が含まれること
    // ============================================================
    echo "
=== R-047 GET /projects/sync に customer_access_no が含まれること ===
";

    runTest('得意先紐付き案件の customer_access_no が正しく返る', function () use ($port) {
        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync");
        $data = json_decode($body, true);
        assertTrue(isset($data['projects']), 'projects key exists');
        $found = null;
        foreach ($data['projects'] as $p) {
            if ($p['project_code'] === 'P00001') { $found = $p; break; }
        }
        assertTrue($found !== null, 'P00001 が見つかること');
        assertTrue(array_key_exists('customer_access_no', $found), 'customer_access_no キーが存在すること');
        assertEq('100', $found['customer_access_no'], 'customer_access_no の値が得意先の access_customer_no と一致すること');
    });

    runTest('access_customer_no が未設定の得意先に紐づく案件は customer_access_no = null', function () use ($port, $testDbPath) {
        // access_customer_no が NULL の得意先と案件を投入（projects.customer_id は NOT NULL のため得意先は必須）
        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $tmpPdo->exec("INSERT INTO customers (name) VALUES ('access_no未設定得意先')");
        $noAccNoCustomerId = (int)$tmpPdo->lastInsertId();
        $tmpPdo->exec("INSERT INTO projects (project_code, customer_id, name, status) VALUES ('P99999', $noAccNoCustomerId, 'access_no未設定案件', '進行中')");
        $tmpPdo = null;

        $body = file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/projects/sync");
        $data = json_decode($body, true);
        $found = null;
        foreach ($data['projects'] as $p) {
            if ($p['project_code'] === 'P99999') { $found = $p; break; }
        }
        assertTrue($found !== null, 'P99999 が見つかること');
        assertTrue(array_key_exists('customer_access_no', $found), 'customer_access_no キーが存在すること');
        assertEq(null, $found['customer_access_no'], 'access_customer_no 未設定得意先の案件は customer_access_no = null');
    });

} finally {
    // サーバ停止
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

// ============================================================
// R-034 review HIGH-1: migration 012 が sales_category_id を保全すること
// ============================================================
echo "\n=== R-034 review HIGH-1 migration 012 で sales_category_id が保全される ===\n";

runTest('test_migration_012_preserves_sales_category_id', function () use ($ROOT) {
    // 独立した一時 DB を用意（test_sync.sqlite には触らない）
    $migDbPath = __DIR__ . '/test_migration_012.sqlite';
    if (file_exists($migDbPath)) { unlink($migDbPath); }

    $mpdo = new PDO('sqlite:' . $migDbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $mpdo->exec('PRAGMA foreign_keys=ON');

    // schema.sql + migrations 002-011 を順に適用（本番状態の再現）
    $mpdo->exec(file_get_contents($ROOT . '/schema.sql'));
    $allMigrations = glob($ROOT . '/migrations/*.sql');
    sort($allMigrations);
    foreach ($allMigrations as $m) {
        if (basename($m) === '012_vouchers_customer_id_nullable.sql') continue;
        $sql = file_get_contents($m);
        $sql = preg_replace('/^\s*--.*$/m', '', $sql);
        foreach (explode(';', $sql) as $stmt) {
            $stmt = trim($stmt);
            if ($stmt === '') continue;
            try { $mpdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
        }
    }

    // sales_category_id 列が存在するか確認（前提条件）
    $cols = $mpdo->query("PRAGMA table_info(vouchers)")->fetchAll();
    $colNames = array_column($cols, 'name');
    assertTrue(in_array('sales_category_id', $colNames, true),
        'sales_category_id column must exist BEFORE migration 012 (precondition)');

    // テスト用得意先 + 売上種別 + 伝票を投入
    $mpdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('MIG-顧客', 'MIG100')");
    $custId = (int)$mpdo->lastInsertId();
    $mpdo->exec("INSERT INTO sales_categories (name, sort_order) VALUES ('テスト種別', 1)");
    $catId = (int)$mpdo->lastInsertId();

    // sales_category_id=999 ではなく、実在する $catId を使う（FK 制約があるため）
    // 指示書の「sales_category_id=999」は値そのものの保全確認なので、$catId を実値として保持されるかを assert
    $mpdo->exec("INSERT INTO vouchers
        (voucher_no, voucher_type, status, customer_id, voucher_date,
         sales_category_id, access_voucher_id)
        VALUES ('MIG-V001', 'sales', 'approved', $custId, '2026-06-01', $catId, 12345)");
    $insertedVoucherId = (int)$mpdo->lastInsertId();

    // migration 012 を適用
    $mig012 = file_get_contents($ROOT . '/migrations/012_vouchers_customer_id_nullable.sql');
    // 注: PRAGMA や BEGIN/COMMIT を含むため、ステートメント分割せず一括で exec する。
    //     SQLite の PDO::exec は複文を実行可能。
    $mpdo->exec($mig012);

    // 適用後: sales_category_id 列が依然として存在し、値も保持されている
    $cols2 = $mpdo->query("PRAGMA table_info(vouchers)")->fetchAll();
    $colNames2 = array_column($cols2, 'name');
    assertTrue(in_array('sales_category_id', $colNames2, true),
        'sales_category_id column must still exist AFTER migration 012');

    $row = $mpdo->query("SELECT sales_category_id, customer_id FROM vouchers WHERE id = $insertedVoucherId")->fetch();
    assertTrue($row !== false, 'voucher row must still exist after migration 012');
    assertEq($catId, (int)$row['sales_category_id'], 'sales_category_id value preserved through migration 012');
    assertEq($custId, (int)$row['customer_id'], 'customer_id value preserved through migration 012');

    // customer_id の NOT NULL 制約が外れているか（migration 012 の主目的）も確認
    $mpdo->exec("INSERT INTO vouchers
        (voucher_no, voucher_type, status, customer_id, voucher_date, access_voucher_id)
        VALUES ('MIG-V002', 'sales', 'approved', NULL, '2026-06-02', 12346)");
    $nullRow = $mpdo->query("SELECT customer_id FROM vouchers WHERE access_voucher_id = 12346")->fetch();
    assertEq(null, $nullRow['customer_id'], 'customer_id=NULL is now allowed (migration 012 main purpose)');

    $mpdo = null;
    @unlink($migDbPath);
});

// ============================================================
// R-050: 売上受信時に projects.customer_id が連動更新されること
// ============================================================
echo "
=== R-050 売上受信時の projects.customer_id 連動更新 ===
";

runTest('R-050-1: 売上受信時 project_access_no と customer_access_no があれば projects.customer_id が更新される', function () use (&$pdo, $projectId) {
    // customer_id を一旦 NULL に近い状態にするため、新しい得意先Cを用意して
    // projects.customer_id を得意先Cに書き換えておく（テスト前の状態を設定）
    $pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('テスト得意先C', '300')");
    $customerCId = (int)$pdo->lastInsertId();
    $pdo->prepare('UPDATE projects SET customer_id = :cid WHERE id = :pid')
        ->execute([':cid' => $customerCId, ':pid' => $projectId]);

    // 売上 sync: project_access_no = projects.id の文字列化, customer_access_no=100 (テスト得意先A)
    $r = runHelperCase('syncVoucherUpsert', $projectId, [
        'access_voucher_id'  => 8001,
        'voucher_type'       => 'sales',
        'customer_access_no' => '100',
        'project_access_no'  => (string)$projectId,
        'voucher_date'       => '2026-06-10',
        'total_amount'       => 50000,
    ]);
    assertEq(200, $r['code'], 'http code');

    // projects.customer_id が得意先A (access_customer_no=100) に更新されていること
    $row = $pdo->query("SELECT customer_id FROM projects WHERE id = $projectId")->fetch();
    $expected = $pdo->query("SELECT id FROM customers WHERE access_customer_no = '100'")->fetchColumn();
    assertEq((int)$expected, (int)$row['customer_id'], 'projects.customer_id が得意先A に更新されること');
});

runTest('R-050-2: customer_access_no が null なら projects.customer_id は変更されない', function () use (&$pdo, $projectId) {
    // 現在の customer_id を記録
    $beforeRow = $pdo->query("SELECT customer_id FROM projects WHERE id = $projectId")->fetch();
    $beforeCustomerId = (int)$beforeRow['customer_id'];

    // 売上 sync: customer_access_no を空にして送る（過去伝票モードと同等）
    // ただし project_id 付きの場合 customer_access_no 空は 400 になるため、
    // project_id=null（過去伝票モード）で実施する
    $r = runHelperCase('syncVoucherUpsert', null, [
        'access_voucher_id'  => 8002,
        'voucher_type'       => 'sales',
        'customer_access_no' => '',
        'project_access_no'  => (string)$projectId,
        'voucher_date'       => '2026-06-10',
        'total_amount'       => 30000,
    ]);
    assertEq(200, $r['code'], 'http code');

    // projects.customer_id は変更されていないこと
    $afterRow = $pdo->query("SELECT customer_id FROM projects WHERE id = $projectId")->fetch();
    assertEq($beforeCustomerId, (int)$afterRow['customer_id'], 'projects.customer_id が変更されないこと');
});

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
