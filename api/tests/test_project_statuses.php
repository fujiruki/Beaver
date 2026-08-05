<?php
/**
 * Beaver R-0085 project_statuses API 単体テスト
 *
 * 起動: php api/tests/test_project_statuses.php
 *
 * - project_statuses.php の GET/POST/PUT/DELETE ロジック（routes/project_statuses.php と同一SQL）を
 *   PDO 直接呼び出しで検証する
 * - 専用 SQLite DB（schema.sql + 全migration適用）を使って既存環境に影響しない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_project_statuses.sqlite';
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

// テスト用得意先・案件（使用中チェック用）
$pdo->exec("INSERT INTO customers (id, name, honorific_type) VALUES (1, 'テスト得意先', '御中')");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('project', 0)");
$pdo->exec("INSERT INTO projects (project_code, customer_id, name, status) VALUES ('P00001', 1, '使用中案件', '進行中')");

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
 * project_statuses.php の GET ロジックをインライン実行（routes/project_statuses.php と同一SQL）。
 */
function statusList(PDO $pdo, bool $includeInactive = false): array {
    $where = $includeInactive ? '' : 'WHERE is_active = 1';
    $stmt = $pdo->query("SELECT * FROM project_statuses $where ORDER BY sort_order, id");
    return $stmt->fetchAll();
}

/**
 * project_statuses.php の POST ロジックをインライン実行。
 */
function statusCreate(PDO $pdo, array $data): array {
    if (empty($data['name'])) {
        return ['code' => 400, 'body' => ['error' => 'name is required']];
    }
    $maxStmt = $pdo->query('SELECT COALESCE(MAX(sort_order), 0) + 1 FROM project_statuses');
    $sortOrder = (int)$maxStmt->fetchColumn();
    $stmt = $pdo->prepare('INSERT INTO project_statuses (name, sort_order, is_active) VALUES (:name, :sort_order, :is_active)');
    $stmt->execute([
        ':name'       => $data['name'],
        ':sort_order' => $data['sort_order'] ?? $sortOrder,
        ':is_active'  => $data['is_active'] ?? 1,
    ]);
    $id = $pdo->lastInsertId();
    $s = $pdo->prepare('SELECT * FROM project_statuses WHERE id = ?');
    $s->execute([$id]);
    return ['code' => 201, 'body' => $s->fetch()];
}

/**
 * project_statuses.php の PUT ロジックをインライン実行。
 */
function statusUpdate(PDO $pdo, int $id, array $data): array {
    $fields = ['name', 'sort_order', 'is_active'];
    $sets = []; $params = [];
    foreach ($fields as $f) {
        if (array_key_exists($f, $data)) { $sets[] = "$f = :$f"; $params[":$f"] = $data[$f]; }
    }
    if (empty($sets)) {
        return ['code' => 400, 'body' => ['error' => 'No fields']];
    }
    $params[':id'] = $id;
    $pdo->prepare('UPDATE project_statuses SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    $s = $pdo->prepare('SELECT * FROM project_statuses WHERE id = ?');
    $s->execute([$id]);
    return ['code' => 200, 'body' => $s->fetch()];
}

/**
 * project_statuses.php の DELETE ロジックをインライン実行（使用中チェックは projects.status で照合）。
 */
function statusDelete(PDO $pdo, int $id): array {
    $nameStmt = $pdo->prepare('SELECT name FROM project_statuses WHERE id = ?');
    $nameStmt->execute([$id]);
    $name = $nameStmt->fetchColumn();
    if ($name !== false) {
        $checkStmt = $pdo->prepare('SELECT COUNT(*) FROM projects WHERE status = ?');
        $checkStmt->execute([$name]);
        if ((int)$checkStmt->fetchColumn() > 0) {
            return ['code' => 409, 'body' => ['error' => 'このステータスは案件で使用中です']];
        }
    }
    $pdo->prepare('DELETE FROM project_statuses WHERE id = ?')->execute([$id]);
    return ['code' => 200, 'body' => ['deleted' => true]];
}

// ============================================================
// テスト本体
// ============================================================
echo "=== R-0085 project_statuses API テスト ===\n\n";

runTest('T-01: GET一覧はseed済みの8件がsort_order順で返る', function () use ($pdo) {
    $rows = statusList($pdo);
    assertEq(8, count($rows), '件数');
    $names = array_column($rows, 'name');
    assertEq(
        ['問い合わせ', '見積済', '受注済', '進行中', '納品済', '請求済', '完了', 'キャンセル'],
        $names,
        '工程順（sort_order順）'
    );
});

runTest('T-02: POST新規作成は既存最大sort_order+1が自動採番される', function () use ($pdo) {
    $res = statusCreate($pdo, ['name' => '保留']);
    assertEq(201, $res['code'], 'HTTP status');
    assertEq('保留', $res['body']['name'], 'name');
    assertEq(9, (int)$res['body']['sort_order'], 'sort_orderは既存最大(8)+1');
});

runTest('T-03: PUT更新で名前・並び順を変更できる', function () use ($pdo) {
    $created = statusCreate($pdo, ['name' => '一時ステータス']);
    $id = (int)$created['body']['id'];

    $res = statusUpdate($pdo, $id, ['name' => '一時ステータス（改）', 'sort_order' => 3]);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq('一時ステータス（改）', $res['body']['name'], 'name更新');
    assertEq(3, (int)$res['body']['sort_order'], 'sort_order更新');
});

runTest('T-04: DELETEは使用中（projects.statusと一致）なら409で拒否される', function () use ($pdo) {
    // '進行中' は事前投入した案件で使用中
    $row = $pdo->query("SELECT id FROM project_statuses WHERE name = '進行中'")->fetch();
    $res = statusDelete($pdo, (int)$row['id']);
    assertEq(409, $res['code'], 'HTTP status');
});

runTest('T-05: DELETEは未使用のステータスなら削除できる', function () use ($pdo) {
    $created = statusCreate($pdo, ['name' => '削除用ステータス']);
    $id = (int)$created['body']['id'];

    $res = statusDelete($pdo, $id);
    assertEq(200, $res['code'], 'HTTP status');
    assertEq(true, $res['body']['deleted'], 'deletedフラグ');

    $rows = statusList($pdo, true);
    $ids = array_column($rows, 'id');
    assertEq(false, in_array($id, $ids, true), '削除後は一覧に存在しない');
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
