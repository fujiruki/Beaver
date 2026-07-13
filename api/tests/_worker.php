<?php
/**
 * test_sync.php から起動される子プロセス。
 * STDIN から JSON を受け取り、指定された sync_helpers 関数を呼び出して
 * 結果 JSON を STDOUT に書き戻す。
 *
 * readJsonBody() は php://input を読むため、子プロセス側では
 * STDIN を php://input としてシミュレートする必要があるが、
 * CLI では直接フックできないので readJsonBody を上書き定義する戦略で対処する。
 */

declare(strict_types=1);

$raw = stream_get_contents(STDIN);
$req = json_decode($raw, true);
if (!is_array($req)) {
    fwrite(STDOUT, json_encode(['code' => -1, 'error' => 'invalid worker input']));
    exit(1);
}

$dbPath = $req['db']  ?? '';
$func   = $req['func'] ?? '';
$arg1   = $req['arg1'] ?? null;
$body   = $req['body'] ?? null;

if (!file_exists($dbPath)) {
    fwrite(STDOUT, json_encode(['code' => -1, 'error' => "db not found: $dbPath"]));
    exit(1);
}

// readJsonBody を sync_helpers より先に定義してフックする
$GLOBALS['__TEST_BODY'] = is_array($body) ? $body : [];
function readJsonBody(): array {
    return $GLOBALS['__TEST_BODY'];
}

// respond をフックして出力を捕捉する
$GLOBALS['__TEST_RESPONSES'] = [];
function respond(int $code, array $body): void {
    $GLOBALS['__TEST_RESPONSES'][] = ['code' => $code, 'body' => $body];
}

// DB 接続
$pdo = new PDO('sqlite:' . $dbPath, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);
$pdo->exec('PRAGMA foreign_keys=ON');

require_once dirname(__DIR__) . '/routes/sync_helpers.php';

// stderr を捕捉するため tmpfile を error_log の出力先にする
$logFile = tempnam(sys_get_temp_dir(), 'beaver_test_');
ini_set('error_log', $logFile);

try {
    switch ($func) {
        case 'syncVoucherUpsert':
            $projectId = ($arg1 === null) ? null : (int)$arg1;
            syncVoucherUpsert($pdo, $projectId);
            break;
        case 'syncVoucherUpdate':
            syncVoucherUpdate($pdo, (int)$arg1['project_id'], (string)$arg1['voucher_no']);
            break;
        case 'syncVoucherShipped':
            syncVoucherShipped($pdo, (int)$arg1['project_id'], (string)$arg1['voucher_no']);
            break;
        case 'syncVoucherAccessLink':
            syncVoucherAccessLink($pdo, (int)$arg1);
            break;
        case 'syncProjectCustomer':
            syncProjectCustomer($pdo, (int)$arg1);
            break;
        default:
            fwrite(STDOUT, json_encode(['code' => -1, 'error' => "unknown func: $func"]));
            exit(1);
    }
} catch (Throwable $e) {
    fwrite(STDOUT, json_encode([
        'code'  => -1,
        'error' => 'exception: ' . $e->getMessage(),
    ]));
    exit(1);
}

$stderr = file_exists($logFile) ? file_get_contents($logFile) : '';
@unlink($logFile);

$resp = $GLOBALS['__TEST_RESPONSES'][0] ?? ['code' => 0, 'body' => []];
$resp['stderr'] = $stderr;
fwrite(STDOUT, json_encode($resp, JSON_UNESCAPED_UNICODE));
exit(0);
