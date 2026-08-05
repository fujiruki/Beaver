<?php
/**
 * Beaver R-0080 feedback API 単体・統合テスト
 *
 * 起動: php api/tests/test_feedback.php
 *
 * - php ビルトインサーバを起動し、POST /feedback（multipart/form-data）と
 *   GET /admin/feedback（X-Admin-Token認証）を実HTTPリクエストで検証する
 * - 専用 SQLite DB（schema.sql + 全migration適用）を使って既存環境に影響しない
 * - アップロード先も専用の一時ディレクトリに向け、api/uploads/feedback/ を汚さない
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_feedback.sqlite';
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

function assertTrue($cond, string $label = ''): void {
    if (!$cond) {
        throw new RuntimeException($label !== '' ? $label : 'assertion failed');
    }
}

function rrmdir(string $dir): void {
    if (!is_dir($dir)) return;
    $items = scandir($dir);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        $path = $dir . '/' . $item;
        is_dir($path) ? rrmdir($path) : unlink($path);
    }
    rmdir($dir);
}

// ============================================================
// multipart/form-data ボディ組み立て（curl拡張なしでファイル送信するため）
// ============================================================
function buildMultipartBody(array $fields, array $files): array {
    $boundary = '----BeaverTestBoundary' . bin2hex(random_bytes(8));
    $body = '';
    foreach ($fields as $name => $value) {
        $body .= "--$boundary\r\n";
        $body .= "Content-Disposition: form-data; name=\"$name\"\r\n\r\n";
        $body .= $value . "\r\n";
    }
    foreach ($files as $file) {
        $body .= "--$boundary\r\n";
        $body .= "Content-Disposition: form-data; name=\"images[]\"; filename=\"{$file['filename']}\"\r\n";
        $body .= "Content-Type: {$file['type']}\r\n\r\n";
        $body .= $file['content'] . "\r\n";
    }
    $body .= "--$boundary--\r\n";
    return [$boundary, $body];
}

function postFeedback(int $port, array $fields, array $files = []): array {
    [$boundary, $body] = buildMultipartBody($fields, $files);
    $ctx = stream_context_create(['http' => [
        'method'        => 'POST',
        'header'        => "Content-Type: multipart/form-data; boundary=$boundary\r\nConnection: close\r\n",
        'content'       => $body,
        'timeout'       => 5,
        'ignore_errors' => true,
    ]]);
    $respBody = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/feedback", false, $ctx);
    $status = $http_response_header[0] ?? '';
    return ['status' => $status, 'body' => (string)$respBody];
}

function getAdminFeedback(int $port, ?string $token): array {
    $header = "Connection: close\r\n";
    if ($token !== null) $header .= "X-Admin-Token: $token\r\n";
    $ctx = stream_context_create(['http' => [
        'header'        => $header,
        'timeout'       => 5,
        'ignore_errors' => true,
    ]]);
    $body = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/admin/feedback", false, $ctx);
    $status = $http_response_header[0] ?? '';
    return ['status' => $status, 'body' => (string)$body];
}

// ============================================================
// php ビルトインサーバ起動（DB_PATH / ADMIN_FEEDBACK_TOKEN / FEEDBACK_UPLOAD_DIR を上書き）
// ============================================================
$testUploadDir = __DIR__ . '/tmp_feedback_uploads';
if (is_dir($testUploadDir)) rrmdir($testUploadDir);
mkdir($testUploadDir, 0755, true);

const TEST_ADMIN_TOKEN = 'test-feedback-token-12345';

$bootstrap = __DIR__ . '/_server_bootstrap.php';
file_put_contents($bootstrap, "<?php\n"
    . "define('DB_PATH', " . var_export($testDbPath, true) . ");\n"
    . "define('ADMIN_FEEDBACK_TOKEN', " . var_export(TEST_ADMIN_TOKEN, true) . ");\n"
    . "define('FEEDBACK_UPLOAD_DIR', " . var_export($testUploadDir . '/', true) . ");\n"
);

$port = 18084;
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

    echo "=== R-0080 feedback API テスト ===\n\n";

    runTest('T-01: 画像なしでPOST /feedback が成功する', function () use ($port, $testDbPath) {
        $res = postFeedback($port, ['message' => '画面が固まる', 'page_path' => '/projects/1']);
        assertTrue(str_contains($res['status'], '201'), 'expected 201 got: ' . $res['status'] . ' body=' . $res['body']);
        $data = json_decode($res['body'], true);
        assertEq('画面が固まる', $data['message'], 'message');
        assertEq('/projects/1', $data['page_path'], 'page_path');
        assertEq([], $data['image_paths'], 'image_paths は空配列');

        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $row = $tmpPdo->query("SELECT * FROM feedback WHERE id = {$data['id']}")->fetch();
        assertTrue($row !== false, 'feedbackテーブルに保存されている');
        assertEq('画面が固まる', $row['message'], 'DB message');
    });

    runTest('T-02: 画像複数枚でPOSTするとfeedback_imagesに保存される', function () use ($port, $testDbPath) {
        $files = [
            ['filename' => 'a.png', 'type' => 'image/png', 'content' => 'FAKE_PNG_BYTES_1'],
            ['filename' => 'b.jpg', 'type' => 'image/jpeg', 'content' => 'FAKE_JPG_BYTES_2'],
        ];
        $res = postFeedback($port, ['message' => '画像添付テスト'], $files);
        assertTrue(str_contains($res['status'], '201'), 'expected 201 got: ' . $res['status'] . ' body=' . $res['body']);
        $data = json_decode($res['body'], true);
        assertEq(2, count($data['image_paths']), 'image_paths件数');

        $tmpPdo = new PDO('sqlite:' . $testDbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $imgs = $tmpPdo->query("SELECT * FROM feedback_images WHERE feedback_id = {$data['id']} ORDER BY display_order")->fetchAll();
        assertEq(2, count($imgs), 'feedback_images件数');
        assertTrue(str_contains($imgs[0]['file_name'], 'a.png'), 'ファイル名にa.pngが含まれる');
        assertTrue(str_contains($imgs[1]['file_name'], 'b.jpg'), 'ファイル名にb.jpgが含まれる');

        // 実ファイルが保存されている
        $savedPath = __DIR__ . '/tmp_feedback_uploads/' . $data['id'] . '/' . $imgs[0]['file_name'];
        assertTrue(file_exists($savedPath), '画像ファイルが実際に保存されている: ' . $savedPath);
        assertEq('FAKE_PNG_BYTES_1', file_get_contents($savedPath), '保存された画像の内容が一致する');
    });

    runTest('T-03: 画像6枚でPOSTするとエラーになる', function () use ($port) {
        $files = [];
        for ($i = 1; $i <= 6; $i++) {
            $files[] = ['filename' => "img$i.png", 'type' => 'image/png', 'content' => "DATA$i"];
        }
        $res = postFeedback($port, ['message' => '6枚添付'], $files);
        assertTrue(str_contains($res['status'], '400'), 'expected 400 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('T-04: 本文なしでPOSTするとエラーになる', function () use ($port) {
        $res = postFeedback($port, ['message' => '']);
        assertTrue(str_contains($res['status'], '400'), 'expected 400 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('T-05: 許可されていない拡張子の画像はエラーになる', function () use ($port) {
        $files = [['filename' => 'evil.exe', 'type' => 'application/octet-stream', 'content' => 'MZ...']];
        $res = postFeedback($port, ['message' => '不正拡張子'], $files);
        assertTrue(str_contains($res['status'], '400'), 'expected 400 got: ' . $res['status'] . ' body=' . $res['body']);
    });

    runTest('T-06: GET /admin/feedback は正しいトークンで200・一覧を返す', function () use ($port) {
        $res = getAdminFeedback($port, TEST_ADMIN_TOKEN);
        assertTrue(str_contains($res['status'], '200'), 'expected 200 got: ' . $res['status'] . ' body=' . $res['body']);
        $data = json_decode($res['body'], true);
        assertTrue(is_array($data), '配列が返る');
        assertTrue(count($data) >= 2, '登録済みのfeedbackが2件以上返る（T-01, T-02分）');
        assertTrue(array_key_exists('image_paths', $data[0]), '各要望にimage_pathsが含まれる');
    });

    runTest('T-07: GET /admin/feedback はトークン不一致で401', function () use ($port) {
        $res = getAdminFeedback($port, 'wrong-token');
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status']);
    });

    runTest('T-08: GET /admin/feedback はトークンなしで401', function () use ($port) {
        $res = getAdminFeedback($port, null);
        assertTrue(str_contains($res['status'], '401'), 'expected 401 got: ' . $res['status']);
    });

} finally {
    if (is_resource($serverProc)) {
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
    if (is_dir($testUploadDir)) rrmdir($testUploadDir);
}

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
