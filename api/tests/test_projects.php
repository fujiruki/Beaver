<?php
/**
 * Beaver R-071 projects API 単体テスト
 *
 * 起動: php api/tests/test_projects.php
 *
 * - projects.php の POST/PUT ロジック（routes/projects.php と同一SQL）を
 *   PDO 直接呼び出しで検証する
 * - 専用 SQLite DB（schema.sql + 全migration適用）を使って既存環境に影響しない
 * - R-071: 案件の保存が常に失敗する（projectsテーブルに order_date/owner_name/
 *   general_contractor_name/site_contact カラムが無いのに、フロントエンドとAPIの
 *   INSERT/UPDATE文がこれらを常時参照するため、SQLエラーで保存が全滅していた）
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_projects.sqlite';
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

// テスト用得意先を1件用意（customer_id NOT NULL 制約のため）
$pdo->exec("INSERT INTO customers (id, name, honorific_type) VALUES (1, 'テスト得意先', '御中')");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");

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

/**
 * projects.php の POST ロジックをインライン実行（routes/projects.php と同一SQL）。
 */
function projectPost(PDO $pdo, array $data): array {
    $pdo->prepare('UPDATE sequences SET last_no = last_no + 1 WHERE key = "project"')->execute();
    $row = $pdo->query('SELECT last_no FROM sequences WHERE key = "project"')->fetch();
    $code = 'P' . str_pad((string)$row['last_no'], 5, '0', STR_PAD_LEFT);

    $stmt = $pdo->prepare('
        INSERT INTO projects (project_code, customer_id, name, description, status, start_date, end_date, delivery_date, address, memo, order_date, owner_name, general_contractor_name, site_contact)
        VALUES (:project_code, :customer_id, :name, :description, :status, :start_date, :end_date, :delivery_date, :address, :memo, :order_date, :owner_name, :general_contractor_name, :site_contact)
    ');
    $stmt->execute([
        ':project_code'              => $code,
        ':customer_id'               => $data['customer_id'] ?? null,
        ':name'                      => $data['name'] ?? '',
        ':description'               => $data['description'] ?? null,
        ':status'                    => $data['status'] ?? '問い合わせ',
        ':start_date'                => $data['start_date'] ?? null,
        ':end_date'                  => $data['end_date'] ?? null,
        ':delivery_date'             => $data['delivery_date'] ?? null,
        ':address'                   => $data['address'] ?? null,
        ':memo'                      => $data['memo'] ?? null,
        ':order_date'                => $data['order_date'] ?? null,
        ':owner_name'                => $data['owner_name'] ?? null,
        ':general_contractor_name'   => $data['general_contractor_name'] ?? null,
        ':site_contact'              => $data['site_contact'] ?? null,
    ]);
    $id = $pdo->lastInsertId();
    $stmt2 = $pdo->prepare('SELECT * FROM projects WHERE id = ?');
    $stmt2->execute([$id]);
    return ['code' => 201, 'body' => $stmt2->fetch()];
}

/**
 * projects.php の PUT ロジックをインライン実行（routes/projects.php と同一SQL）。
 */
function projectPut(PDO $pdo, int $resourceId, array $data): array {
    $fields = ['customer_id','name','description','status','start_date','end_date','delivery_date','address','memo','order_date','owner_name','general_contractor_name','site_contact'];
    $sets = []; $params = [];
    foreach ($fields as $f) {
        if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
    }
    if (empty($sets)) {
        return ['code' => 400, 'body' => ['error' => 'No fields']];
    }
    $sets[] = 'updated_at = CURRENT_TIMESTAMP';
    $params[':id'] = $resourceId;
    $pdo->prepare('UPDATE projects SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    $stmt = $pdo->prepare('SELECT * FROM projects WHERE id = ?');
    $stmt->execute([$resourceId]);
    return ['code' => 200, 'body' => $stmt->fetch()];
}

/**
 * projects.php の DELETE ロジックをインライン実行（routes/projects.php と同一SQL、R-0085でcancelled→キャンセルに修正）。
 */
function projectDelete(PDO $pdo, int $resourceId): array {
    $pdo->prepare('UPDATE projects SET status = "キャンセル", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        ->execute([$resourceId]);
    return ['code' => 200, 'body' => ['cancelled' => true]];
}

/**
 * projects.php GET一覧（page指定・status列ソート）のロジックをインライン実行。
 * R-0085: project_statuses を LEFT JOIN した sort_order 順にソートされることを検証するため、
 * routes/projects.php の該当SQL（LEFT JOIN + ホワイトリスト 'status' => 'ps.sort_order'）と同一の構成にする。
 */
function projectListSortedByStatus(PDO $pdo, string $order): array {
    require_once dirname(__DIR__) . '/routes/list_helpers.php';
    $_GET = ['sort' => 'status', 'order' => $order];
    $sortClause = resolveSortClause(
        [
            'project_code'  => 'p.project_code',
            'name'          => 'p.name',
            'customer_name' => 'c.name',
            'status'        => 'ps.sort_order',
            'start_date'    => 'p.start_date',
        ],
        'p.updated_at',
        'p.id',
        'DESC'
    );
    $stmt = $pdo->query("
        SELECT p.*, c.name AS customer_name
        FROM projects p
        LEFT JOIN customers c ON c.id = p.customer_id
        LEFT JOIN project_statuses ps ON ps.name = p.status
        WHERE p.status != 'キャンセル' $sortClause
    ");
    $_GET = [];
    return $stmt->fetchAll();
}

/**
 * R-0091/R-0092: projects.php GET一覧（検索・複合ソート）のロジックをインライン実行。
 * routes/projects.php の該当SQL（buildMultiColumnSearchClause + resolveSortClause）と
 * 同一の構成にする。
 */
function projectListQuery(PDO $pdo, array $getParams): array {
    require_once dirname(__DIR__) . '/routes/list_helpers.php';
    require_once dirname(__DIR__) . '/search_helpers.php';

    $_GET = $getParams;
    $where = 'WHERE p.status != "キャンセル"';
    $params = [];
    if (!empty($_GET['q'])) {
        [$searchClause, $searchParams] = buildMultiColumnSearchClause(
            ['p.project_code', 'p.name', 'c.name'],
            $_GET['q']
        );
        $where .= ' AND ' . $searchClause;
        $params = array_merge($params, $searchParams);
    }
    $sortClause = resolveSortClause(
        [
            'project_code'  => 'p.project_code',
            'name'          => 'p.name',
            'customer_name' => 'c.name',
            'status'        => 'ps.sort_order',
            'start_date'    => 'p.start_date',
            'delivery_date' => 'p.delivery_date',
        ],
        'p.updated_at',
        'p.id',
        'DESC'
    );
    $stmt = $pdo->prepare("
        SELECT p.*, c.name AS customer_name
        FROM projects p
        LEFT JOIN customers c ON c.id = p.customer_id
        LEFT JOIN project_statuses ps ON ps.name = p.status
        $where $sortClause
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $_GET = [];
    return $rows;
}

/**
 * R-0093: projects.php GET一覧（q + page 同時指定、COUNTクエリ）のロジックをインライン実行。
 * routes/projects.php の該当SQL（COUNTクエリに customers への LEFT JOIN を含む）と
 * 同一の構成にする。
 */
function projectListPage(PDO $pdo, array $getParams): array {
    require_once dirname(__DIR__) . '/routes/list_helpers.php';
    require_once dirname(__DIR__) . '/search_helpers.php';

    $_GET = $getParams;
    $where = 'WHERE p.status != "キャンセル"';
    $params = [];
    if (!empty($_GET['q'])) {
        [$searchClause, $searchParams] = buildMultiColumnSearchClause(
            ['p.project_code', 'p.name', 'c.name'],
            $_GET['q']
        );
        $where .= ' AND ' . $searchClause;
        $params = array_merge($params, $searchParams);
    }
    $page    = max(1, (int)$_GET['page']);
    $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
    $offset  = ($page - 1) * $perPage;
    $cntStmt = $pdo->prepare("SELECT COUNT(*) FROM projects p LEFT JOIN customers c ON c.id = p.customer_id $where");
    $cntStmt->execute($params);
    $total = (int)$cntStmt->fetchColumn();
    $sortClause = resolveSortClause(
        [
            'project_code'  => 'p.project_code',
            'name'          => 'p.name',
            'customer_name' => 'c.name',
            'status'        => 'ps.sort_order',
            'start_date'    => 'p.start_date',
            'delivery_date' => 'p.delivery_date',
        ],
        'p.updated_at',
        'p.id',
        'DESC'
    );
    $stmt = $pdo->prepare("
        SELECT p.*, c.name AS customer_name
        FROM projects p
        LEFT JOIN customers c ON c.id = p.customer_id
        LEFT JOIN project_statuses ps ON ps.name = p.status
        $where $sortClause LIMIT $perPage OFFSET $offset
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $_GET = [];
    return [
        'data' => $rows,
        'meta' => ['total' => $total, 'page' => $page, 'per_page' => $perPage, 'last_page' => (int)ceil($total / $perPage)],
    ];
}

// ============================================================
// テスト本体
// ============================================================
echo "=== R-071 projects API テスト ===\n\n";

// T-01: フロントエンドが常時送るフルフィールド（order_date等含む）でPOST新規作成できる
runTest('T-01: order_date/owner_name/general_contractor_name/site_contact を含むPOSTで新規作成できる', function () use ($pdo) {
    $res = projectPost($pdo, [
        'customer_id'              => 1,
        'name'                     => '新築案件A',
        'description'              => null,
        'status'                   => '問い合わせ',
        'start_date'               => null,
        'end_date'                 => null,
        'delivery_date'            => null,
        'address'                  => null,
        'memo'                     => null,
        'order_date'               => '2026-07-01',
        'owner_name'               => '施主太郎',
        'general_contractor_name'  => '元請建設',
        'site_contact'             => '090-0000-0000',
    ]);
    assertEq(201, $res['code'], 'HTTP status');
    assertEq('施主太郎', $res['body']['owner_name'], 'owner_name が保存されている');
    assertEq('元請建設', $res['body']['general_contractor_name'], 'general_contractor_name が保存されている');
    assertEq('090-0000-0000', $res['body']['site_contact'], 'site_contact が保存されている');
    assertEq('2026-07-01', $res['body']['order_date'], 'order_date が保存されている');
});

// T-02: 同フィールドを含むPUTで更新できる（R-071の本体: 保存ボタンが機能しない）
runTest('T-02: order_date等を含むPUTで更新できる（保存ボタンが機能しない問題の再現）', function () use ($pdo) {
    $created = projectPost($pdo, ['customer_id' => 1, 'name' => '既存案件B']);
    $id = (int)$created['body']['id'];

    $res = projectPut($pdo, $id, [
        'customer_id'              => 1,
        'name'                     => '既存案件B（更新後）',
        'description'              => null,
        'status'                   => '進行中',
        'start_date'               => null,
        'end_date'                 => null,
        'delivery_date'            => null,
        'address'                  => null,
        'memo'                     => '更新後メモ',
        'order_date'               => null,
        'owner_name'               => null,
        'general_contractor_name'  => null,
        'site_contact'             => null,
    ]);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq('既存案件B（更新後）', $res['body']['name'], 'name が更新されている');
    assertEq('更新後メモ', $res['body']['memo'], 'memo が更新されている');
});

// T-03: DELETE（論理キャンセル）はstatusを日本語の'キャンセル'にする（R-0085: 'cancelled'英語バグの修正確認）
runTest('T-03: DELETEはstatusを"キャンセル"（日本語）にする', function () use ($pdo) {
    $created = projectPost($pdo, ['customer_id' => 1, 'name' => '削除対象案件']);
    $id = (int)$created['body']['id'];

    $res = projectDelete($pdo, $id);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq(true, $res['body']['cancelled'], 'cancelledフラグ');

    $stmt = $pdo->prepare('SELECT status FROM projects WHERE id = ?');
    $stmt->execute([$id]);
    assertEq('キャンセル', $stmt->fetchColumn(), 'statusが日本語のキャンセルになっている');
});

// T-04: 一覧のstatusソートは project_statuses.sort_order 順（工程順）になる（R-0085）
runTest('T-04: status列でソートすると工程順（sort_order順）に並ぶ', function () use ($pdo) {
    $pdo->exec("DELETE FROM projects WHERE project_code LIKE 'PS%'");
    $pdo->exec("UPDATE sequences SET last_no = last_no WHERE key = 'project'");
    // 文字コード順とsort_order順が食い違うように status を選ぶ
    // （'完了' < '見積済' < '進行中' は文字コード順だと工程順と一致しないため、これが崩れていないことを確認できる）
    $statuses = ['完了', '見積済', '進行中'];
    foreach ($statuses as $i => $status) {
        $pdo->exec("
            INSERT INTO projects (project_code, customer_id, name, status)
            VALUES ('PS00" . ($i + 1) . "', 1, 'ソート確認案件" . ($i + 1) . "', '$status')
        ");
    }

    $rows = projectListSortedByStatus($pdo, 'asc');
    $filtered = array_values(array_filter($rows, fn($r) => str_starts_with((string)$r['project_code'], 'PS')));
    $statusesInOrder = array_column($filtered, 'status');
    assertEq(['見積済', '進行中', '完了'], $statusesInOrder, '工程順（見積済→進行中→完了）に並ぶこと');
});

// T-05: 一覧検索は得意先名でもヒットする（R-0091: 検索対象拡張）
runTest('T-05: 検索キーワードが得意先名に一致する案件もヒットする', function () use ($pdo) {
    $pdo->exec("DELETE FROM customers WHERE name = '検索対象得意先XYZ'");
    $pdo->exec("INSERT INTO customers (name, honorific_type) VALUES ('検索対象得意先XYZ', '御中')");
    $customerId = (int)$pdo->lastInsertId();
    $pdo->exec("DELETE FROM projects WHERE project_code LIKE 'PQ%'");
    $pdo->exec("
        INSERT INTO projects (project_code, customer_id, name, status)
        VALUES ('PQ001', $customerId, '検索キーワードを含まない案件名', '進行中')
    ");

    $rows = projectListQuery($pdo, ['q' => 'XYZ']);
    $filtered = array_values(array_filter($rows, fn($r) => str_starts_with((string)$r['project_code'], 'PQ')));
    assertEq(1, count($filtered), '得意先名検索でヒットする件数');
    assertEq('PQ001', $filtered[0]['project_code'], 'ヒットした案件コード');
});

// T-06: status,delivery_date の複合ソート（ステータス優先・納期を第2キー）
runTest('T-06: sort=status,delivery_dateの複合ソートでステータス優先・納期第2キーの順に並ぶ', function () use ($pdo) {
    $pdo->exec("DELETE FROM projects WHERE project_code LIKE 'PM%'");
    $rows = [
        ['PM001', '進行中', '2026-02-02'],
        ['PM002', '進行中', '2026-01-01'],
        ['PM003', '見積済', '2026-03-03'],
    ];
    foreach ($rows as [$code, $status, $delivery]) {
        $pdo->exec("
            INSERT INTO projects (project_code, customer_id, name, status, delivery_date)
            VALUES ('$code', 1, '複合ソート確認案件', '$status', '$delivery')
        ");
    }

    $result = projectListQuery($pdo, ['sort' => 'status,delivery_date', 'order' => 'asc,asc']);
    $filtered = array_values(array_filter($result, fn($r) => str_starts_with((string)$r['project_code'], 'PM')));
    $codes = array_column($filtered, 'project_code');
    // 見積済(sort_order=2)が最優先、進行中(sort_order=4)同士は納期昇順（01-01→02-02）
    assertEq(['PM003', 'PM002', 'PM001'], $codes, 'ステータス優先・納期昇順の順序');
});

// T-07: q + page 同時指定でも500エラーにならず正しい件数が返る（R-0093: COUNTクエリにcustomers JOIN漏れのバグ再現）
runTest('T-07: q（検索）+ page（ページネーション）同時指定でSQLエラーにならず正しい件数が返る', function () use ($pdo) {
    $pdo->exec("DELETE FROM customers WHERE name = '検索対象得意先ABC'");
    $pdo->exec("INSERT INTO customers (name, honorific_type) VALUES ('検索対象得意先ABC', '御中')");
    $customerId = (int)$pdo->lastInsertId();
    $pdo->exec("DELETE FROM projects WHERE project_code LIKE 'PR%'");
    $pdo->exec("
        INSERT INTO projects (project_code, customer_id, name, status)
        VALUES ('PR001', $customerId, '検索キーワードを含まない案件名', '進行中')
    ");

    $result = projectListPage($pdo, ['q' => 'ABC', 'page' => '1']);
    $filtered = array_values(array_filter($result['data'], fn($r) => str_starts_with((string)$r['project_code'], 'PR')));
    assertEq(1, count($filtered), '得意先名検索×ページネーションでヒットする件数');
    assertEq(1, $result['meta']['total'] >= 1 ? 1 : 0, 'meta.totalが取得できている（COUNTクエリがSQLエラーにならない）');
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
