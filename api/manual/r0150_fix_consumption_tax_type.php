<?php
/**
 * R-0150: 伝票見出し consumption_tax_type の誤混入値（'課税'）を正しいデフォルト値へ修正
 *
 * 起動: php api/manual/r0150_fix_consumption_tax_type.php <db_path> [--execute]
 *
 * --execute を付けない場合は件数・対象行の集計のみ（更新しない）。
 * --execute 時は consumption_tax_type = '外税/伝票計' へ一括更新する。
 * updated_at は更新しない（Access側で再度「競合」として検出されてしまうため）。
 */

declare(strict_types=1);

const R0150_INVALID_VALUE = '課税';
const R0150_FIXED_VALUE   = '外税/伝票計';

function r0150FixConsumptionTaxType(PDO $pdo, bool $execute = false): array
{
    $rowsStmt = $pdo->prepare('SELECT id, voucher_no FROM vouchers WHERE consumption_tax_type = ?');
    $rowsStmt->execute([R0150_INVALID_VALUE]);
    $rows = $rowsStmt->fetchAll();

    $result = [
        'invalid_value' => R0150_INVALID_VALUE,
        'fixed_value'   => R0150_FIXED_VALUE,
        'target_count'  => count($rows),
        'targets'       => array_map(fn($r) => ['id' => (int)$r['id'], 'voucher_no' => $r['voucher_no']], $rows),
        'executed'      => false,
        'updated_count' => 0,
    ];

    if (!$execute || count($rows) === 0) {
        return $result;
    }

    // updated_at は絶対に更新しない（Access側の競合検出に影響するため）
    $updateStmt = $pdo->prepare('UPDATE vouchers SET consumption_tax_type = ? WHERE consumption_tax_type = ?');
    $updateStmt->execute([R0150_FIXED_VALUE, R0150_INVALID_VALUE]);

    $result['executed']      = true;
    $result['updated_count'] = $updateStmt->rowCount();
    return $result;
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $dbPath  = $argv[1] ?? dirname(__DIR__) . '/database.sqlite';
    $execute = in_array('--execute', $argv, true);

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $result = r0150FixConsumptionTaxType($pdo, $execute);
    echo json_encode($result, JSON_UNESCAPED_UNICODE) . "\n";
}
