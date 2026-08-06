<?php
/**
 * R-0098: record_history への記録・復元の共有ロジック。
 * customers（更新）・payments（削除）・invoices（削除）の3エンティティを対象とする。
 */

/** record_historyへ1件記録し、挿入したidを返す（削除直後のトースト復元導線で使う） */
function recordHistory(
    PDO $pdo,
    string $entity,
    int $entityId,
    string $action,
    array $beforeRow,
    array $related = [],
    ?array $afterRow = null,
    bool $clamped = false
): int {
    $stmt = $pdo->prepare('
        INSERT INTO record_history (entity, entity_id, action, before_json, after_json, clamped)
        VALUES (:entity, :entity_id, :action, :before_json, :after_json, :clamped)
    ');
    $stmt->execute([
        ':entity'      => $entity,
        ':entity_id'   => $entityId,
        ':action'      => $action,
        ':before_json' => json_encode(['row' => $beforeRow, 'related' => $related], JSON_UNESCAPED_UNICODE),
        ':after_json'  => $afterRow !== null
            ? json_encode(['row' => $afterRow, 'related' => $related], JSON_UNESCAPED_UNICODE)
            : null,
        ':clamped'     => $clamped ? 1 : 0,
    ]);
    return (int)$pdo->lastInsertId();
}

/**
 * customers PUT: 更新前後で実際に値が変わった列が1つでもあれば記録する。差分ゼロなら記録しない。
 */
function recordCustomerUpdateIfChanged(PDO $pdo, array $beforeRow, array $afterRow): void {
    $compareKeys = array_diff(array_keys($beforeRow), ['updated_at']);
    foreach ($compareKeys as $k) {
        if (($beforeRow[$k] ?? null) !== ($afterRow[$k] ?? null)) {
            recordHistory($pdo, 'customers', (int)$beforeRow['id'], 'update', $beforeRow, [], $afterRow);
            return;
        }
    }
}

// ============================================================
// 復元ハンドラ（採番をスキップした専用関数。POSTハンドラの呼び直しではない）
// ============================================================

/**
 * customers × update の復元。
 * 復元カラムはホワイトリスト化し、carry_forward_balance（入金/請求の副作用専用）と
 * access_customer_no（AccessTategu同期が所有するキー列＋UNIQUE制約あり）は除外する。
 * ガード: 対象行が存在しない場合のみ404。
 */
function restoreCustomerUpdate(PDO $pdo, array $row): array {
    $fields = ['name','name_kana','honorific_type','gender',
               'postal_code','address1','address2','tel','mobile','fax','email',
               'memo','billing_name','billing_date_print',
               'cutoff_day','billing_offset_days','payment_due_days','is_active'];

    $checkStmt = $pdo->prepare('SELECT id FROM customers WHERE id = ?');
    $checkStmt->execute([(int)$row['id']]);
    if (!$checkStmt->fetch()) {
        return ['code' => 404, 'body' => ['error' => 'Not found']];
    }

    $sets = [];
    $params = [':id' => (int)$row['id']];
    foreach ($fields as $f) {
        $sets[] = "$f = :$f";
        $params[":$f"] = $row[$f] ?? null;
    }
    $sets[] = 'updated_at = CURRENT_TIMESTAMP';

    try {
        $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);
    } catch (PDOException $e) {
        return ['code' => 409, 'body' => ['error' => '復元できませんでした（データ競合）']];
    }

    $s = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $s->execute([(int)$row['id']]);
    return ['code' => 200, 'body' => $s->fetch()];
}

/**
 * payments × delete の復元。
 * nextPaymentNo()は呼ばず、削除前のpayment_noでINSERTする（sequences.last_noは単調増加のみで
 * 巻き戻らないため番号衝突は起きない）。金額はスナップショットへの巻き戻しではなく、
 * 「復元時点の現在値からの再計算」で行う（間に別の入金/請求を挟んだ状態にも整合する）。
 * ガード: 紐づくinvoiceが既に削除されている場合は復元拒否。
 */
function restorePaymentDelete(PDO $pdo, array $row): array {
    $invoiceId = $row['invoice_id'] ?? null;
    $inv = null;
    if ($invoiceId) {
        $invStmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
        $invStmt->execute([$invoiceId]);
        $inv = $invStmt->fetch();
        if (!$inv) {
            return ['code' => 409, 'body' => ['error' => '紐づく請求書が削除されているため復元できません。先に請求書を復元してください']];
        }
    }

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('
            INSERT INTO payments (payment_no, customer_id, invoice_id, payment_date, amount, payment_type, memo)
            VALUES (:payment_no, :customer_id, :invoice_id, :payment_date, :amount, :payment_type, :memo)
        ');
        $stmt->execute([
            ':payment_no'   => $row['payment_no'],
            ':customer_id'  => $row['customer_id'],
            ':invoice_id'   => $row['invoice_id'],
            ':payment_date' => $row['payment_date'],
            ':amount'       => $row['amount'],
            ':payment_type' => $row['payment_type'],
            ':memo'         => $row['memo'],
        ]);
        $newId = (int)$pdo->lastInsertId();

        if ($invoiceId && $inv) {
            $newReceived = (float)$inv['payment_received'] + (float)$row['amount'];
            $newCarryFwd = (float)$inv['invoice_total'] - $newReceived;
            $pdo->prepare('UPDATE invoices SET payment_received = ?, next_carry_forward = ? WHERE id = ?')
                ->execute([$newReceived, $newCarryFwd, $invoiceId]);
            $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                ->execute([$newCarryFwd, $inv['customer_id']]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $s = $pdo->prepare('SELECT * FROM payments WHERE id = ?');
    $s->execute([$newId]);
    return ['code' => 201, 'body' => $s->fetch()];
}

/**
 * invoices × delete の復元。
 * nextInvoiceNo()は呼ばず、削除前のinvoice_noでINSERTする。related.voucher_idsから
 * invoice_vouchersを再作成し、対象伝票をbilledに戻す。
 * ガード: 紐づく伝票のいずれかが既に別の請求書に紐づけ済み（二重請求防止）、または
 * void化されている場合は復元自体を拒否。
 * 繰越残高の更新スキップ: 同一得意先に削除対象より後（id基準。AUTOINCREMENTで単調増加のため
 * 削除済みidとの比較で判定できる）に作られた請求書が既に存在する場合はスキップする
 * （請求書自体は復元するが繰越上書きは行わない）。
 */
function restoreInvoiceDelete(PDO $pdo, array $row, array $related): array {
    $voucherIds = $related['voucher_ids'] ?? [];

    foreach ($voucherIds as $vid) {
        $vStmt = $pdo->prepare('SELECT status FROM vouchers WHERE id = ?');
        $vStmt->execute([$vid]);
        $status = $vStmt->fetchColumn();
        if ($status === false) {
            continue; // 伝票自体が削除済みの場合は無視して復元を継続する
        }
        if ($status === 'void') {
            return ['code' => 409, 'body' => ['error' => '紐づく伝票が無効化されているため復元できません']];
        }
        $linkStmt = $pdo->prepare('SELECT COUNT(*) FROM invoice_vouchers WHERE voucher_id = ?');
        $linkStmt->execute([$vid]);
        if ((int)$linkStmt->fetchColumn() > 0) {
            return ['code' => 409, 'body' => ['error' => '紐づく伝票が既に別の請求書に紐づけられているため復元できません']];
        }
    }

    $historicalId = (int)$row['id'];
    $customerId = (int)$row['customer_id'];
    $newerStmt = $pdo->prepare('SELECT COUNT(*) FROM invoices WHERE customer_id = ? AND id > ?');
    $newerStmt->execute([$customerId, $historicalId]);
    $hasNewerInvoice = (int)$newerStmt->fetchColumn() > 0;

    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare('
            INSERT INTO invoices
                (invoice_no, customer_id, invoice_date, cutoff_date, billing_date,
                 carry_forward, sales_total, tax_total, payment_received,
                 invoice_total, next_carry_forward, billing_name_print, pdf_path)
            VALUES
                (:invoice_no, :customer_id, :invoice_date, :cutoff_date, :billing_date,
                 :carry_forward, :sales_total, :tax_total, :payment_received,
                 :invoice_total, :next_carry_forward, :billing_name_print, :pdf_path)
        ');
        $stmt->execute([
            ':invoice_no'         => $row['invoice_no'],
            ':customer_id'        => $row['customer_id'],
            ':invoice_date'       => $row['invoice_date'],
            ':cutoff_date'        => $row['cutoff_date'],
            ':billing_date'       => $row['billing_date'],
            ':carry_forward'      => $row['carry_forward'],
            ':sales_total'        => $row['sales_total'],
            ':tax_total'          => $row['tax_total'],
            ':payment_received'   => $row['payment_received'],
            ':invoice_total'      => $row['invoice_total'],
            ':next_carry_forward' => $row['next_carry_forward'],
            ':billing_name_print' => $row['billing_name_print'],
            ':pdf_path'           => $row['pdf_path'] ?? null,
        ]);
        $newId = (int)$pdo->lastInsertId();

        foreach ($voucherIds as $vid) {
            $pdo->prepare('INSERT OR IGNORE INTO invoice_vouchers (invoice_id, voucher_id) VALUES (?, ?)')
                ->execute([$newId, $vid]);
            $pdo->prepare('UPDATE vouchers SET status = "billed", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([$vid]);
        }

        if (!$hasNewerInvoice) {
            $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                ->execute([$row['next_carry_forward'], $customerId]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }

    $s = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $s->execute([$newId]);
    $body = $s->fetch();
    $body['carry_forward_skipped'] = $hasNewerInvoice;
    return ['code' => 201, 'body' => $body];
}
