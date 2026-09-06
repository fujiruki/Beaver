<?php
/**
 * R-0143 (3) 同期再開前の基準線記録（G-14-1〜G-14-6・G-19〜G-22）
 *
 * 起動: php api/manual/r0143_baseline_snapshot.php [db_path] [output_path]
 * db_path 省略時は api/database.sqlite。output_path を指定するとJSONをファイルにも保存する。
 *
 * 読み取り専用（SELECTのみ）。DBを一切変更しない。
 */

declare(strict_types=1);

function r0143ComputeBaselineSnapshot(PDO $pdo): array
{
    $g14_1 = (int)$pdo->query('SELECT COUNT(*) FROM vouchers WHERE access_voucher_id IS NULL')->fetchColumn();

    $g14_2 = $pdo->query('
        SELECT voucher_type, COUNT(*) AS count FROM vouchers
        WHERE access_voucher_id IS NOT NULL GROUP BY voucher_type
    ')->fetchAll(PDO::FETCH_ASSOC);
    foreach ($g14_2 as &$row) { $row['count'] = (int)$row['count']; }
    unset($row);

    $max = $pdo->query('SELECT MAX(access_voucher_id) FROM vouchers')->fetchColumn();
    $g14_3 = $max === null ? null : (int)$max;

    $g14_4 = (int)$pdo->query('SELECT COUNT(*) FROM voucher_lines WHERE edited_in_beaver=1')->fetchColumn();

    $g14_5 = [];
    if ($g14_4 > 0) {
        $g14_5 = $pdo->query('
            SELECT v.id, v.voucher_no, v.access_voucher_id FROM vouchers v
            JOIN voucher_lines l ON l.voucher_id = v.id
            WHERE l.edited_in_beaver = 1
            GROUP BY v.id
        ')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($g14_5 as &$row) {
            $row['id'] = (int)$row['id'];
            $row['access_voucher_id'] = $row['access_voucher_id'] === null ? null : (int)$row['access_voucher_id'];
        }
        unset($row);
    }

    $g14_6 = (int)$pdo->query("
        SELECT COUNT(*) FROM vouchers WHERE voucher_type='sales' AND source_estimate_no IS NOT NULL
    ")->fetchColumn();

    $g19 = (int)$pdo->query('SELECT COUNT(*) FROM customers')->fetchColumn();
    $g20 = (int)$pdo->query('SELECT COUNT(*) FROM customers WHERE access_customer_no IS NOT NULL')->fetchColumn();
    $g21 = (int)$pdo->query('SELECT COUNT(*) FROM customers WHERE CAST(code AS INTEGER) >= 90001')->fetchColumn();
    $g22 = $pdo->query('SELECT name, COUNT(*) AS count FROM customers GROUP BY name HAVING COUNT(*) > 1')
        ->fetchAll(PDO::FETCH_ASSOC);
    foreach ($g22 as &$row) { $row['count'] = (int)$row['count']; }
    unset($row);

    $recordedAt = (new DateTime('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s');

    return [
        'recorded_at' => $recordedAt,
        'g14_1' => $g14_1,
        'g14_2' => $g14_2,
        'g14_3' => $g14_3,
        'g14_4' => $g14_4,
        'g14_5' => $g14_5,
        'g14_6' => $g14_6,
        'g19'   => $g19,
        'g20'   => $g20,
        'g21'   => $g21,
        'g22'   => $g22,
    ];
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $dbPath = $argv[1] ?? dirname(__DIR__) . '/database.sqlite';
    $outputPath = $argv[2] ?? null;

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $json = json_encode(r0143ComputeBaselineSnapshot($pdo), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

    echo $json . "\n";
    if ($outputPath !== null) {
        file_put_contents($outputPath, $json . "\n");
    }
}
