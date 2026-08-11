<?php
/**
 * R-0098 Undo/Redo（元に戻す） API 単体テスト
 *
 * 起動: php api/tests/test_history.php
 *
 * - api/routes/history_helpers.php の recordHistory系・restore系関数は本物をrequireして検証する
 *   （復元ロジックの本物とテストの乖離を防ぐため）。
 * - POST/DELETE側のルーティング処理は他の既存テスト（test_customers.php等）と同じ流儀で、
 *   routes/customers.php・payments.php・invoices.php と同一のロジックをインラインで再現しつつ、
 *   record_historyへの記録は本物のrecordHistory()/recordCustomerUpdateIfChanged()を呼ぶ。
 */

declare(strict_types=1);

$ROOT = dirname(__DIR__);
require_once $ROOT . '/routes/history_helpers.php';

// ============================================================
// 専用テスト DB の準備
// ============================================================
$testDbPath = __DIR__ . '/test_history_' . getmypid() . '.sqlite';
if (file_exists($testDbPath)) {
    unlink($testDbPath);
}
register_shutdown_function(function () use ($testDbPath) {
    $GLOBALS['pdo'] = null;
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

// ============================================================
// テストハーネス
// ============================================================
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

// ============================================================
// routes/*.php と同一ロジックのインライン再現（本物のrecordHistory系関数を呼ぶ）
// ============================================================

function nextInvoiceNoTest(PDO $pdo): string {
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = "invoice"');
    $stmt->execute();
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = "invoice"')->execute([$no]);
    return 'I' . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

function nextPaymentNoTest(PDO $pdo): string {
    $stmt = $pdo->prepare('SELECT last_no FROM sequences WHERE key = "payment"');
    $stmt->execute();
    $no = (int)$stmt->fetchColumn() + 1;
    $pdo->prepare('UPDATE sequences SET last_no = ? WHERE key = "payment"')->execute([$no]);
    return 'P' . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

function insertCustomer(PDO $pdo, array $data = []): int {
    $stmt = $pdo->prepare('
        INSERT INTO customers (name, carry_forward_balance, access_customer_no, is_active)
        VALUES (:name, :carry_forward_balance, :access_customer_no, 1)
    ');
    $stmt->execute([
        ':name'                  => $data['name'] ?? 'テスト得意先',
        ':carry_forward_balance' => $data['carry_forward_balance'] ?? 0,
        ':access_customer_no'    => $data['access_customer_no'] ?? null,
    ]);
    return (int)$pdo->lastInsertId();
}

/** customers.php PUT と同一ロジック（本物のrecordCustomerUpdateIfChangedを呼ぶ） */
function customerPutTest(PDO $pdo, int $id, array $data): array {
    $fields = ['name','name_kana','honorific_type','gender',
               'postal_code','address1','address2','tel','mobile','fax','email',
               'memo','billing_name','billing_date_print',
               'cutoff_day','billing_offset_days','payment_due_days','is_active',
               'access_customer_no'];
    $sets = [];
    $params = [];
    foreach ($fields as $f) {
        if (array_key_exists($f, $data)) {
            $sets[] = "$f = :$f";
            $params[":$f"] = $data[$f];
        }
    }
    $sets[] = 'updated_at = CURRENT_TIMESTAMP';
    $params[':id'] = $id;

    $beforeStmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $beforeStmt->execute([$id]);
    $beforeRow = $beforeStmt->fetch();

    $pdo->prepare('UPDATE customers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);

    $stmt = $pdo->prepare('SELECT * FROM customers WHERE id = ?');
    $stmt->execute([$id]);
    $afterRow = $stmt->fetch();

    if ($beforeRow) {
        recordCustomerUpdateIfChanged($pdo, $beforeRow, $afterRow);
    }
    return $afterRow;
}

/** invoices.php POST と同一ロジック */
function invoicePostTest(PDO $pdo, array $data): array {
    $no = nextInvoiceNoTest($pdo);
    $stmt = $pdo->prepare('
        INSERT INTO invoices
            (invoice_no, customer_id, invoice_date, cutoff_date, billing_date,
             carry_forward, sales_total, tax_total, payment_received,
             invoice_total, next_carry_forward, billing_name_print)
        VALUES
            (:invoice_no, :customer_id, :invoice_date, :cutoff_date, :billing_date,
             :carry_forward, :sales_total, :tax_total, :payment_received,
             :invoice_total, :next_carry_forward, :billing_name_print)
    ');
    $stmt->execute([
        ':invoice_no'         => $no,
        ':customer_id'        => $data['customer_id'],
        ':invoice_date'       => $data['invoice_date'] ?? '2026-08-01',
        ':cutoff_date'        => $data['cutoff_date'] ?? '2026-08-01',
        ':billing_date'       => $data['billing_date'] ?? '2026-08-01',
        ':carry_forward'      => $data['carry_forward'] ?? 0,
        ':sales_total'        => $data['sales_total'] ?? 0,
        ':tax_total'          => $data['tax_total'] ?? 0,
        ':payment_received'   => $data['payment_received'] ?? 0,
        ':invoice_total'      => $data['invoice_total'] ?? 0,
        ':next_carry_forward' => $data['next_carry_forward'] ?? 0,
        ':billing_name_print' => $data['billing_name_print'] ?? '',
    ]);
    $invId = (int)$pdo->lastInsertId();

    if (!empty($data['voucher_ids'])) {
        $ivStmt = $pdo->prepare('INSERT OR IGNORE INTO invoice_vouchers (invoice_id, voucher_id) VALUES (?, ?)');
        foreach ($data['voucher_ids'] as $vid) {
            $ivStmt->execute([$invId, (int)$vid]);
            $pdo->prepare('UPDATE vouchers SET status = "billed", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                ->execute([(int)$vid]);
        }
    }
    if (!empty($data['next_carry_forward'])) {
        $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
            ->execute([$data['next_carry_forward'], $data['customer_id']]);
    }

    $s = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $s->execute([$invId]);
    return $s->fetch();
}

/** invoices.php DELETE と同一ロジック（R-0100 + R-0098。本物のrecordHistoryを呼ぶ） */
function invoiceDeleteTest(PDO $pdo, int $resourceId): array {
    $chk = $pdo->prepare('SELECT COUNT(*) FROM payments WHERE invoice_id = ?');
    $chk->execute([$resourceId]);
    if ((int)$chk->fetchColumn() > 0) {
        return ['code' => 400, 'body' => ['error' => '入金記録があるため削除できません']];
    }

    $invStmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
    $invStmt->execute([$resourceId]);
    $targetInvoice = $invStmt->fetch();

    $iv = $pdo->prepare('SELECT voucher_id FROM invoice_vouchers WHERE invoice_id = ?');
    $iv->execute([$resourceId]);
    $ivRows = $iv->fetchAll();
    $voucherIds = array_map(fn($row) => (int)$row['voucher_id'], $ivRows);
    foreach ($ivRows as $row) {
        $pdo->prepare('UPDATE vouchers SET status = "approved", updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            ->execute([$row['voucher_id']]);
    }
    if ($targetInvoice) {
        recordHistory($pdo, 'invoices', $resourceId, 'delete', $targetInvoice, ['voucher_ids' => $voucherIds]);
    }
    $pdo->prepare('DELETE FROM invoice_vouchers WHERE invoice_id = ?')->execute([$resourceId]);
    $pdo->prepare('DELETE FROM invoices WHERE id = ?')->execute([$resourceId]);

    if ($targetInvoice) {
        $newerStmt = $pdo->prepare('SELECT COUNT(*) FROM invoices WHERE customer_id = ? AND id > ?');
        $newerStmt->execute([$targetInvoice['customer_id'], $resourceId]);
        if ((int)$newerStmt->fetchColumn() === 0) {
            $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                ->execute([$targetInvoice['carry_forward'], $targetInvoice['customer_id']]);
        }
    }
    return ['code' => 200, 'body' => ['deleted' => true]];
}

/** payments.php POST と同一ロジック */
function paymentPostTest(PDO $pdo, array $data): array {
    $no = nextPaymentNoTest($pdo);
    $stmt = $pdo->prepare('
        INSERT INTO payments (payment_no, customer_id, invoice_id, payment_date, amount, payment_type, memo)
        VALUES (:payment_no, :customer_id, :invoice_id, :payment_date, :amount, :payment_type, :memo)
    ');
    $stmt->execute([
        ':payment_no'   => $no,
        ':customer_id'  => $data['customer_id'] ?? null,
        ':invoice_id'   => $data['invoice_id'] ?? null,
        ':payment_date' => $data['payment_date'] ?? '2026-08-01',
        ':amount'       => $data['amount'] ?? 0,
        ':payment_type' => $data['payment_type'] ?? '現金',
        ':memo'         => $data['memo'] ?? null,
    ]);
    $id = (int)$pdo->lastInsertId();

    if (!empty($data['invoice_id'])) {
        $invStmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
        $invStmt->execute([$data['invoice_id']]);
        $inv = $invStmt->fetch();
        if ($inv) {
            $newReceived = (float)$inv['payment_received'] + (float)($data['amount'] ?? 0);
            $newCarryFwd = (float)$inv['invoice_total'] - $newReceived;
            $pdo->prepare('UPDATE invoices SET payment_received = ?, next_carry_forward = ? WHERE id = ?')
                ->execute([$newReceived, $newCarryFwd, $data['invoice_id']]);
            $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                ->execute([$newCarryFwd, $inv['customer_id']]);
        }
    }
    $s = $pdo->prepare('SELECT * FROM payments WHERE id = ?');
    $s->execute([$id]);
    return $s->fetch();
}

/** payments.php DELETE と同一ロジック（本物のrecordHistoryを呼ぶ） */
function paymentDeleteTest(PDO $pdo, int $resourceId): array {
    $stmt = $pdo->prepare('SELECT * FROM payments WHERE id = ?');
    $stmt->execute([$resourceId]);
    $pay = $stmt->fetch();
    $clamped = false;
    if ($pay && $pay['invoice_id']) {
        $invStmt = $pdo->prepare('SELECT * FROM invoices WHERE id = ?');
        $invStmt->execute([$pay['invoice_id']]);
        $inv = $invStmt->fetch();
        if ($inv) {
            $clamped = ((float)$inv['payment_received'] - (float)$pay['amount']) < 0;
            $newReceived = max(0, (float)$inv['payment_received'] - (float)$pay['amount']);
            $newCarryFwd = (float)$inv['invoice_total'] - $newReceived;
            $pdo->prepare('UPDATE invoices SET payment_received = ?, next_carry_forward = ? WHERE id = ?')
                ->execute([$newReceived, $newCarryFwd, $pay['invoice_id']]);
            $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')
                ->execute([$newCarryFwd, $inv['customer_id']]);
        }
    }
    if ($pay) {
        recordHistory($pdo, 'payments', $resourceId, 'delete', $pay, [], null, $clamped);
    }
    $pdo->prepare('DELETE FROM payments WHERE id = ?')->execute([$resourceId]);
    return ['code' => 200, 'body' => ['deleted' => true]];
}

/** history.php POST /history/{id}/restore と同一の分岐ロジック（本物のrestore*を呼ぶ） */
function restoreHistoryTest(PDO $pdo, int $historyId): array {
    $histStmt = $pdo->prepare('SELECT * FROM record_history WHERE id = ?');
    $histStmt->execute([$historyId]);
    $history = $histStmt->fetch();
    if (!$history) {
        return ['code' => 404, 'body' => ['error' => 'Not found']];
    }
    $envelope = json_decode($history['before_json'], true) ?? [];
    $row      = $envelope['row'] ?? [];
    $related  = $envelope['related'] ?? [];

    switch ($history['entity']) {
        case 'customers': $result = restoreCustomerUpdate($pdo, $row); break;
        case 'payments':  $result = restorePaymentDelete($pdo, $row); break;
        case 'invoices':  $result = restoreInvoiceDelete($pdo, $row, $related); break;
        default: return ['code' => 400, 'body' => ['error' => 'unsupported entity']];
    }

    if ($result['code'] >= 200 && $result['code'] < 300) {
        $newEntityId = (int)($result['body']['id'] ?? $history['entity_id']);
        recordHistory(
            $pdo, $history['entity'], $newEntityId, 'restore', $result['body'],
            $history['entity'] === 'invoices' ? ['voucher_ids' => $related['voucher_ids'] ?? []] : []
        );
    }
    return $result;
}

function latestHistoryId(PDO $pdo, string $entity, int $entityId, string $action): int {
    $stmt = $pdo->prepare('SELECT id FROM record_history WHERE entity=? AND entity_id=? AND action=? ORDER BY id DESC LIMIT 1');
    $stmt->execute([$entity, $entityId, $action]);
    return (int)$stmt->fetchColumn();
}

// ============================================================
// テスト本体
// ============================================================
echo "=== R-0098 Undo/Redo API テスト ===\n\n";

// T-01: customers更新の復元で、carry_forward_balance・access_customer_noが変化しないこと
runTest('T-01: customers更新の復元でcarry_forward_balance・access_customer_noは変化しない', function () use ($pdo) {
    $id = insertCustomer($pdo, ['name' => '元の名前', 'carry_forward_balance' => 500, 'access_customer_no' => 'ACN-1']);

    customerPutTest($pdo, $id, ['name' => '変更後の名前', 'tel' => '06-0000-0000']);
    $histId = latestHistoryId($pdo, 'customers', $id, 'update');
    assertTrue($histId > 0, '履歴が記録されている');

    // PUT後に副作用でcarry_forward_balance/access_customer_noが変わった状態を再現
    $pdo->prepare('UPDATE customers SET carry_forward_balance = 999, access_customer_no = ? WHERE id = ?')
        ->execute(['ACN-CHANGED', $id]);

    $res = restoreCustomerUpdate($pdo, json_decode($pdo->query("SELECT before_json FROM record_history WHERE id=$histId")->fetchColumn(), true)['row']);
    assertEq(200, $res['code'], '復元status');
    assertEq('元の名前', $res['body']['name'], '名前が復元前の値に戻る');
    assertEq(999.0, (float)$res['body']['carry_forward_balance'], 'carry_forward_balanceは復元で変化しない');
    assertEq('ACN-CHANGED', $res['body']['access_customer_no'], 'access_customer_noは復元で変化しない');
});

// T-01b: 対象行が存在しない場合のみ404
runTest('T-01b: customers復元は対象行が存在しない場合のみ404', function () use ($pdo) {
    $res = restoreCustomerUpdate($pdo, ['id' => 999999, 'name' => 'いない得意先']);
    assertEq(404, $res['code'], '存在しないIDは404');
});

// T-02: payments削除→復元の往復で金額が元通りになること。payment_noも維持される
runTest('T-02: payments削除→復元の往復でinvoice/customerの金額が元通りになり、payment_noも維持される', function () use ($pdo) {
    $custId = insertCustomer($pdo, ['carry_forward_balance' => 0]);
    $inv = invoicePostTest($pdo, ['customer_id' => $custId, 'invoice_total' => 10000, 'next_carry_forward' => 10000]);
    $pdo->prepare('UPDATE customers SET carry_forward_balance = ? WHERE id = ?')->execute([10000, $custId]);

    $pay = paymentPostTest($pdo, ['customer_id' => $custId, 'invoice_id' => $inv['id'], 'amount' => 10000]);
    $origPaymentNo = $pay['payment_no'];

    paymentDeleteTest($pdo, (int)$pay['id']);
    $histId = latestHistoryId($pdo, 'payments', (int)$pay['id'], 'delete');
    $histRow = $pdo->query("SELECT * FROM record_history WHERE id=$histId")->fetch();
    assertEq(0, (int)$histRow['clamped'], '通常削除はclamped=0');

    $envelope = json_decode($histRow['before_json'], true);
    $res = restorePaymentDelete($pdo, $envelope['row']);
    assertEq(201, $res['code'], '復元status');
    assertEq($origPaymentNo, $res['body']['payment_no'], 'payment_noが維持される');

    $invAfter = $pdo->query("SELECT * FROM invoices WHERE id={$inv['id']}")->fetch();
    assertEq(10000.0, (float)$invAfter['payment_received'], 'invoice.payment_receivedが元通り');
    assertEq(0.0, (float)$invAfter['next_carry_forward'], 'invoice.next_carry_forwardが元通り');
    $custAfter = $pdo->query("SELECT carry_forward_balance FROM customers WHERE id=$custId")->fetch();
    assertEq(0.0, (float)$custAfter['carry_forward_balance'], 'customer.carry_forward_balanceが元通り');
});

// T-03: 間に別の入金を挟んだ状態からの復元で、正しい合計になること（現在値からの再計算の検証）
runTest('T-03: 間に別の入金を挟んだ状態からの復元は現在値からの再計算になる', function () use ($pdo) {
    $custId = insertCustomer($pdo);
    $inv = invoicePostTest($pdo, ['customer_id' => $custId, 'invoice_total' => 10000, 'next_carry_forward' => 10000]);

    $payA = paymentPostTest($pdo, ['customer_id' => $custId, 'invoice_id' => $inv['id'], 'amount' => 3000]);
    paymentDeleteTest($pdo, (int)$payA['id']);
    $histId = latestHistoryId($pdo, 'payments', (int)$payA['id'], 'delete');
    $envelope = json_decode($pdo->query("SELECT before_json FROM record_history WHERE id=$histId")->fetchColumn(), true);

    // 間に別の入金Bが発生（invoice.payment_receivedが2000になる）
    paymentPostTest($pdo, ['customer_id' => $custId, 'invoice_id' => $inv['id'], 'amount' => 2000]);
    $invBefore = $pdo->query("SELECT payment_received FROM invoices WHERE id={$inv['id']}")->fetch();
    assertEq(2000.0, (float)$invBefore['payment_received'], '前提: Bの入金で2000になっている');

    $res = restorePaymentDelete($pdo, $envelope['row']);
    assertEq(201, $res['code'], '復元status');

    $invAfter = $pdo->query("SELECT payment_received, next_carry_forward FROM invoices WHERE id={$inv['id']}")->fetch();
    assertEq(5000.0, (float)$invAfter['payment_received'], '現在値2000+復元3000=5000に再計算される（スナップショット書き戻しではない）');
    assertEq(5000.0, (float)$invAfter['next_carry_forward'], 'next_carry_forwardも再計算値になる');
});

// T-04: クランプ発動ケースの削除→復元で、clamped=1が記録されること
runTest('T-04: クランプ発動ケースの削除でclamped=1が記録される', function () use ($pdo) {
    $custId = insertCustomer($pdo);
    $inv = invoicePostTest($pdo, ['customer_id' => $custId, 'invoice_total' => 10000, 'next_carry_forward' => 10000]);
    $pay = paymentPostTest($pdo, ['customer_id' => $custId, 'invoice_id' => $inv['id'], 'amount' => 3000]);

    // 削除前にinvoice.payment_receivedを人為的にpay.amount未満へ補正（クランプを誘発する状況を再現）
    $pdo->prepare('UPDATE invoices SET payment_received = 1000 WHERE id = ?')->execute([$inv['id']]);

    paymentDeleteTest($pdo, (int)$pay['id']);
    $histId = latestHistoryId($pdo, 'payments', (int)$pay['id'], 'delete');
    $histRow = $pdo->query("SELECT * FROM record_history WHERE id=$histId")->fetch();
    assertEq(1, (int)$histRow['clamped'], 'clamped=1で記録される（1000-3000<0）');

    $invAfter = $pdo->query("SELECT payment_received FROM invoices WHERE id={$inv['id']}")->fetch();
    assertEq(0.0, (float)$invAfter['payment_received'], 'max(0,...)でクランプされている');
});

// T-05: 同一得意先に新しい請求書がある状態での古い請求書の復元で、繰越残高の更新がスキップされること
runTest('T-05: 新しい請求書がある状態での古い請求書の復元は繰越残高更新をスキップする', function () use ($pdo) {
    $custId = insertCustomer($pdo, ['carry_forward_balance' => 0]);
    $invA = invoicePostTest($pdo, ['customer_id' => $custId, 'carry_forward' => 0, 'sales_total' => 3000, 'next_carry_forward' => 3000]);
    $pdo->prepare('UPDATE customers SET carry_forward_balance = 3000 WHERE id = ?')->execute([$custId]);

    invoiceDeleteTest($pdo, (int)$invA['id']);
    $histId = latestHistoryId($pdo, 'invoices', (int)$invA['id'], 'delete');
    $envelope = json_decode($pdo->query("SELECT before_json FROM record_history WHERE id=$histId")->fetchColumn(), true);

    // Aの削除で0に戻った後、新しい請求書Bが作られる
    $invB = invoicePostTest($pdo, ['customer_id' => $custId, 'carry_forward' => 0, 'sales_total' => 2000, 'next_carry_forward' => 2000]);
    $pdo->prepare('UPDATE customers SET carry_forward_balance = 2000 WHERE id = ?')->execute([$custId]);
    assertTrue((int)$invB['id'] > (int)$invA['id'], '前提: Bのidは元のAより新しい');

    $res = restoreInvoiceDelete($pdo, $envelope['row'], $envelope['related']);
    assertEq(201, $res['code'], 'Aの復元自体は成功する');
    assertTrue((bool)$res['body']['carry_forward_skipped'], 'carry_forward_skippedフラグが立つ');

    $custAfter = $pdo->query("SELECT carry_forward_balance FROM customers WHERE id=$custId")->fetch();
    assertEq(2000.0, (float)$custAfter['carry_forward_balance'], 'Bの繰越残高2000のまま変わらない（Aの復元で上書きされない）');
});

// T-06: 二重請求防止ガード（既に別の請求書に紐づいた伝票を含む請求書の復元拒否）
runTest('T-06: 二重請求防止ガード - 既に別の請求書に紐づいた伝票を含む復元は拒否される', function () use ($pdo) {
    $custId = insertCustomer($pdo);
    $vId = (int)$pdo->query("
        INSERT INTO vouchers (voucher_type, status, customer_id, voucher_date, total_amount)
        VALUES ('sales', 'approved', $custId, '2026-08-01', 5000) RETURNING id
    ")->fetchColumn();

    $invA = invoicePostTest($pdo, ['customer_id' => $custId, 'sales_total' => 5000, 'invoice_total' => 5000, 'voucher_ids' => [$vId]]);
    invoiceDeleteTest($pdo, (int)$invA['id']);
    $histId = latestHistoryId($pdo, 'invoices', (int)$invA['id'], 'delete');
    $envelope = json_decode($pdo->query("SELECT before_json FROM record_history WHERE id=$histId")->fetchColumn(), true);

    // 伝票が別の請求書Cに紐づけられる（二重請求のリスク状況を再現）
    invoicePostTest($pdo, ['customer_id' => $custId, 'sales_total' => 5000, 'invoice_total' => 5000, 'voucher_ids' => [$vId]]);

    $invoiceCountBefore = (int)$pdo->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
    $res = restoreInvoiceDelete($pdo, $envelope['row'], $envelope['related']);
    assertEq(409, $res['code'], '二重請求防止ガードで復元拒否される');
    $invoiceCountAfter = (int)$pdo->query('SELECT COUNT(*) FROM invoices')->fetchColumn();
    assertEq($invoiceCountBefore, $invoiceCountAfter, '拒否された場合、請求書は追加作成されない');
});

// T-07: void化されている伝票を含む復元も拒否される
runTest('T-07: 紐づく伝票がvoid化されている場合も復元は拒否される', function () use ($pdo) {
    $custId = insertCustomer($pdo);
    $vId = (int)$pdo->query("
        INSERT INTO vouchers (voucher_type, status, customer_id, voucher_date, total_amount)
        VALUES ('sales', 'approved', $custId, '2026-08-01', 4000) RETURNING id
    ")->fetchColumn();
    $invA = invoicePostTest($pdo, ['customer_id' => $custId, 'sales_total' => 4000, 'invoice_total' => 4000, 'voucher_ids' => [$vId]]);
    invoiceDeleteTest($pdo, (int)$invA['id']);
    $histId = latestHistoryId($pdo, 'invoices', (int)$invA['id'], 'delete');
    $envelope = json_decode($pdo->query("SELECT before_json FROM record_history WHERE id=$histId")->fetchColumn(), true);

    $pdo->prepare("UPDATE vouchers SET status='void' WHERE id=?")->execute([$vId]);

    $res = restoreInvoiceDelete($pdo, $envelope['row'], $envelope['related']);
    assertEq(409, $res['code'], 'void化された伝票を含む復元は拒否される');
});

// T-08: invoice_no/payment_noが復元後も維持され、以降の新規採番と衝突しないこと
runTest('T-08: invoice_no/payment_noは復元後も維持され、以降の新規採番と衝突しない', function () use ($pdo) {
    $custId = insertCustomer($pdo);
    $inv = invoicePostTest($pdo, ['customer_id' => $custId, 'invoice_total' => 1000, 'next_carry_forward' => 1000]);
    $origInvoiceNo = $inv['invoice_no'];
    invoiceDeleteTest($pdo, (int)$inv['id']);
    $histId = latestHistoryId($pdo, 'invoices', (int)$inv['id'], 'delete');
    $envelope = json_decode($pdo->query("SELECT before_json FROM record_history WHERE id=$histId")->fetchColumn(), true);
    $res = restoreInvoiceDelete($pdo, $envelope['row'], $envelope['related']);
    assertEq(201, $res['code'], '復元成功');
    assertEq($origInvoiceNo, $res['body']['invoice_no'], 'invoice_noが維持される');

    // 復元後に新規作成しても番号衝突（UNIQUE制約違反）が起きないこと
    $newInv = invoicePostTest($pdo, ['customer_id' => $custId, 'invoice_total' => 2000, 'next_carry_forward' => 2000]);
    assertTrue($newInv['invoice_no'] !== $origInvoiceNo, '新規採番は復元済み番号と衝突しない');
});

// T-09: payments × delete の復元ガード - 紐づくinvoiceが既に削除されている場合は復元拒否
runTest('T-09: 紐づくinvoiceが既に削除されている場合、payment復元は拒否される', function () use ($pdo) {
    $custId = insertCustomer($pdo);
    $inv = invoicePostTest($pdo, ['customer_id' => $custId, 'invoice_total' => 5000, 'next_carry_forward' => 5000]);
    $pay = paymentPostTest($pdo, ['customer_id' => $custId, 'invoice_id' => $inv['id'], 'amount' => 1000]);
    paymentDeleteTest($pdo, (int)$pay['id']);
    $histId = latestHistoryId($pdo, 'payments', (int)$pay['id'], 'delete');
    $envelope = json_decode($pdo->query("SELECT before_json FROM record_history WHERE id=$histId")->fetchColumn(), true);

    // 請求書自体も削除された状況を再現（入金が既にないため通常DELETEが通る）
    invoiceDeleteTest($pdo, (int)$inv['id']);

    $res = restorePaymentDelete($pdo, $envelope['row']);
    assertEq(409, $res['code'], '紐づくinvoiceが削除済みのため復元拒否');
});

// T-10: 差分ゼロのcustomers更新は記録されないこと
runTest('T-10: customers更新で差分がゼロの場合は記録されない', function () use ($pdo) {
    $id = insertCustomer($pdo, ['name' => '差分なし得意先']);
    $before = (int)$pdo->query('SELECT COUNT(*) FROM record_history')->fetchColumn();
    customerPutTest($pdo, $id, ['name' => '差分なし得意先']); // 同じ値で更新
    $after = (int)$pdo->query('SELECT COUNT(*) FROM record_history')->fetchColumn();
    assertEq($before, $after, '差分がなければrecord_historyに追加されない');
});

// T-11: restore操作自体も履歴に積まれること
runTest('T-11: restore操作自体もrecord_historyにaction=restoreとして記録される', function () use ($pdo) {
    $id = insertCustomer($pdo, ['name' => 'Restore記録テスト']);
    customerPutTest($pdo, $id, ['name' => '更新後の名前']);
    $delHistId = latestHistoryId($pdo, 'customers', $id, 'update');

    restoreHistoryTest($pdo, $delHistId);

    $restoreHistId = latestHistoryId($pdo, 'customers', $id, 'restore');
    assertTrue($restoreHistId > 0, 'action=restoreの履歴が記録されている');
});

// ============================================================
// 結果サマリ
// ============================================================
echo "\n";
echo "結果: {$passed} PASS / {$failed} FAIL\n";
if (!empty($failures)) {
    echo "\n失敗したテスト:\n";
    foreach ($failures as $f) {
        echo "  - $f\n";
    }
    exit(1);
}
exit(0);
