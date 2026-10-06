<?php
/**
 * R-0151 (4): voucher_type='sales' の total_amount 等が明細との計算結果と不整合な伝票を一括修復する
 *
 * 起動: php api/manual/r0151_recalc_voucher_totals.php <db_path> [--execute]
 *
 * --execute を付けない場合は対象件数・変更前後の値を集計するのみ（更新しない）。
 * --execute 時は recalcVoucher() 本体を呼ばず、updated_at を変更しない専用UPDATE文で更新する
 * （Access側への競合誤検知を防ぐため）。
 */

declare(strict_types=1);

function r0151Differs(float $a, float $b): bool {
    return abs($a - $b) > 0.0001;
}

function r0151ComputeVoucherTotals(PDO $pdo, int $voucherId, float $taxRate, string $taxInputType): array {
    $lStmt = $pdo->prepare('SELECT line_type, line_total, tax_category FROM voucher_lines WHERE voucher_id = ?');
    $lStmt->execute([$voucherId]);

    $taxable = 0.0; $nontaxable = 0.0; $discount = 0.0;
    foreach ($lStmt->fetchAll() as $l) {
        $amt = (float)$l['line_total'];
        if ($l['line_type'] === 'discount') {
            $discount += $amt;
        } elseif ($l['tax_category'] === 'taxable') {
            $taxable += $amt;
        } else {
            $nontaxable += $amt;
        }
    }

    if ($taxInputType === 'inclusive') {
        $taxAmount       = (float)(int)floor($taxable * $taxRate / (1 + $taxRate));
        $subtotalTaxable = $taxable - $taxAmount;
        $total           = $taxable + $nontaxable - $discount;
    } else {
        $taxAmount       = (float)(int)floor($taxable * $taxRate);
        $subtotalTaxable = $taxable;
        $total           = $taxable + $nontaxable - $discount + $taxAmount;
    }

    return [
        'subtotal_taxable'    => $subtotalTaxable,
        'subtotal_nontaxable' => $nontaxable,
        'subtotal_discount'   => $discount,
        'tax_amount'          => $taxAmount,
        'total_amount'        => $total,
    ];
}

function r0151RecalcVoucherTotals(PDO $pdo, bool $execute = false): array {
    $taxStmt = $pdo->query('SELECT rate FROM tax_rates ORDER BY valid_from DESC LIMIT 1');
    $taxRate = (float)$taxStmt->fetchColumn();

    $vStmt = $pdo->query("
        SELECT id, voucher_no, tax_input_type,
               subtotal_taxable, subtotal_nontaxable, subtotal_discount, tax_amount, total_amount
        FROM vouchers WHERE voucher_type = 'sales'
    ");

    $targets = [];
    foreach ($vStmt->fetchAll() as $v) {
        $computed = r0151ComputeVoucherTotals($pdo, (int)$v['id'], $taxRate, (string)$v['tax_input_type']);

        $changed = r0151Differs((float)$v['subtotal_taxable'],    $computed['subtotal_taxable'])
            || r0151Differs((float)$v['subtotal_nontaxable'], $computed['subtotal_nontaxable'])
            || r0151Differs((float)$v['subtotal_discount'],   $computed['subtotal_discount'])
            || r0151Differs((float)$v['tax_amount'],          $computed['tax_amount'])
            || r0151Differs((float)$v['total_amount'],        $computed['total_amount']);

        if ($changed) {
            $targets[] = [
                'id'               => (int)$v['id'],
                'voucher_no'       => $v['voucher_no'],
                'old_total_amount' => (float)$v['total_amount'],
                'new_total_amount' => $computed['total_amount'],
                'computed'         => $computed,
            ];
        }
    }

    $result = [
        'target_count' => count($targets),
        'targets'      => array_map(fn($t) => [
            'id'               => $t['id'],
            'voucher_no'       => $t['voucher_no'],
            'old_total_amount' => $t['old_total_amount'],
            'new_total_amount' => $t['new_total_amount'],
        ], $targets),
        'executed'     => false,
    ];

    if (!$execute || empty($targets)) {
        return $result;
    }

    $pdo->beginTransaction();
    try {
        // updated_at は更新しない（Access側への競合誤検知を防ぐため、recalcVoucher() 本体は呼ばない）
        $upd = $pdo->prepare('
            UPDATE vouchers SET
                subtotal_taxable = :subtotal_taxable, subtotal_nontaxable = :subtotal_nontaxable,
                subtotal_discount = :subtotal_discount, tax_amount = :tax_amount, total_amount = :total_amount
            WHERE id = :id
        ');
        foreach ($targets as $t) {
            $upd->execute([
                ':subtotal_taxable'    => $t['computed']['subtotal_taxable'],
                ':subtotal_nontaxable' => $t['computed']['subtotal_nontaxable'],
                ':subtotal_discount'   => $t['computed']['subtotal_discount'],
                ':tax_amount'          => $t['computed']['tax_amount'],
                ':total_amount'        => $t['computed']['total_amount'],
                ':id'                  => $t['id'],
            ]);
        }
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }

    $result['executed'] = true;
    return $result;
}

if (php_sapi_name() === 'cli' && isset($argv[0]) && realpath($argv[0]) === __FILE__) {
    $dbPath  = $argv[1] ?? dirname(__DIR__) . '/database.sqlite';
    $execute = in_array('--execute', $argv, true);

    $pdo = new PDO('sqlite:' . $dbPath, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $result = r0151RecalcVoucherTotals($pdo, $execute);
    echo json_encode($result, JSON_UNESCAPED_UNICODE) . "\n";
}
