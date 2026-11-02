<?php
/**
 * HTTP 経由の PHP テスト用の共通ハーネス（専用 SQLite + php ビルトインサーバ）。
 * 呼び出し側で $harnessName（ファイル名のもと）と $harnessPort を定義してから require する。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
$testDbPath = __DIR__ . '/' . $harnessName . '_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) unlink($testDbPath);
register_shutdown_function(function () use ($testDbPath) {
    if (file_exists($testDbPath)) @unlink($testDbPath);
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
    $sql = preg_replace('/^\s*--.*$/m', '', file_get_contents($m));
    foreach (explode(';', $sql) as $stmt) {
        $stmt = trim($stmt);
        if ($stmt === '') continue;
        try { $pdo->exec($stmt); } catch (Throwable $_) { /* 重複系は無視 */ }
    }
}
$pdo->exec("INSERT OR IGNORE INTO tax_rates (rate, valid_from) VALUES (0.10, '2019-10-01')");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('estimate', 0)");
$pdo->exec("INSERT OR IGNORE INTO sequences (key, last_no) VALUES ('sales', 0)");

$passed = 0; $failed = 0; $failures = [];
function runTest(string $name, callable $fn): void {
    global $passed, $failed, $failures;
    try { $fn(); echo "  [OK] $name\n"; $passed++; }
    catch (Throwable $e) { echo "  [NG] $name :: " . $e->getMessage() . "\n"; $failed++; $failures[] = $name . ': ' . $e->getMessage(); }
}
function assertEq($expected, $actual, string $label = ''): void {
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf('%s expected=%s actual=%s', $label, var_export($expected, true), var_export($actual, true)));
    }
}
function assertTrue(bool $cond, string $label = ''): void {
    if (!$cond) throw new RuntimeException($label . ' (assertTrue failed)');
}

$bootstrap = __DIR__ . '/_' . $harnessName . '_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\n");
$port = $harnessPort;
$serverProc = proc_open(
    ['php', '-d', 'auto_prepend_file=' . $bootstrap, '-S', "127.0.0.1:$port", '-t', $ROOT, $ROOT . '/index.php'],
    [0 => ['pipe', 'r'], 1 => ['file', 'NUL', 'w'], 2 => ['file', 'NUL', 'w']],
    $serverPipes,
    $ROOT
);
if (!is_resource($serverProc)) { @unlink($bootstrap); throw new RuntimeException('php ビルトインサーバを起動できませんでした'); }
$ready = false;
for ($i = 0; $i < 30; $i++) {
    usleep(200000);
    $ctx = stream_context_create(['http' => ['timeout' => 0.5, 'ignore_errors' => true]]);
    if (@file_get_contents("http://127.0.0.1:$port/contents/Beaver/api/health", false, $ctx) !== false) { $ready = true; break; }
}

function httpJson(int $port, string $path, string $method, ?array $body = null): array {
    $opts = ['method' => $method, 'header' => "Content-Type: application/json\r\nConnection: close\r\n", 'timeout' => 5, 'ignore_errors' => true];
    if ($body !== null) $opts['content'] = json_encode($body, JSON_UNESCAPED_UNICODE);
    $ctx = stream_context_create(['http' => $opts]);
    $raw = false; $hdr = [];
    for ($t = 0; $t < 3 && $raw === false; $t++) {
        if ($t > 0) usleep(200000);
        $raw = @file_get_contents("http://127.0.0.1:$port/contents/Beaver/api$path", false, $ctx);
        if (isset($http_response_header)) $hdr = $http_response_header;
    }
    return ['status' => $hdr[0] ?? '', 'body' => json_decode((string)$raw, true)];
}

function harnessFinish(): void {
    global $passed, $failed, $failures, $serverProc, $serverPipes, $bootstrap;
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
    echo "\n========================================\nPASSED: $passed\nFAILED: $failed\n";
    if ($failed > 0) {
        echo "----- failures -----\n";
        foreach ($failures as $f) echo " - $f\n";
        exit(1);
    }
    exit(0);
}
