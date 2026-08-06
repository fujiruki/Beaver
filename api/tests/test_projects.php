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
require_once $ROOT . '/routes/project_delete_helpers.php';

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
        INSERT INTO projects (project_code, customer_id, name, description, status, start_date, end_date, delivery_date, address, memo, order_date, owner_name, general_contractor_name, site_contact, manual_estimated_hours)
        VALUES (:project_code, :customer_id, :name, :description, :status, :start_date, :end_date, :delivery_date, :address, :memo, :order_date, :owner_name, :general_contractor_name, :site_contact, :manual_estimated_hours)
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
        ':manual_estimated_hours'    => $data['manual_estimated_hours'] ?? null,
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
    $fields = ['customer_id','name','description','status','start_date','end_date','delivery_date','address','memo','order_date','owner_name','general_contractor_name','site_contact','manual_estimated_hours'];
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
 * R-0097: projects.php GET詳細（伝票工数集計 + effective_estimated_hours）のロジックをインライン実行。
 * routes/projects.php の該当SQL・list_helpers.php の effectiveEstimatedHours() と同一の構成にする。
 */
function projectGetDetail(PDO $pdo, int $resourceId): array {
    require_once dirname(__DIR__) . '/routes/list_helpers.php';

    $stmt = $pdo->prepare('SELECT p.*, c.name AS customer_name FROM projects p LEFT JOIN customers c ON c.id = p.customer_id WHERE p.id = ?');
    $stmt->execute([$resourceId]);
    $row = $stmt->fetch();
    if (!$row) return ['code' => 404, 'body' => ['error' => 'Not found']];

    $stmt3 = $pdo->prepare('
        SELECT
            COALESCE(SUM(vl.cost_factory_hours * vl.quantity), 0) AS total_factory_hours,
            COALESCE(SUM(vl.cost_site_hours    * vl.quantity), 0) AS total_site_hours
        FROM voucher_lines vl
        JOIN vouchers v ON v.id = vl.voucher_id
        WHERE v.project_id = ? AND v.voucher_type = "estimate" AND v.status != "void"
    ');
    $stmt3->execute([$resourceId]);
    $hours = $stmt3->fetch();
    $row['estimated_factory_hours'] = round((float)$hours['total_factory_hours'], 2);
    $row['estimated_site_hours']    = round((float)$hours['total_site_hours'], 2);
    $sumHours = $row['estimated_factory_hours'] + $row['estimated_site_hours'];
    $row['effective_estimated_hours'] = effectiveEstimatedHours($sumHours, $row['manual_estimated_hours']);

    return ['code' => 200, 'body' => $row];
}

/**
 * R-0097: projects.php GET一覧（ページング + effective_estimated_hours付与）のロジックをインライン実行。
 */
function projectListWithHours(PDO $pdo, array $getParams): array {
    require_once dirname(__DIR__) . '/routes/list_helpers.php';
    require_once dirname(__DIR__) . '/search_helpers.php';

    $_GET = $getParams;
    $where = 'WHERE p.status != "キャンセル"';
    $params = [];
    if (!empty($_GET['q'])) {
        [$searchClause, $searchParams] = buildMultiColumnSearchClause(['p.project_code', 'p.name', 'c.name'], $_GET['q']);
        $where .= ' AND ' . $searchClause;
        $params = array_merge($params, $searchParams);
    }
    $page    = max(1, (int)($_GET['page'] ?? 1));
    $perPage = min(200, max(10, (int)($_GET['per_page'] ?? 50)));
    $offset  = ($page - 1) * $perPage;
    $stmt = $pdo->prepare("
        SELECT p.*, c.name AS customer_name
        FROM projects p
        LEFT JOIN customers c ON c.id = p.customer_id
        $where ORDER BY p.updated_at DESC LIMIT $perPage OFFSET $offset
    ");
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $_GET = [];

    $ids = array_column($rows, 'id');
    $hoursMap = fetchEstimatedHoursByProjectIds($pdo, $ids);
    foreach ($rows as &$row) {
        $sumHours = $hoursMap[(int)$row['id']] ?? 0;
        $row['effective_estimated_hours'] = effectiveEstimatedHours($sumHours, $row['manual_estimated_hours']);
    }
    unset($row);
    return $rows;
}

/** テスト用: 案件に紐づく見積伝票+明細1行を作成し、voucher_idを返す */
function insertEstimateVoucherWithLine(PDO $pdo, int $projectId, int $customerId, float $factoryHours, float $siteHours): int {
    static $seq = 0;
    $seq++;
    $pdo->prepare("
        INSERT INTO vouchers (voucher_no, voucher_type, status, project_id, customer_id, voucher_date)
        VALUES (?, 'estimate', 'approved', ?, ?, '2026-08-01')
    ")->execute(["TESTV{$seq}", $projectId, $customerId]);
    $voucherId = (int)$pdo->lastInsertId();
    $pdo->prepare("
        INSERT INTO voucher_lines (voucher_id, line_no, quantity, cost_factory_hours, cost_site_hours)
        VALUES (?, 1, 1, ?, ?)
    ")->execute([$voucherId, $factoryHours, $siteHours]);
    return $voucherId;
}

/** テスト用: 請求書を作成し voucher_id を紐づける（invoice_vouchers） */
function linkVoucherToInvoice(PDO $pdo, int $voucherId, int $customerId): int {
    static $seq = 0;
    $seq++;
    $pdo->prepare("
        INSERT INTO invoices (invoice_no, customer_id, invoice_date, cutoff_date, billing_date)
        VALUES (?, ?, '2026-08-05', '2026-08-05', '2026-08-10')
    ")->execute(["TESTI{$seq}", $customerId]);
    $invoiceId = (int)$pdo->lastInsertId();
    $pdo->prepare('INSERT INTO invoice_vouchers (invoice_id, voucher_id) VALUES (?, ?)')->execute([$invoiceId, $voucherId]);
    return $invoiceId;
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

// T-08: 完全削除（hard delete）: 請求書に紐づく伝票がある案件は409で拒否される（R-0095）
runTest('T-08: 請求書に紐づく伝票がある案件の完全削除は409で拒否される', function () use ($pdo) {
    $created = projectPost($pdo, ['customer_id' => 1, 'name' => '請求書紐づき案件']);
    $id = (int)$created['body']['id'];
    $voucherId = insertEstimateVoucherWithLine($pdo, $id, 1, 10, 5);
    linkVoucherToInvoice($pdo, $voucherId, 1);

    $res = hardDeleteProject($pdo, $id);
    assertEq(409, $res['code'], 'HTTP status');
    assertEq('請求書に紐づく伝票があるため完全削除できません', $res['body']['error'], 'エラーメッセージ');

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE id = ?');
    $stmt->execute([$id]);
    assertEq(1, (int)$stmt->fetchColumn(), '案件は削除されず残っている');
});

// T-09: 完全削除: 請求書に紐づかない案件は伝票・明細・案件本体が全て削除される（R-0095）
runTest('T-09: 請求書に紐づかない案件は伝票・明細・案件本体が完全に削除される', function () use ($pdo) {
    $created = projectPost($pdo, ['customer_id' => 1, 'name' => '完全削除対象案件']);
    $id = (int)$created['body']['id'];
    $voucherId = insertEstimateVoucherWithLine($pdo, $id, 1, 10, 5);

    $res = hardDeleteProject($pdo, $id);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq(true, $res['body']['deleted'], 'deletedフラグ');

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE id = ?');
    $stmt->execute([$id]);
    assertEq(0, (int)$stmt->fetchColumn(), '案件が削除されている');

    $stmt2 = $pdo->prepare('SELECT COUNT(*) FROM vouchers WHERE id = ?');
    $stmt2->execute([$voucherId]);
    assertEq(0, (int)$stmt2->fetchColumn(), '伝票が削除されている');

    $stmt3 = $pdo->prepare('SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = ?');
    $stmt3->execute([$voucherId]);
    assertEq(0, (int)$stmt3->fetchColumn(), '伝票明細が削除されている');
});

// T-10: manual_estimated_hours をPOST/PUTで保存できる（R-0097）
runTest('T-10: manual_estimated_hoursをPOST/PUTで保存できる', function () use ($pdo) {
    $created = projectPost($pdo, ['customer_id' => 1, 'name' => '工数目安案件', 'manual_estimated_hours' => 4.5]);
    assertEq(4.5, (float)$created['body']['manual_estimated_hours'], 'POSTで保存された工数目安');

    $id = (int)$created['body']['id'];
    $updated = projectPut($pdo, $id, ['manual_estimated_hours' => 8.0]);
    assertEq(8.0, (float)$updated['body']['manual_estimated_hours'], 'PUTで更新された工数目安');
});

// T-11: 案件詳細: 見積伝票集計工数(>0)がある場合はeffective_estimated_hoursがその合計になる（R-0097）
runTest('T-11: 見積伝票の集計工数があればeffective_estimated_hoursはその合計になる', function () use ($pdo) {
    $created = projectPost($pdo, ['customer_id' => 1, 'name' => '伝票集計優先案件', 'manual_estimated_hours' => 100]);
    $id = (int)$created['body']['id'];
    insertEstimateVoucherWithLine($pdo, $id, 1, 6, 2);

    $res = projectGetDetail($pdo, $id);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq(8.0, (float)$res['body']['effective_estimated_hours'], '伝票集計(6+2)が手動入力より優先される');
});

// T-12: 案件詳細: 見積伝票集計工数が0の場合はeffective_estimated_hoursがmanual_estimated_hoursになる（R-0097）
runTest('T-12: 見積伝票が無い場合はeffective_estimated_hoursはmanual_estimated_hoursになる', function () use ($pdo) {
    $created = projectPost($pdo, ['customer_id' => 1, 'name' => '手動入力フォールバック案件', 'manual_estimated_hours' => 12.5]);
    $id = (int)$created['body']['id'];

    $res = projectGetDetail($pdo, $id);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq(12.5, (float)$res['body']['effective_estimated_hours'], '手動入力工数がそのまま使われる');
});

// T-13: 案件一覧: 各行にeffective_estimated_hoursが含まれる（伝票集計優先・フォールバック手動入力）（R-0097）
runTest('T-13: 案件一覧の各行にeffective_estimated_hoursが含まれる', function () use ($pdo) {
    $pdo->exec("DELETE FROM projects WHERE project_code LIKE 'PH%'");
    $withVoucher = projectPost($pdo, ['customer_id' => 1, 'name' => '一覧伝票集計案件', 'manual_estimated_hours' => 999]);
    $withoutVoucher = projectPost($pdo, ['customer_id' => 1, 'name' => '一覧手動入力案件', 'manual_estimated_hours' => 3.5]);
    insertEstimateVoucherWithLine($pdo, (int)$withVoucher['body']['id'], 1, 1, 1);

    $rows = projectListWithHours($pdo, ['per_page' => '200']);
    $rowById = [];
    foreach ($rows as $r) { $rowById[(int)$r['id']] = $r; }

    assertEq(2.0, (float)$rowById[(int)$withVoucher['body']['id']]['effective_estimated_hours'], '伝票集計優先(1+1)');
    assertEq(3.5, (float)$rowById[(int)$withoutVoucher['body']['id']]['effective_estimated_hours'], '手動入力フォールバック');
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
