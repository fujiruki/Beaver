<?php
/**
 * R-0143 (7) Beaver_beta等の再clone後に復活する「単発seed/インポート」伝票の一括削除
 *
 * 起動: php api/manual/r0143_purge_seed_cluster_vouchers.php <db_path> <created_at_prefix> [--execute]
 * created_at_prefix 例: "2026-03-17 20:04"（前方一致で対象を特定）
 *
 * --execute を付けない場合は件数集計のみ（削除しない）。
 * 対象に access_billed_flag=1・invoice_vouchers 紐付き・voucher_lines.edited_in_beaver=1
 * が1件でも含まれる場合は削除を中止する。
 */

declare(strict_types=1);

function r0143PurgeSeedClusterVouchers(PDO $pdo, string $createdAtPrefix, bool $execute = false): array
{
    $likeParam = $createdAtPrefix . '%';

    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM vouchers WHERE access_voucher_id IS NULL AND created_at LIKE ?');
    $countStmt->execute([$likeParam]);
    $targetCount = (int)$countStmt->fetchColumn();

    $billedStmt = $pdo->prepare('SELECT COUNT(*) FROM vouchers WHERE access_voucher_id IS NULL AND created_at LIKE ? AND access_billed_flag = 1');
    $billedStmt->execute([$likeParam]);
    $billedCount = (int)$billedStmt->fetchColumn();

    $invoiceStmt = $pdo->prepare('
        SELECT COUNT(*) FROM vouchers v
        WHERE v.access_voucher_id IS NULL AND v.created_at LIKE ?
          AND EXISTS (SELECT 1 FROM invoice_vouchers iv WHERE iv.voucher_id = v.id)
    ');
    $invoiceStmt->execute([$likeParam]);
    $invoiceLinkedCount = (int)$invoiceStmt->fetchColumn();

    $editedStmt = $pdo->prepare('
        SELECT COUNT(*) FROM vouchers v
        WHERE v.access_voucher_id IS NULL AND v.created_at LIKE ?
          AND EXISTS (SELECT 1 FROM voucher_lines l WHERE l.voucher_id = v.id AND l.edited_in_beaver = 1)
    ');
    $editedStmt->execute([$likeParam]);
    $editedInBeaverCount = (int)$editedStmt->fetchColumn();

    $result = [
        'created_at_prefix'    => $createdAtPrefix,
        'target_count'         => $targetCount,
        'access_billed_flag_1' => $billedCount,
        'invoice_linked'       => $invoiceLinkedCount,
        'edited_in_beaver_1'   => $editedInBeaverCount,
        'executed'             => false,
        'deleted_count'        => 0,
    ];

    if ($billedCount > 0 || $invoiceLinkedCount > 0 || $editedInBeaverCount > 0) {
        $result['aborted_reason'] = '安全チェックに違反する行が対象に含まれるため削除を中止';
        return $result;
    }

    if (!$execute) {
        return $result;
    }

    $pdo->beginTransaction();
    try {
        $pdo->prepare('
            DELETE FROM voucher_line_prices WHERE voucher_line_id IN (
                SELECT vl.id FROM voucher_lines vl
                JOIN vouchers v ON v.id = vl.voucher_id
                WHERE v.access_voucher_id IS NULL AND v.created_at LIKE ?
            )
        ')->execute([$likeParam]);

        $pdo->prepare('
            DELETE FROM voucher_line_costs WHERE voucher_line_id IN (
                SELECT vl.id FROM voucher_lines vl
                JOIN vouchers v ON v.id = vl.voucher_id
                WHERE v.access_voucher_id IS NULL AND v.created_at LIKE ?
            )
        ')->execute([$likeParam]);

        $pdo->prepare('
            DELETE FROM voucher_lines WHERE voucher_id IN (
                SELECT id FROM vouchers WHERE access_voucher_id IS NULL AND created_at LIKE ?
            )
        ')->execute([$likeParam]);

        $deleteStmt = $pdo->prepare('DELETE FROM vouchers WHERE access_voucher_id IS NULL AND created_at LIKE ?');
        $deleteStmt->execute([$likeParam]);
        $deletedCount = $deleteStmt->rowCount();

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $result['executed'] = true;
    $result['deleted_count'] = $deletedCount;
    return $result;
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $dbPath = $argv[1] ?? dirname(__DIR__) . '/database.sqlite';
    $createdAtPrefix = $argv[2] ?? '';
    $execute = in_array('--execute', $argv, true);

    if ($createdAtPrefix === '') {
        fwrite(STDERR, "created_at_prefix を指定してください（例: \"2026-03-17 20:04\"）\n");
        exit(1);
    }

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);

    $result = r0143PurgeSeedClusterVouchers($pdo, $createdAtPrefix, $execute);
    echo json_encode($result, JSON_UNESCAPED_UNICODE) . "\n";
}
