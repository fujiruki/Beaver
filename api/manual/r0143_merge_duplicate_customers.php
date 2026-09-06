<?php
/**
 * R-0143 (6) Beaver内の重複得意先統合スクリプト（A-B-10）
 *
 * 起動: php api/manual/r0143_merge_duplicate_customers.php <db_path> <pairs_json> [--dry-run]
 * pairs_json 例: [{"keep_id":1,"dup_id":2}]
 *
 * dup_id を参照する projects/vouchers/invoices/payments の customer_id を
 * keep_id へ付け替え、dup_id の customers 行は物理削除せず論理削除する。
 * 全ペアを1トランザクションで処理し、エラー時は全体ロールバックする。
 */

declare(strict_types=1);

const R0143_MERGE_TARGET_TABLES = ['projects', 'vouchers', 'invoices', 'payments'];

function r0143MergeDuplicateCustomers(PDO $pdo, array $pairs, bool $dryRun = false): array
{
    $result = [];

    if (!$dryRun) {
        $pdo->beginTransaction();
    }
    try {
        foreach ($pairs as $pair) {
            $keepId = (int)$pair['keep_id'];
            $dupId = (int)$pair['dup_id'];

            $keepStmt = $pdo->prepare('SELECT id FROM customers WHERE id = ?');
            $keepStmt->execute([$keepId]);
            if ($keepStmt->fetch() === false) {
                throw new RuntimeException("keep_id={$keepId} の customers 行が存在しません");
            }

            $dupStmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
            $dupStmt->execute([$dupId]);
            $dup = $dupStmt->fetch(PDO::FETCH_ASSOC);
            if ($dup === false) {
                throw new RuntimeException("dup_id={$dupId} の customers 行が存在しません");
            }

            $pairResult = ['keep_id' => $keepId, 'dup_id' => $dupId, 'counts' => []];
            foreach (R0143_MERGE_TARGET_TABLES as $table) {
                $countStmt = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE customer_id = ?");
                $countStmt->execute([$dupId]);
                $pairResult['counts'][$table] = (int)$countStmt->fetchColumn();

                if (!$dryRun) {
                    $updateStmt = $pdo->prepare("UPDATE {$table} SET customer_id = ? WHERE customer_id = ?");
                    $updateStmt->execute([$keepId, $dupId]);
                }
            }

            if (!$dryRun) {
                $newCode = 'DUP-' . $dup['code'];
                $tag = '[重複統合→' . $keepId . ']';
                $newMemo = trim(($dup['memo'] ?? '') . "\n{$tag}");
                $updateCustomer = $pdo->prepare(
                    'UPDATE customers SET is_active = 0, access_customer_no = NULL, code = ?, memo = ? WHERE id = ?'
                );
                $updateCustomer->execute([$newCode, $newMemo, $dupId]);
            }

            $result[] = $pairResult;
        }

        if (!$dryRun) {
            $pdo->commit();
        }
    } catch (Throwable $e) {
        if (!$dryRun && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    return $result;
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $dbPath = $argv[1] ?? dirname(__DIR__) . '/database.sqlite';
    $pairsJson = $argv[2] ?? '[]';
    $dryRun = in_array('--dry-run', $argv, true);

    $pairs = json_decode($pairsJson, true);
    if (!is_array($pairs)) {
        fwrite(STDERR, "pairs_json のパースに失敗しました\n");
        exit(1);
    }

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ]);
    $pdo->exec('PRAGMA foreign_keys=ON');

    $result = r0143MergeDuplicateCustomers($pdo, $pairs, $dryRun);
    echo json_encode($result, JSON_UNESCAPED_UNICODE) . "\n";
}
