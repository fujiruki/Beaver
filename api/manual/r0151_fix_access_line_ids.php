<?php
/**
 * R-0151 (5): 既存17行の access_line_id 修復（Beaver_beta限定、dodai-back提供の対応表をハードコード）
 *
 * 起動: php api/manual/r0151_fix_access_line_ids.php <db_path> [--execute]
 *
 * --execute を付けない場合は17行の現在値・照合結果を表示するのみ（更新しない）。
 * 1件でも照合NGがあれば全体を中止し、何も更新しない（部分適用禁止）。
 * --execute 時、全件OKの場合のみ access_line_id を更新する。updated_at は変更しない。
 */

declare(strict_types=1);

const R0151_FIX_MAP = [
    ['access_voucher_no' => 12102, 'line_no' => 1, 'beaver_line_id' => 25485, 'access_line_id' => 25760, 'item_name' => '', 'line_total' => 0],
    ['access_voucher_no' => 12102, 'line_no' => 2, 'beaver_line_id' => 25486, 'access_line_id' => 25761, 'item_name' => '', 'line_total' => 0],
    ['access_voucher_no' => 12102, 'line_no' => 3, 'beaver_line_id' => 25487, 'access_line_id' => 25762, 'item_name' => '', 'line_total' => 0],
    ['access_voucher_no' => 12103, 'line_no' => 1, 'beaver_line_id' => 25492, 'access_line_id' => 25771, 'item_name' => '鍵交換', 'line_total' => 2400],
    ['access_voucher_no' => 12104, 'line_no' => 1, 'beaver_line_id' => 25493, 'access_line_id' => 25764, 'item_name' => '特注キーホルダー', 'line_total' => 79800],
    ['access_voucher_no' => 12104, 'line_no' => 2, 'beaver_line_id' => 25494, 'access_line_id' => 25765, 'item_name' => '設計費・諸経費', 'line_total' => 28000],
    ['access_voucher_no' => 12104, 'line_no' => 3, 'beaver_line_id' => 25495, 'access_line_id' => 25766, 'item_name' => '', 'line_total' => 0],
    ['access_voucher_no' => 12105, 'line_no' => 1, 'beaver_line_id' => 25496, 'access_line_id' => 25767, 'item_name' => 'フラッシュ戸3x6　間仕切　中抜き　レバー空錠', 'line_total' => 48000],
    ['access_voucher_no' => 12105, 'line_no' => 2, 'beaver_line_id' => 25497, 'access_line_id' => 25768, 'item_name' => '収納建具観音　中', 'line_total' => 30000],
    ['access_voucher_no' => 12105, 'line_no' => 3, 'beaver_line_id' => 25498, 'access_line_id' => 25769, 'item_name' => '収納建具観音　小', 'line_total' => 0],
    ['access_voucher_no' => 12105, 'line_no' => 4, 'beaver_line_id' => 25499, 'access_line_id' => 25770, 'item_name' => '木建格子戸　アクリル　Vレール', 'line_total' => 89500],
    ['access_voucher_no' => 12106, 'line_no' => 1, 'beaver_line_id' => 25488, 'access_line_id' => 25772, 'item_name' => 'どあ', 'line_total' => 10716],
    ['access_voucher_no' => 12106, 'line_no' => 2, 'beaver_line_id' => 25489, 'access_line_id' => 25773, 'item_name' => 'わく', 'line_total' => 12858],
    ['access_voucher_no' => 12107, 'line_no' => 1, 'beaver_line_id' => 25490, 'access_line_id' => 25774, 'item_name' => 'どあ', 'line_total' => 10716],
    ['access_voucher_no' => 12107, 'line_no' => 2, 'beaver_line_id' => 25491, 'access_line_id' => 25775, 'item_name' => 'わく', 'line_total' => 12858],
    ['access_voucher_no' => 12108, 'line_no' => 1, 'beaver_line_id' => 25352, 'access_line_id' => 25776, 'item_name' => '障子張替え　中　', 'line_total' => 12400],
    ['access_voucher_no' => 12108, 'line_no' => 2, 'beaver_line_id' => 25353, 'access_line_id' => 25777, 'item_name' => '運搬・経費', 'line_total' => 11000],
];

function r0151ItemNameMatches(?string $beaverName, string $expected): bool
{
    $beaver = (string)$beaverName;
    if ($expected === '') {
        return $beaver === '';
    }
    return mb_strpos($beaver, $expected) === 0;
}

function r0151LineTotalMatches($beaverTotal, $expected): bool
{
    return abs((float)$beaverTotal - (float)$expected) < 0.0001;
}

function r0151FixAccessLineIds(PDO $pdo, bool $execute = false): array
{
    $rows = [];
    $allOk = true;

    foreach (R0151_FIX_MAP as $map) {
        $row = [
            'access_voucher_no'      => $map['access_voucher_no'],
            'line_no'                => $map['line_no'],
            'beaver_line_id'         => $map['beaver_line_id'],
            'expected_access_line_id' => $map['access_line_id'],
            'expected_item_name'     => $map['item_name'],
            'expected_line_total'    => $map['line_total'],
            'voucher_id'             => null,
            'current_item_name'      => null,
            'current_line_total'     => null,
            'current_access_line_id' => null,
            'ok'                     => false,
            'reason'                 => null,
        ];

        $voucherStmt = $pdo->prepare('SELECT id FROM vouchers WHERE access_voucher_id = ?');
        $voucherStmt->execute([$map['access_voucher_no']]);
        $voucherId = $voucherStmt->fetchColumn();

        if ($voucherId === false) {
            $row['reason'] = 'voucher not found (access_voucher_id=' . $map['access_voucher_no'] . ')';
            $allOk = false;
            $rows[] = $row;
            continue;
        }
        $row['voucher_id'] = (int)$voucherId;

        $lineStmt = $pdo->prepare('SELECT voucher_id, item_name, line_total, access_line_id FROM voucher_lines WHERE id = ?');
        $lineStmt->execute([$map['beaver_line_id']]);
        $line = $lineStmt->fetch();

        if ($line === false) {
            $row['reason'] = 'voucher_line not found (id=' . $map['beaver_line_id'] . ')';
            $allOk = false;
            $rows[] = $row;
            continue;
        }

        $row['current_item_name']      = $line['item_name'];
        $row['current_line_total']     = $line['line_total'];
        $row['current_access_line_id'] = $line['access_line_id'];

        if ((int)$line['voucher_id'] !== (int)$voucherId) {
            $row['reason'] = 'voucher_id mismatch';
            $allOk = false;
            $rows[] = $row;
            continue;
        }

        if ($line['access_line_id'] !== null) {
            $row['reason'] = 'access_line_id already set';
            $allOk = false;
            $rows[] = $row;
            continue;
        }

        if (!r0151ItemNameMatches($line['item_name'], $map['item_name'])) {
            $row['reason'] = 'item_name mismatch';
            $allOk = false;
            $rows[] = $row;
            continue;
        }

        if (!r0151LineTotalMatches($line['line_total'], $map['line_total'])) {
            $row['reason'] = 'line_total mismatch';
            $allOk = false;
            $rows[] = $row;
            continue;
        }

        $row['ok'] = true;
        $rows[] = $row;
    }

    $result = [
        'total_count' => count($rows),
        'ok_count'    => count(array_filter($rows, fn($r) => $r['ok'])),
        'all_ok'      => $allOk,
        'rows'        => $rows,
        'executed'    => false,
    ];

    if (!$execute || !$allOk) {
        return $result;
    }

    $pdo->beginTransaction();
    try {
        // updated_at は更新しない（Access側への競合誤検知を防ぐため）
        $upd = $pdo->prepare('UPDATE voucher_lines SET access_line_id = ? WHERE id = ? AND voucher_id = ? AND access_line_id IS NULL');
        foreach ($rows as $row) {
            $upd->execute([$row['expected_access_line_id'], $row['beaver_line_id'], $row['voucher_id']]);
            if ($upd->rowCount() !== 1) {
                throw new RuntimeException('update affected ' . $upd->rowCount() . ' rows for beaver_line_id=' . $row['beaver_line_id']);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $verifyStmt = $pdo->prepare('SELECT access_line_id FROM voucher_lines WHERE id = ?');
    $verified = [];
    foreach ($rows as $row) {
        $verifyStmt->execute([$row['beaver_line_id']]);
        $actual = (int)$verifyStmt->fetchColumn();
        $verified[] = [
            'beaver_line_id' => $row['beaver_line_id'],
            'access_line_id' => $actual,
            'ok'             => $actual === (int)$row['expected_access_line_id'],
        ];
    }

    $result['executed'] = true;
    $result['verified']  = $verified;
    return $result;
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $dbPath  = $argv[1] ?? dirname(__DIR__) . '/database.sqlite';
    $execute = in_array('--execute', $argv, true);

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $result = r0151FixAccessLineIds($pdo, $execute);
    echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT) . "\n";
}
