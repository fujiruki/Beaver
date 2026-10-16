<?php
/** R-0181 ブラウザ書き込みと同期トークンの認証統合テスト */
declare(strict_types=1);

$root = dirname(__DIR__);
$passed = 0;
$failed = 0;

function testCase(string $name, callable $test): void {
    global $passed, $failed;
    try {
        $test();
        echo "  [OK] {$name}\n";
        $passed++;
    } catch (Throwable $e) {
        echo "  [NG] {$name} :: {$e->getMessage()}\n";
        $failed++;
    }
}

function assertStatus(array $response, int $expected): void {
    if (!str_contains($response['status'], " {$expected} ")) {
        throw new RuntimeException("expected {$expected}, got {$response['status']} body={$response['body']}");
    }
}

function postRequest(int $port, string $path, string $body, array $headers = []): array {
    $header = "Connection: close\r\n" . implode('', array_map(fn(string $value) => $value . "\r\n", $headers));
    $context = stream_context_create(['http' => [
        'method' => 'POST', 'header' => $header, 'content' => $body,
        'timeout' => 5, 'ignore_errors' => true,
    ]]);
    $responseBody = @file_get_contents("http://127.0.0.1:{$port}/contents/Beaver/api{$path}", false, $context);
    return ['status' => $http_response_header[0] ?? '', 'body' => (string)$responseBody];
}

function startR0181Server(string $root, string $bootstrap, int $port): mixed {
    $process = proc_open(
        ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:{$port}", '-t', $root, $root . '/index.php'],
        [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
        $pipes,
        $root,
    );
    if (!is_resource($process)) throw new RuntimeException('テストサーバを起動できませんでした');
    for ($i = 0; $i < 30; $i++) {
        usleep(200000);
        if (@file_get_contents("http://127.0.0.1:{$port}/contents/Beaver/api/health") !== false) return $process;
    }
    proc_terminate($process);
    proc_close($process);
    throw new RuntimeException('テストサーバが応答しません');
}

$dbPath = __DIR__ . '/test_r0181_' . getmypid() . '.sqlite';
$bootstrap = __DIR__ . '/_r0181_bootstrap.php';
@unlink($dbPath);
$pdo = new PDO('sqlite:' . $dbPath);
$pdo->exec(file_get_contents($root . '/schema.sql'));
foreach (glob($root . '/migrations/*.sql') ?: [] as $migration) {
    try { $pdo->exec(file_get_contents($migration)); } catch (Throwable) {}
}
$pdo = null;
file_put_contents($bootstrap, "<?php\n"
    . "define('DB_PATH', " . var_export($dbPath, true) . ");\n"
    . "define('AUTH_DRIVER', 'shared');\n"
    . "define('SYNC_TOKEN_REQUIRED', true);\n"
    . "define('SYNC_API_TOKEN', 'r0181-sync-token');\n"
    . "require_once dirname(__DIR__) . '/auth_client.php';\n"
    . "auth_configure(['verifier' => fn(string \$token): ?array => \$token === 'logged-in' ? ['id' => 1, 'name' => 'テスト利用者'] : null]);\n");

$port = 18181;
$process = null;
try {
    $process = startR0181Server($root, $bootstrap, $port);
    $customer = fn(string $name, array $extra = []) => postRequest($port, '/customers', json_encode(['name' => $name]), array_merge(['Content-Type: application/json'], $extra));

    testCase('同期トークンなしでもログイン済みの得意先登録は201', fn() => assertStatus($customer('ブラウザ登録', ['Cookie: df_session=logged-in']), 201));
    testCase('同期トークンなし・未ログインの得意先登録はloginUrlつき401', function () use ($customer): void {
        $response = $customer('未ログイン登録');
        assertStatus($response, 401);
        $body = json_decode($response['body'], true);
        if (empty($body['loginUrl'])) throw new RuntimeException('loginUrlがありません');
    });
    testCase('正しい同期トークンなら未ログインでも得意先登録は201', fn() => assertStatus($customer('同期登録', ['Authorization: Bearer r0181-sync-token']), 201));
    testCase('誤った同期トークン・未ログインの得意先登録は401', fn() => assertStatus($customer('誤トークン', ['Authorization: Bearer wrong']), 401));

    $feedbackBody = http_build_query(['message' => 'R-0181認証テスト', 'page_path' => '/customers']);
    testCase('同期トークンなしでもログイン済みの改善要望送信は201', fn() => assertStatus(postRequest($port, '/feedback', $feedbackBody, ['Content-Type: application/x-www-form-urlencoded', 'Cookie: df_session=logged-in']), 201));
    testCase('同期トークンなし・未ログインの改善要望送信はloginUrlつき401', function () use ($port, $feedbackBody): void {
        $response = postRequest($port, '/feedback', $feedbackBody, ['Content-Type: application/x-www-form-urlencoded']);
        assertStatus($response, 401);
        $body = json_decode($response['body'], true);
        if (empty($body['loginUrl'])) throw new RuntimeException('loginUrlがありません');
    });
} finally {
    if (is_resource($process)) { proc_terminate($process); proc_close($process); }
    @unlink($bootstrap);
    @unlink($dbPath);
}

echo "\n結果: {$passed} PASS / {$failed} FAIL\n";
exit($failed === 0 ? 0 : 1);
