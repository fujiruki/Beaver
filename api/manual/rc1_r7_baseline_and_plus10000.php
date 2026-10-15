<?php
// rc1 R7: Beaver_beta（本番写し）に対して R-0140(3) 基準線記録と R-0140(5) 見積 +10000 変換を当日と同じ手順で行う
// 使い方（サーバー上）: php rc1_r7_baseline_and_plus10000.php <YYYYMMDD_HHMM> [Beaver_beta|Beaver]
// 退避（VACUUM INTO）→ 基準線（manual/r0143_baseline_snapshot.php）→ 変換前の確認 → manual/r0140_5_estimate_no_plus10000.sql を1トランザクションで実行 → 変換後の確認
$app = $argv[2] ?? 'Beaver_beta';
$api = getenv('HOME') . "/public_html/door-fujita.com/contents/$app/api";
$db = "$api/database.sqlite";
$ts = $argv[1] ?? date('Ymd_Hi');
$now = fn() => (new DateTime('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s');
$pdo = new PDO("sqlite:$db", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$q = fn(string $sql) => $pdo->query($sql)->fetchAll(PDO::FETCH_ASSOC);
function checks(callable $q): array {
    return [
        'estimate_avid_le_10000' => $q("SELECT COUNT(*) c FROM vouchers WHERE voucher_type='estimate' AND access_voucher_id IS NOT NULL AND access_voucher_id <= 10000")[0]['c'],
        'avid_lt_10000_by_type' => $q("SELECT voucher_type, COUNT(*) c FROM vouchers WHERE access_voucher_id < 10000 GROUP BY voucher_type"),
        'avid_ge_10000_by_type' => $q("SELECT voucher_type, COUNT(*) c FROM vouchers WHERE access_voucher_id >= 10000 GROUP BY voucher_type"),
        'avid_duplicates' => $q("SELECT access_voucher_id, COUNT(*) c FROM vouchers WHERE access_voucher_id IS NOT NULL GROUP BY access_voucher_id HAVING COUNT(*) > 1"),
        'estimate_shift_collisions' => $q("SELECT e.id, e.access_voucher_id, o.id other_id, o.voucher_type other_type FROM vouchers e JOIN vouchers o ON o.access_voucher_id = e.access_voucher_id + 10000 WHERE e.voucher_type='estimate' AND e.access_voucher_id < 10000"),
        'sales_numeric_source_lt_10000' => $q("SELECT COUNT(*) c FROM vouchers WHERE voucher_type='sales' AND source_estimate_no IS NOT NULL AND CAST(source_estimate_no AS INTEGER) < 10000 AND CAST(CAST(source_estimate_no AS INTEGER) AS TEXT) = source_estimate_no")[0]['c'],
        'sales_source_orphans' => $q("SELECT COUNT(*) c FROM vouchers s WHERE s.voucher_type='sales' AND s.source_estimate_no IS NOT NULL AND CAST(CAST(s.source_estimate_no AS INTEGER) AS TEXT) = s.source_estimate_no AND NOT EXISTS (SELECT 1 FROM vouchers e WHERE e.voucher_type='estimate' AND e.access_voucher_id = CAST(s.source_estimate_no AS INTEGER))")[0]['c'],
        'counts' => $q("SELECT (SELECT COUNT(*) FROM customers) customers, (SELECT COUNT(*) FROM projects) projects, (SELECT COUNT(*) FROM vouchers) vouchers, (SELECT COUNT(*) FROM voucher_lines) voucher_lines")[0],
    ];
}
$out = ['app' => $app];
$t = microtime(true);
$backup = "$api/backups/database_" . strtolower($app) . "_{$ts}_pre_rc1_r7.sqlite";
if (file_exists($backup)) { fwrite(STDERR, "exists: $backup\n"); exit(1); }
$pdo->exec("VACUUM INTO " . $pdo->quote($backup));
$out['0_backup'] = ['at' => $now(), 'file' => $backup, 'bytes' => filesize($backup), 'sec' => round(microtime(true) - $t, 3)];

$t = microtime(true);
$baselineFile = "$api/backups/rc1_r7_baseline_{$ts}.json";
exec('php ' . escapeshellarg("$api/manual/r0143_baseline_snapshot.php") . ' ' . escapeshellarg($db) . ' ' . escapeshellarg($baselineFile), $lines, $rc);
$out['1_baseline'] = ['at' => $now(), 'file' => $baselineFile, 'rc' => $rc, 'sec' => round(microtime(true) - $t, 3), 'result' => json_decode(implode("\n", $lines), true)];

$out['2_pre_checks'] = checks($q);

$t = microtime(true);
$sql = preg_replace('/^\s*--.*$/m', '', file_get_contents("$api/manual/r0140_5_estimate_no_plus10000.sql"));
$stmts = array_values(array_filter(array_map('trim', explode(';', $sql))));
$pdo->beginTransaction();
$changes = [];
foreach ($stmts as $s) { $changes[] = $pdo->exec($s); }
$pdo->commit();
$out['3_plus10000'] = ['at' => $now(), 'sec' => round(microtime(true) - $t, 3), 'statements' => count($stmts), 'rows_changed' => ['sales.source_estimate_no' => $changes[0] ?? null, 'estimate.access_voucher_id' => $changes[1] ?? null]];

$out['4_post_checks'] = checks($q);
$out['4_post_checks']['integrity'] = $q('PRAGMA integrity_check')[0]['integrity_check'];
$json = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
file_put_contents("$api/backups/rc1_r7_log_{$ts}.json", $json);
echo $json;
