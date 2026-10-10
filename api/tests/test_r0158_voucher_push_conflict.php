<?php
/**
 * R-0158: POST /vouchers/sync・POST /projects/{id}/vouchers/sync の競合判定（base_synced_at / force）と
 * void済み伝票の force による取消解除のテスト
 *
 * 起動: php api/tests/test_r0158_voucher_push_conflict.php
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);

$testDbPath = __DIR__ . '/test_r0158_voucher_push_conflict_' . getmypid() . '.sqlite';
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

$pdo->exec("INSERT INTO customers (name, access_customer_no) VALUES ('R0158得意先', '800')");
$customerId = (int)$pdo->lastInsertId();
$pdo->exec("INSERT INTO projects (project_code, customer_id, name, status) VALUES ('P08158', $customerId, 'R0158案件', '進行中')");
$projectId = (int)$pdo->lastInsertId();

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

$bootstrap = __DIR__ . '/_r0158_bootstrap.php';
file_put_contents($bootstrap, "<?php\ndefine('DB_PATH', " . var_export($testDbPath, true) . ");\ndefine('BILLING_EDIT_ENABLED', true);\n");

$port = 18158;
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

$api = "http://127.0.0.1:$port/contents/Beaver/api";

function request(string $method, string $url, ?array $payload = null): array {
    $opts = [
        'method'        => $method,
        'header'        => "Content-Type: application/json\r\nConnection: close\r\n",
        'timeout'       => 5,
        'ignore_errors' => true,
    ];
    if ($payload !== null) $opts['content'] = json_encode($payload);
    $body = @file_get_contents($url, false, stream_context_create(['http' => $opts]));
    $statusLine = $http_response_header[0] ?? '';
    preg_match('/\s(\d{3})\s?/', $statusLine, $m);
    return ['status' => isset($m[1]) ? (int)$m[1] : 0, 'body' => json_decode((string)$body, true), 'raw' => (string)$body];
}

function payload(int $avid, string $memo, string $itemName, array $extra = []): array {
    return array_merge([
        'access_voucher_id'  => $avid,
        'voucher_type'       => 'sales',
        'status'             => 'draft',
        'customer_access_no' => '800',
        'voucher_date'       => '2026-10-01',
        'memo'               => $memo,
        'lines'              => [
            ['line_no' => 1, 'item_name' => $itemName, 'quantity' => 1, 'line_total' => 1000, 'tax_category' => '課税'],
        ],
    ], $extra);
}

// Beaver版の伝票を作り、updated_at を UTC 生値で固定する
function seedVoucher(PDO $pdo, string $url, int $avid, string $updatedAtUtc, string $status = 'draft'): int {
    $r = request('POST', $url, payload($avid, 'Beaver版', 'Beaver明細', ['status' => $status]));
    if ($r['status'] !== 200) throw new RuntimeException('seed 失敗: ' . $r['raw']);
    $id = (int)$r['body']['voucher_id'];
    $pdo->prepare('UPDATE vouchers SET updated_at = ? WHERE id = ?')->execute([$updatedAtUtc, $id]);
    return $id;
}

function snapshot(PDO $pdo, int $id): array {
    $v = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
    $v->execute([$id]);
    $l = $pdo->prepare('SELECT * FROM voucher_lines WHERE voucher_id = ? ORDER BY line_no');
    $l->execute([$id]);
    return ['voucher' => $v->fetch(), 'lines' => $l->fetchAll()];
}

function lineNames(PDO $pdo, int $id): array {
    return array_column(snapshot($pdo, $id)['lines'], 'item_name');
}

function historyCount(PDO $pdo, int $id, string $action): int {
    $s = $pdo->prepare("SELECT COUNT(*) FROM record_history WHERE entity = 'vouchers' AND entity_id = ? AND action = ?");
    $s->execute([$id, $action]);
    return (int)$s->fetchColumn();
}

function voidWithReason(PDO $pdo, string $api, int $id, string $reason): void {
    $r = request('DELETE', "$api/vouchers/$id", ['reason' => $reason]);
    if (($r['body']['result'] ?? null) !== 'voided') throw new RuntimeException('void 失敗: ' . $r['raw']);
    $pdo->prepare('UPDATE vouchers SET updated_at = ? WHERE id = ?')->execute(['2026-10-01 03:00:00', $id]);
}

function assertConflict(PDO $pdo, array $r, int $id, array $before, string $label): void {
    assertEq(409, $r['status'], "$label status");
    assertEq('voucher_conflict', $r['body']['error'] ?? null, "$label error");
    $v = $r['body']['voucher'] ?? [];
    assertEq($id, (int)($v['id'] ?? 0), "$label voucher.id");
    assertEq('2026-10-01 12:00:00', $v['updated_at'] ?? null, "$label voucher.updated_at(JST)");
    assertEq($before, snapshot($pdo, $id), "$label ヘッダーも明細も変わらない");
}

// UTC 2026-10-01 03:00:00 = JST 2026-10-01 12:00:00
$UTC = '2026-10-01 03:00:00';

try {
    if (!$ready) throw new RuntimeException('サーバが応答しません');
    $sync = "$api/vouchers/sync";
    $projSync = "$api/projects/$projectId/vouchers/sync";

    runTest('受入条件1: updated_at > base_synced_at、force なし → 409 voucher_conflict、GET /vouchers/sync と同じ形、DB不変', function () use ($pdo, $sync, $api, $UTC) {
        $id = seedVoucher($pdo, $sync, 9001, $UTC);
        $before = snapshot($pdo, $id);
        $r = request('POST', $sync, payload(9001, 'Access版', 'Access明細', ['base_synced_at' => '2026-10-01 11:59:59']));
        assertConflict($pdo, $r, $id, $before, '');
        $v = $r['body']['voucher'];
        assertEq('Beaver版', $v['memo'] ?? ($v['description'] ?? 'Beaver版'), 'memo');
        assertTrue(array_key_exists('void_reason', $v), 'void_reason キーがある');
        assertEq(null, $v['void_reason'], 'void_reason は null');
        assertEq(['Beaver明細'], array_column($v['lines'] ?? [], 'item_name'), 'lines は Beaver の現在値');

        $g = request('GET', "$api/vouchers/sync");
        $fromGet = null;
        foreach ($g['body']['vouchers'] ?? [] as $gv) {
            if ((int)$gv['id'] === $id) $fromGet = $gv;
        }
        assertTrue($fromGet !== null, 'GET /vouchers/sync に該当伝票がある');
        $expected = $fromGet + ['void_reason' => null];
        ksort($expected);
        $actual = $v;
        ksort($actual);
        assertEq($expected, $actual, 'GET /vouchers/sync の1件 + void_reason と同じ');
    });

    runTest('受入条件2: updated_at == base_synced_at → 上書き200', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9002, $UTC);
        $r = request('POST', $sync, payload(9002, 'Access版', 'Access明細', ['base_synced_at' => '2026-10-01 12:00:00']));
        assertEq(200, $r['status'], 'status');
        assertEq('Access版', snapshot($pdo, $id)['voucher']['memo'], 'memo が上書きされる');
        assertEq(['Access明細'], lineNames($pdo, $id), '明細が上書きされる');
    });

    runTest('受入条件3: updated_at < base_synced_at → 上書き200', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9003, $UTC);
        $r = request('POST', $sync, payload(9003, 'Access版', 'Access明細', ['base_synced_at' => '2026-10-01 12:00:01']));
        assertEq(200, $r['status'], 'status');
        assertEq('Access版', snapshot($pdo, $id)['voucher']['memo'], 'memo が上書きされる');
        assertEq(['Access明細'], lineNames($pdo, $id), '明細が上書きされる');
    });

    runTest('受入条件4: base_synced_at なし → 上書き200', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9004, $UTC);
        $r = request('POST', $sync, payload(9004, 'Access版', 'Access明細'));
        assertEq(200, $r['status'], 'status');
        assertEq('synced', $r['body']['status'] ?? null, '応答は従来どおり');
        assertEq('Access版', snapshot($pdo, $id)['voucher']['memo'], 'memo が上書きされる');
        assertEq(['Access明細'], lineNames($pdo, $id), '明細が上書きされる');
    });

    runTest('受入条件5: force=true なら updated_at が新しくても置き換え200', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9005, $UTC);
        $r = request('POST', $sync, payload(9005, 'Access版', 'Access明細', ['base_synced_at' => '2026-09-01 00:00:00', 'force' => true]));
        assertEq(200, $r['status'], 'status');
        assertEq('Access版', snapshot($pdo, $id)['voucher']['memo'], 'memo が置き換わる');
        assertEq(['Access明細'], lineNames($pdo, $id), '明細が置き換わる');
        assertEq(0, historyCount($pdo, $id, 'unvoid'), 'void でない伝票では unvoid を残さない');
    });

    runTest('受入条件5補足: force は JSON の true のみ有効（"true" や 1 は競合判定する）', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9015, $UTC);
        $before = snapshot($pdo, $id);
        foreach (['true', 1] as $f) {
            $r = request('POST', $sync, payload(9015, 'Access版', 'Access明細', ['base_synced_at' => '2026-09-01 00:00:00', 'force' => $f]));
            assertConflict($pdo, $r, $id, $before, 'force=' . var_export($f, true));
        }
    });

    runTest('受入条件6: base_synced_at の形式不正 → 400、DB不変', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9006, $UTC);
        $before = snapshot($pdo, $id);
        foreach (['2026/10/01 12:00:00', '2026-10-01 25:00:00', '2026-10-01', 'not-a-date', '2026-10-01T12:00:00', 12345] as $bad) {
            $r = request('POST', $sync, payload(9006, 'Access版', 'Access明細', ['base_synced_at' => $bad]));
            assertEq(400, $r['status'], 'status (' . var_export($bad, true) . ')');
        }
        $r = request('POST', $sync, payload(9016, '新規', '新規明細', ['base_synced_at' => 'bad']));
        assertEq(400, $r['status'], '未登録の伝票でも400');
        assertEq(false, $pdo->query('SELECT 1 FROM vouchers WHERE access_voucher_id = 9016')->fetchColumn(), '作られない');
        assertEq($before, snapshot($pdo, $id), 'DBは変わらない');
    });

    runTest('受入条件7: 新規伝票は base_synced_at があっても作成', function () use ($pdo, $sync) {
        $r = request('POST', $sync, payload(9007, '新規', '新規明細', ['base_synced_at' => '2026-10-01 12:00:00']));
        assertEq(200, $r['status'], 'status');
        $id = (int)($r['body']['voucher_id'] ?? 0);
        assertTrue($id > 0, 'voucher_id');
        assertEq('新規', snapshot($pdo, $id)['voucher']['memo'], 'memo');
        assertEq(['新規明細'], lineNames($pdo, $id), '明細');
    });

    runTest('受入条件8: void済み（理由付き履歴あり）に force なしで push → 409、status=void、void_reason', function () use ($pdo, $sync, $api, $UTC) {
        $id = seedVoucher($pdo, $sync, 9008, $UTC);
        voidWithReason($pdo, $api, $id, '古い理由');
        $pdo->prepare("INSERT INTO record_history (entity, entity_id, action, before_json) VALUES ('vouchers', ?, 'void', ?)")
            ->execute([$id, json_encode(['row' => [], 'related' => ['reason' => '重複登録のため']], JSON_UNESCAPED_UNICODE)]);
        $before = snapshot($pdo, $id);
        $r = request('POST', $sync, payload(9008, 'Access版', 'Access明細', ['base_synced_at' => '2026-10-01 11:00:00']));
        assertConflict($pdo, $r, $id, $before, '');
        assertEq('void', $r['body']['voucher']['status'] ?? null, 'voucher.status');
        assertEq('重複登録のため', $r['body']['voucher']['void_reason'] ?? null, 'void_reason は最新の理由');
    });

    runTest('受入条件8補足: void の履歴が無ければ void_reason は null', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9018, $UTC, 'void');
        $r = request('POST', $sync, payload(9018, 'Access版', 'Access明細', ['base_synced_at' => '2026-10-01 11:00:00']));
        assertEq(409, $r['status'], 'status');
        assertEq('void', $r['body']['voucher']['status'] ?? null, 'voucher.status');
        assertTrue(array_key_exists('void_reason', $r['body']['voucher'] ?? []), 'void_reason キーがある');
        assertEq(null, $r['body']['voucher']['void_reason'], 'void_reason は null');
    });

    runTest('受入条件9: void済みに force=true・status=draft → 取消解除、unvoid 履歴1件', function () use ($pdo, $sync, $api, $UTC) {
        $id = seedVoucher($pdo, $sync, 9009, $UTC);
        voidWithReason($pdo, $api, $id, '誤って取消');
        $r = request('POST', $sync, payload(9009, 'Access版', 'Access明細', ['base_synced_at' => '2026-09-01 00:00:00', 'force' => true]));
        assertEq(200, $r['status'], 'status');
        $after = snapshot($pdo, $id);
        assertEq('draft', $after['voucher']['status'], 'status が draft に戻る');
        assertEq('Access版', $after['voucher']['memo'], 'memo が Access 版');
        assertEq(['Access明細'], lineNames($pdo, $id), '明細が Access 版');
        assertEq(1, historyCount($pdo, $id, 'unvoid'), 'unvoid 履歴が1件');
        $h = $pdo->query("SELECT * FROM record_history WHERE entity = 'vouchers' AND entity_id = $id AND action = 'unvoid'")->fetch();
        $beforeJson = json_decode($h['before_json'], true);
        $afterJson  = json_decode((string)$h['after_json'], true);
        assertEq('void', $beforeJson['row']['status'] ?? null, '解除前の伝票は void');
        assertEq('Beaver版', $beforeJson['row']['memo'] ?? null, '解除前の伝票は Beaver 版');
        assertEq('draft', $afterJson['row']['status'] ?? null, '解除後の伝票は draft');
        assertEq('Access版', $afterJson['row']['memo'] ?? null, '解除後の伝票は Access 版');
        assertEq('Accessの競合解決で『Access版を採用』（force）により取消を解除', $beforeJson['related']['reason'] ?? null, '理由');
    });

    runTest('受入条件10: void済みに force=true・status=void → 200、unvoid 履歴なし', function () use ($pdo, $sync, $api, $UTC) {
        $id = seedVoucher($pdo, $sync, 9010, $UTC);
        voidWithReason($pdo, $api, $id, '取消');
        $r = request('POST', $sync, payload(9010, 'Access版', 'Access明細', ['status' => 'void', 'base_synced_at' => '2026-09-01 00:00:00', 'force' => true]));
        assertEq(200, $r['status'], 'status');
        assertEq('void', snapshot($pdo, $id)['voucher']['status'], 'status は void のまま');
        assertEq('Access版', snapshot($pdo, $id)['voucher']['memo'], 'memo は Access 版');
        assertEq(0, historyCount($pdo, $id, 'unvoid'), 'unvoid 履歴なし');
    });

    runTest('受入条件11: POST /projects/{id}/vouchers/sync でも 1（409）と 5（force）が同じように動く', function () use ($pdo, $projSync, $projectId, $UTC) {
        $id = seedVoucher($pdo, $projSync, 9011, $UTC);
        assertEq($projectId, (int)snapshot($pdo, $id)['voucher']['project_id'], '案件付き伝票');
        $before = snapshot($pdo, $id);
        $r = request('POST', $projSync, payload(9011, 'Access版', 'Access明細', ['base_synced_at' => '2026-10-01 11:59:59']));
        assertConflict($pdo, $r, $id, $before, '案件経路');
        assertEq(['Beaver明細'], array_column($r['body']['voucher']['lines'] ?? [], 'item_name'), 'lines は Beaver の現在値');

        $r2 = request('POST', $projSync, payload(9011, 'Access版', 'Access明細', ['base_synced_at' => '2026-10-01 11:59:59', 'force' => true]));
        assertEq(200, $r2['status'], 'force status');
        assertEq('Access版', snapshot($pdo, $id)['voucher']['memo'], 'memo が置き換わる');
        assertEq(['Access明細'], lineNames($pdo, $id), '明細が置き換わる');
    });

    runTest('受入条件12: force=true でも R-0151 の access_line_id キー明細置換が動く', function () use ($pdo, $sync, $UTC) {
        $id = seedVoucher($pdo, $sync, 9012, $UTC);
        $lineId = (int)$pdo->query("SELECT id FROM voucher_lines WHERE voucher_id = $id")->fetchColumn();
        $pdo->exec("UPDATE voucher_lines SET access_line_id = 915801, edited_in_beaver = 1 WHERE id = $lineId");
        $pdo->exec("INSERT INTO voucher_line_costs (voucher_line_id, category_code, category_name, measure_type, value, sort_order) VALUES ($lineId, 'MAIN', '本体', 'money', 500, 1)");
        $pdo->exec("INSERT INTO voucher_line_prices (voucher_line_id, category_code, category_name, measure_type, value, sort_order) VALUES ($lineId, 'MAIN', '本体', 'money', 800, 1)");

        $r = request('POST', $sync, payload(9012, 'Access版', 'unused', [
            'base_synced_at' => '2026-09-01 00:00:00',
            'force' => true,
            'lines_mode' => 'replace',
            'lines' => [[
                'access_line_id' => 915801,
                'line_no' => 1,
                'item_name' => 'Access置換明細',
                'quantity' => 2,
                'line_total' => 2400,
                'tax_category' => '課税',
            ]],
        ]));

        assertEq(200, $r['status'], 'status');
        $line = $pdo->query("SELECT id, access_line_id, item_name, quantity, line_total FROM voucher_lines WHERE voucher_id = $id")->fetch();
        assertEq($lineId, (int)$line['id'], 'Beaver側の明細IDを維持');
        assertEq(915801, (int)$line['access_line_id'], 'access_line_id を維持');
        assertEq('Access置換明細', $line['item_name'], '明細をAccess版で更新');
        assertEq(1, (int)$pdo->query("SELECT COUNT(*) FROM voucher_line_costs WHERE voucher_line_id = $lineId")->fetchColumn(), 'costs を維持');
        assertEq(1, (int)$pdo->query("SELECT COUNT(*) FROM voucher_line_prices WHERE voucher_line_id = $lineId")->fetchColumn(), 'prices を維持');
    });

} finally {
    if (is_resource($serverProc)) {
        foreach ($serverPipes as $p) { if (is_resource($p)) fclose($p); }
        proc_terminate($serverProc);
        proc_close($serverProc);
    }
    @unlink($bootstrap);
}

$pdo = null;
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
