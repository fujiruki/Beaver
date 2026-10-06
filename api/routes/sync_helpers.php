<?php
/**
 * R-025 Step E-Beaver: AccessTategu からの伝票 push 受信 共通ヘルパ
 *
 * - access_voucher_id を冪等性キーとした upsert
 * - 厳格 validation（customer_access_no / project_id 検証）
 * - INSERT 時は payload の status を使用し、未送信時は 'approved' にフォールバック
 * - 重複時は最新で上書きし、200 OK を黙って返す（Access に「重複」とは返さない）
 */

if (!function_exists('readJsonBody')) {
    function readJsonBody(): array {
        $raw = file_get_contents('php://input');
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}

if (!function_exists('respond')) {
    function respond(int $code, array $body): void {
        http_response_code($code);
        echo json_encode($body, JSON_UNESCAPED_UNICODE);
    }
}

/**
 * 内部例外を error_log に記録し、固定文言で 500 を返す。
 * DB スキーマや内部情報がレスポンスに漏れないようにする。
 */
function respondInternalError(Throwable $e, string $context): void {
    error_log(sprintf(
        '[Beaver sync] %s: %s in %s:%d',
        $context,
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    ));
    respond(500, ['error' => 'internal_error']);
}

/**
 * R-0150: 伝票見出しの consumption_tax_type（消費税区分）の許容値域。
 * 明細行の tax_category（課税/非課税）とは別の値域。
 */
if (!function_exists('allowedConsumptionTaxTypes')) {
    function allowedConsumptionTaxTypes(): array {
        return ['外税/伝票計', '外税/請求計', '内税/伝票計', '内税/請求計'];
    }
}

if (!function_exists('isValidConsumptionTaxType')) {
    function isValidConsumptionTaxType(string $value): bool {
        return in_array($value, allowedConsumptionTaxTypes(), true);
    }
}

/**
 * voucher_date を 'Y-m-d' 形式で検証。不正なら null。
 */
function validateVoucherDate(?string $value): ?string {
    if ($value === null || $value === '') return null;
    $dt = DateTime::createFromFormat('Y-m-d', $value);
    if ($dt === false) return null;
    if ($dt->format('Y-m-d') !== $value) return null;
    return $value;
}

/**
 * R-076 B1-1: DB保存のUTC日時文字列('Y-m-d H:i:s')をJST('Y-m-d H:i:s')に変換する。
 * null/空文字はそのままnullを返す（同期タイムスタンプは全経路でこの表現に統一する）。
 */
if (!function_exists('utcToJst')) {
    function utcToJst(?string $utcDateTime): ?string {
        if ($utcDateTime === null || $utcDateTime === '') return null;
        $dt = new DateTime($utcDateTime, new DateTimeZone('UTC'));
        $dt->setTimezone(new DateTimeZone('Asia/Tokyo'));
        return $dt->format('Y-m-d H:i:s');
    }
}

/**
 * shipped_at を ISO 8601 として検証。不正なら null。
 */
function validateShippedAt(?string $value): ?string {
    if ($value === null || $value === '') return null;
    try {
        new DateTime($value);
        return $value;
    } catch (Exception $_) {
        return null;
    }
}

/**
 * customer_access_no から customer_id を解決。存在しなければ null。
 */
function resolveCustomerId(PDO $pdo, ?string $accessCustomerNo): ?int {
    if ($accessCustomerNo === null || $accessCustomerNo === '') return null;
    $stmt = $pdo->prepare('SELECT id FROM customers WHERE access_customer_no = ?');
    $stmt->execute([$accessCustomerNo]);
    $id = $stmt->fetchColumn();
    return $id ? (int)$id : null;
}

/**
 * R-0152: 0方向への切り捨て（Access の Int/Fix 相当）。
 * 浮動小数点誤差（173.99999999 等）で1円欠けないよう、小数第6位で丸めてから切り捨てる。
 */
function truncTowardZero(float $x): int {
    return (int)round($x, 6);
}

/**
 * R-0152: 伝票合計を明細から計算する（副作用なし）。Access CalcVoucherTotals と同じ規則。
 * 返り値は vouchers の subtotal_taxable / subtotal_nontaxable / subtotal_discount / tax_amount / total_amount。
 * 同じ規則を api/manual/r0151_recalc_voucher_totals.php が自己完結で複製しているため、変更時は両方を直すこと。
 */
function computeVoucherTotals(PDO $pdo, int $voucherId): array {
    $stmt = $pdo->prepare('SELECT voucher_type, voucher_date, delivery_date, tax_input_type, consumption_tax_type FROM vouchers WHERE id = ?');
    $stmt->execute([$voucherId]);
    $v = $stmt->fetch();

    $baseDate = $v['voucher_type'] === 'sales' && !empty($v['delivery_date']) ? $v['delivery_date'] : $v['voucher_date'];
    $taxStmt = $pdo->prepare('SELECT rate FROM tax_rates WHERE valid_from <= ? ORDER BY valid_from DESC LIMIT 1');
    $taxStmt->execute([substr((string)$baseDate, 0, 10)]);
    $taxRate = (float)$taxStmt->fetchColumn();

    $lStmt = $pdo->prepare('SELECT line_type, line_total, tax_category FROM voucher_lines WHERE voucher_id = ?');
    $lStmt->execute([$voucherId]);

    $taxable = 0.0; $nontaxable = 0.0; $discountSum = 0.0;
    foreach ($lStmt->fetchAll() as $l) {
        $amt = (float)$l['line_total'];
        if ($l['line_type'] === 'discount') {
            $discountSum += $amt;
        } elseif ($l['tax_category'] === 'taxable') {
            $taxable += $amt;
        } else {
            $nontaxable += $amt;
        }
    }
    $discount = abs($discountSum);

    if ($v['tax_input_type'] === 'inclusive') {
        $taxAmount       = truncTowardZero($taxable * $taxRate / (1 + $taxRate));
        $subtotalTaxable = $taxable - $taxAmount;
        $total           = $taxable + $nontaxable - $discount;
    } else {
        $taxAmount       = $v['consumption_tax_type'] === '外税/請求計' ? 0 : truncTowardZero($taxable * $taxRate);
        $subtotalTaxable = $taxable;
        $total           = $taxable + $taxAmount + $nontaxable - $discount;
    }

    return [
        'subtotal_taxable'    => $subtotalTaxable,
        'subtotal_nontaxable' => $nontaxable,
        'subtotal_discount'   => $discount,
        'tax_amount'          => $taxAmount,
        'total_amount'        => $total,
    ];
}

/**
 * R-0151 (0) / R-0152: 伝票合計を再計算して vouchers を更新する。
 * $touchUpdatedAt=false は Access同期の受信経路用（updated_at を進めると次回pullでAccessへ送り返されるため）。
 */
function recalcVoucher(PDO $pdo, int $voucherId, bool $touchUpdatedAt = true): void {
    $t = computeVoucherTotals($pdo, $voucherId);
    $pdo->prepare('
        UPDATE vouchers SET
            subtotal_taxable = ?, subtotal_nontaxable = ?, subtotal_discount = ?,
            tax_amount = ?, total_amount = ?' . ($touchUpdatedAt ? ', updated_at = CURRENT_TIMESTAMP' : '') . '
        WHERE id = ?
    ')->execute([
        $t['subtotal_taxable'], $t['subtotal_nontaxable'], $t['subtotal_discount'],
        $t['tax_amount'], $t['total_amount'], $voucherId,
    ]);
}

/**
 * project_id が存在するか確認。
 */
function projectExists(PDO $pdo, int $projectId): bool {
    $stmt = $pdo->prepare('SELECT 1 FROM projects WHERE id = ?');
    $stmt->execute([$projectId]);
    return (bool)$stmt->fetchColumn();
}

/**
 * project_access_no（= projects.id の文字列化）から project_id を解決。存在しなければ null。
 */
function resolveProjectIdById(PDO $pdo, ?string $projectAccessNo): ?int {
    if ($projectAccessNo === null || $projectAccessNo === '') return null;
    $stmt = $pdo->prepare('SELECT id FROM projects WHERE id = ?');
    $stmt->execute([(int)$projectAccessNo]);
    $id = $stmt->fetchColumn();
    return $id ? (int)$id : null;
}

/**
 * R-050: 売上受信時に projects.customer_id を連動更新する。
 *
 * - customer_access_no が null/空 → 何もしない（現状維持）
 * - project_access_no が null/空 → 何もしない
 * - project_access_no が見つからない → WARNING ログのみ、何もしない
 * - customer_access_no で lookup した customer が見つからない → WARNING ログのみ、何もしない
 * - 上記をすべて通過したら projects.customer_id を UPDATE
 */
function updateProjectCustomerFromSales(PDO $pdo, ?string $projectAccessNo, ?string $customerAccessNo): void {
    if ($customerAccessNo === null || $customerAccessNo === '') return;
    if ($projectAccessNo === null || $projectAccessNo === '') return;

    $projectId = resolveProjectIdById($pdo, $projectAccessNo);
    if ($projectId === null) {
        error_log(sprintf(
            '[Beaver R-050] updateProjectCustomerFromSales: project_access_no=%s が projects.id に存在しません',
            $projectAccessNo
        ));
        return;
    }

    $customerId = resolveCustomerId($pdo, $customerAccessNo);
    if ($customerId === null) {
        error_log(sprintf(
            '[Beaver R-050] updateProjectCustomerFromSales: customer_access_no=%s が customers.access_customer_no に存在しません',
            $customerAccessNo
        ));
        return;
    }

    $pdo->prepare('UPDATE projects SET customer_id = :customer_id, updated_at = CURRENT_TIMESTAMP WHERE id = :id')
        ->execute([':customer_id' => $customerId, ':id' => $projectId]);
}

/**
 * AccessTategu の伝票番号と Beaver の voucher_no を分離して保存するため、
 * INSERT 時は Beaver 内部 voucher_no を sequences から採番し、access_voucher_no は別列に格納。
 *
 * race condition 回避のため UPDATE → SELECT 順で原子的に採番する
 * （projects.php の nextProjectCode と同じパターン）。
 */
function nextVoucherNoForSync(PDO $pdo, string $type): string {
    $key = ($type === 'estimate') ? 'estimate' : 'sales';
    $pdo->prepare('UPDATE sequences SET last_no = last_no + 1 WHERE key = ?')->execute([$key]);
    $sel = $pdo->prepare('SELECT last_no FROM sequences WHERE key = ?');
    $sel->execute([$key]);
    $no = (int)$sel->fetchColumn();
    $prefix = ($type === 'estimate') ? 'E' : 'S';
    return $prefix . str_pad((string)$no, 5, '0', STR_PAD_LEFT);
}

/**
 * POST /projects/{id}/vouchers/sync 及び POST /vouchers/sync（project_id=null の過去伝票）
 * 厳格 validation 後、access_voucher_id で upsert。
 */
function syncVoucherUpsert(PDO $pdo, ?int $projectId): void {
    $data = readJsonBody();

    $accessVoucherId = isset($data['access_voucher_id']) ? (int)$data['access_voucher_id'] : 0;
    if ($accessVoucherId <= 0) {
        respond(400, ['error' => 'access_voucher_id は必須です']);
        return;
    }

    $voucherType = $data['voucher_type'] ?? '';
    if (!in_array($voucherType, ['estimate', 'sales'], true)) {
        respond(400, ['error' => 'voucher_type は estimate または sales のみ許可されます']);
        return;
    }

    if ($projectId !== null && !projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません', 'project_id' => $projectId]);
        return;
    }

    $accessCustomerNo = isset($data['customer_access_no']) ? (string)$data['customer_access_no'] : '';
    $customerId = resolveCustomerId($pdo, $accessCustomerNo);
    if ($accessCustomerNo !== '' && $customerId === null) {
        respond(400, [
            'error' => 'customer_access_no が customers.access_customer_no に存在しません',
            'customer_access_no' => $accessCustomerNo,
        ]);
        return;
    }

    $voucherDateRaw = isset($data['voucher_date']) ? (string)$data['voucher_date'] : date('Y-m-d');
    $voucherDate    = validateVoucherDate($voucherDateRaw);
    if ($voucherDate === null) {
        respond(400, ['error' => 'voucher_date は YYYY-MM-DD 形式で指定してください']);
        return;
    }

    if (array_key_exists('total_amount', $data)) {
        if (!is_numeric($data['total_amount'])) {
            respond(400, ['error' => 'total_amount は数値で指定してください']);
            return;
        }
        $totalAmount = (float)$data['total_amount'];
    } else {
        $totalAmount = 0.0;
    }

    // R-034 (a): customer_id 必須化の分岐
    //   - 案件付き伝票（project_id != null）: customer_access_no 必須
    //   - 過去伝票モード（project_id === null）: customer_access_no 空文字/NULL のときに限り
    //     customer_id=NULL で許容（履歴インポート用途）。
    //   ※ accessCustomerNo に値が入っているが解決できない場合は上の分岐で 400 を返している。
    //     ここに到達するのは accessCustomerNo が空のときだけ。
    if ($customerId === null && $projectId !== null) {
        respond(400, ['error' => 'customer_access_no は必須です（案件付き伝票のため）']);
        return;
    }

    $allowedStatuses = ['draft', 'submitted', 'approved', 'billed', 'void'];
    $status = (isset($data['status']) && in_array($data['status'], $allowedStatuses, true))
        ? $data['status']
        : 'approved';

    $accessVoucherNo = isset($data['access_voucher_no']) ? (string)$data['access_voucher_no'] : null;
    $memo            = $data['memo']        ?? null;
    $description     = $data['description'] ?? null;

    // R-066(a): 未同期フィールドを受信して保存する。
    // NOT NULL 列も未送信時は null のままにし、INSERT/UPDATE の SQL 側で既定値補完・既存値保持を行う。
    // （変数を DEFAULT 値で埋めると再同期時に既存値を上書きしてしまうため）
    $tradeType          = isset($data['trade_type'])           ? (string)$data['trade_type']           : null;
    $consumptionTaxType = isset($data['consumption_tax_type']) ? (string)$data['consumption_tax_type'] : null;
    if ($consumptionTaxType !== null && !isValidConsumptionTaxType($consumptionTaxType)) {
        respond(400, ['error' => 'consumption_tax_type は ' . implode('/', allowedConsumptionTaxTypes()) . ' のいずれかで指定してください']);
        return;
    }
    $printDateFlag      = isset($data['print_date_flag'])      ? ($data['print_date_flag'] ? 1 : 0)    : null;
    $printTaxExclFlag   = isset($data['print_tax_excl_flag'])  ? ($data['print_tax_excl_flag'] ? 1 : 0) : null;
    $printCompanySeal   = isset($data['print_company_seal'])   ? ($data['print_company_seal'] ? 1 : 0) : null;
    // sales_category_id: Access の tbl売上種別.ID を Beaver の sales_categories.id に直接マッピング。
    // 両テーブルとも AUTOINCREMENT 整数 PK。初期データは手動で値が一致している前提。
    // 値域の完全一致は運用レベルの確認が必要（未確認の場合は NULL が入る場合あり）。
    $salesCategoryId    = isset($data['sales_category_id']) && is_numeric($data['sales_category_id'])
        ? (int)$data['sales_category_id']
        : null;
    $deliveryDate       = ($voucherType === 'sales' && isset($data['delivery_date']))
        ? validateVoucherDate((string)$data['delivery_date'])
        : null;
    $billingDate        = ($voucherType === 'sales' && isset($data['billing_date']))
        ? validateVoucherDate((string)$data['billing_date'])
        : null;
    $sourceEstimateNo   = ($voucherType === 'sales' && isset($data['source_estimate_no']))
        ? (string)$data['source_estimate_no']
        : null;
    // R-066(b): 有効期限は見積のみ。売上には存在しない。
    $validityPeriod     = ($voucherType === 'estimate' && isset($data['validity_period']))
        ? (string)$data['validity_period']
        : null;

    // R-0143 A-B-02: Accessの請求済みロック関連フィールド。未送信ならnullのままにし、
    // INSERT/UPDATEのSQL側で既定値補完・既存値保護を行う（他の未同期フィールドと同じパターン）。
    $accessBilledFlag    = array_key_exists('billed_flag', $data) ? ($data['billed_flag'] ? 1 : 0) : null;
    $accessBillingDate   = isset($data['billing_date']) ? validateVoucherDate((string)$data['billing_date']) : null;
    $accessReceivableId  = isset($data['receivable_id']) && is_numeric($data['receivable_id'])
        ? (int)$data['receivable_id']
        : null;

    $pdo->beginTransaction();
    try {
        // race condition 回避: INSERT...ON CONFLICT(access_voucher_id) DO UPDATE で原子的に upsert する。
        // 既存行があるかを事前に判定するため、voucher_no の採番は事前に行うが、
        // CONFLICT 時は excluded.voucher_no を使わず既存の voucher_no を保持する。
        $existsStmt = $pdo->prepare('SELECT id, voucher_no FROM vouchers WHERE access_voucher_id = ?');
        $existsStmt->execute([$accessVoucherId]);
        $existing = $existsStmt->fetch();

        if ($existing) {
            $voucherNo = (string)$existing['voucher_no'];
        } else {
            $voucherNo = nextVoucherNoForSync($pdo, $voucherType);
        }

        $pdo->prepare('
            INSERT INTO vouchers
                (voucher_no, voucher_type, status, project_id, customer_id,
                 voucher_date, total_amount, access_voucher_id, access_voucher_no,
                 memo, description,
                 trade_type, consumption_tax_type,
                 print_date_flag, print_tax_excl_flag, print_company_seal,
                 sales_category_id, delivery_date, billing_date, source_estimate_no,
                 validity_period, last_synced_at,
                 access_billed_flag, access_billing_date, access_receivable_id)
            VALUES
                (:voucher_no, :voucher_type, :status, :project_id, :customer_id,
                 :voucher_date, :total_amount, :access_voucher_id, :access_voucher_no,
                 :memo, :description,
                 :trade_type,
                 -- NOT NULL 列: fresh INSERT で未送信(null)ならスキーマ既定値を補完する。
                 COALESCE(:consumption_tax_type, ' . "'外税/伝票計'" . '),
                 COALESCE(:print_date_flag, 1), COALESCE(:print_tax_excl_flag, 0), COALESCE(:print_company_seal, 0),
                 :sales_category_id, :delivery_date, :billing_date, :source_estimate_no,
                 :validity_period, CURRENT_TIMESTAMP,
                 COALESCE(:access_billed_flag, 0), :access_billing_date, :access_receivable_id)
            ON CONFLICT(access_voucher_id) DO UPDATE SET
                voucher_type        = excluded.voucher_type,
                status              = excluded.status,
                -- R-034 review MEDIUM-1 対応:
                --   customer_id / project_id は COALESCE で既存値を保護する。
                --   理由: 案件付き伝票 (customer_id=42, project_id=10) として一度同期された伝票が、
                --   Access 側で操作ミス等により過去伝票モード (project_id=NULL, customer_access_no が空)
                --   で再 push された場合、無条件上書きすると customer_id / project_id が NULL に
                --   degrade してしまう。降格は実運用上ありえない誤操作のため、防御的に既存値を保持する。
                --   新しい値が NULL のときは既存値を維持し、非 NULL のときは新しい値で更新する。
                project_id          = COALESCE(excluded.project_id, project_id),
                customer_id         = COALESCE(excluded.customer_id, customer_id),
                voucher_date        = excluded.voucher_date,
                total_amount        = excluded.total_amount,
                access_voucher_no   = excluded.access_voucher_no,
                memo                = excluded.memo,
                description         = excluded.description,
                trade_type          = COALESCE(excluded.trade_type, trade_type),
                -- R-066 回帰対応: NOT NULL 列は excluded(=VALUES句で既定値補完済み)ではなく
                --   生バインド :x を参照する。再同期で未送信(null)なら既存値を保持し、
                --   送信ありなら新しい値で更新する。VALUES句の COALESCE は fresh INSERT 専用。
                consumption_tax_type = COALESCE(:consumption_tax_type, consumption_tax_type),
                print_date_flag     = COALESCE(:print_date_flag, print_date_flag),
                print_tax_excl_flag = COALESCE(:print_tax_excl_flag, print_tax_excl_flag),
                print_company_seal  = COALESCE(:print_company_seal, print_company_seal),
                sales_category_id   = COALESCE(excluded.sales_category_id, sales_category_id),
                delivery_date       = COALESCE(excluded.delivery_date, delivery_date),
                billing_date        = COALESCE(excluded.billing_date, billing_date),
                source_estimate_no  = COALESCE(excluded.source_estimate_no, source_estimate_no),
                validity_period     = COALESCE(excluded.validity_period, validity_period),
                updated_at          = CURRENT_TIMESTAMP,
                last_synced_at      = CURRENT_TIMESTAMP,
                -- R-0143 A-B-02: excludedはVALUES句でCOALESCE済みのため使わず、生バインドで
                --   未送信(null)なら既存値を保持する（他のNOT NULL列と同じパターン）。
                access_billed_flag   = COALESCE(:access_billed_flag, access_billed_flag),
                access_billing_date  = COALESCE(excluded.access_billing_date, access_billing_date),
                access_receivable_id = COALESCE(excluded.access_receivable_id, access_receivable_id)
        ')->execute([
            ':voucher_no'          => $voucherNo,
            ':voucher_type'        => $voucherType,
            ':status'              => $status,
            ':project_id'          => $projectId,
            ':customer_id'         => $customerId,
            ':voucher_date'        => $voucherDate,
            ':total_amount'        => $totalAmount,
            ':access_voucher_id'   => $accessVoucherId,
            ':access_voucher_no'   => $accessVoucherNo,
            ':memo'                => $memo,
            ':description'         => $description,
            ':trade_type'          => $tradeType,
            ':consumption_tax_type' => $consumptionTaxType,
            ':print_date_flag'     => $printDateFlag,
            ':print_tax_excl_flag' => $printTaxExclFlag,
            ':print_company_seal'  => $printCompanySeal,
            ':sales_category_id'   => $salesCategoryId,
            ':delivery_date'       => $deliveryDate,
            ':billing_date'        => $billingDate,
            ':source_estimate_no'  => $sourceEstimateNo,
            ':validity_period'     => $validityPeriod,
            ':access_billed_flag'    => $accessBilledFlag,
            ':access_billing_date'   => $accessBillingDate,
            ':access_receivable_id'  => $accessReceivableId,
        ]);

        if ($existing) {
            $voucherId = (int)$existing['id'];
        } else {
            $voucherId = (int)$pdo->lastInsertId();
        }

        // R-0143 A-B-03: lines_mode を自動判定して同期する（Beaver 編集済み明細を保護）。
        $lineError = syncLinesAutoMode($pdo, $voucherId, $data);
        if ($lineError !== null) {
            $pdo->rollBack();
            respond(422, $lineError);
            return;
        }


        // R-050: 売上受信時に projects.customer_id を連動更新する。
        // payload の project_access_no (= project_code) と customer_access_no を使って
        // projects テーブルの customer_id を最新の紐付けで上書きする。
        // ガード条件は updateProjectCustomerFromSales 内で処理される。
        if ($voucherType === 'sales') {
            $projectAccessNo  = isset($data['project_access_no'])  ? (string)$data['project_access_no']  : null;
            $customerAccessNoForProject = $accessCustomerNo !== '' ? $accessCustomerNo : null;
            updateProjectCustomerFromSales($pdo, $projectAccessNo, $customerAccessNoForProject);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondInternalError($e, 'syncVoucherUpsert');
        return;
    }

    // A-B-09: pushしたAccess側が自分のpushを競合と誤検知しないよう、応答にlast_synced_atを含める。
    $lastSyncedAtStmt = $pdo->prepare('SELECT last_synced_at FROM vouchers WHERE id = ?');
    $lastSyncedAtStmt->execute([$voucherId]);
    $lastSyncedAt = $lastSyncedAtStmt->fetchColumn();

    respond(200, [
        'voucher_id'      => $voucherId,
        'voucher_no'      => $voucherNo,
        'status'          => 'synced',
        'last_synced_at'  => utcToJst($lastSyncedAt !== false ? $lastSyncedAt : null),
    ]);
}

/**
 * R-0143 A-B-03: 明細同期モードの自動判定。
 * lines_mode='replace' が明示されていれば常に全置換（優先度最高、既存動作を維持）。
 * 未指定なら edited_in_beaver=1 の行が1件も無いときのみ自動的に全置換し、
 * 1件でもあれば Beaver 編集済み明細を保護して何もしない（R-066由来の保護の意図を維持）。
 * 戻り値は insertSyncedLines と同じ: 不正値があれば配列、正常系は null。
 */
function syncLinesAutoMode(PDO $pdo, int $voucherId, array $data): ?array {
    if (($data['lines_mode'] ?? null) === 'replace') {
        return replaceSyncedLinesFromPayload($pdo, $voucherId, $data);
    }
    if (empty($data['lines']) || !is_array($data['lines'])) {
        return null;
    }
    if (hasEditedInBeaverLines($pdo, $voucherId)) {
        return null;
    }
    $pdo->prepare('DELETE FROM voucher_lines WHERE voucher_id = ?')->execute([$voucherId]);
    return insertSyncedLines($pdo, $voucherId, $data['lines']);
}

/**
 * 当該伝票に Beaver 編集済み（edited_in_beaver=1）の明細行が1件でもあるか判定する。
 */
function hasEditedInBeaverLines(PDO $pdo, int $voucherId): bool {
    $stmt = $pdo->prepare('SELECT EXISTS(SELECT 1 FROM voucher_lines WHERE voucher_id = ? AND edited_in_beaver = 1)');
    $stmt->execute([$voucherId]);
    return (bool)$stmt->fetchColumn();
}

/**
 * R-0151 (3): Access採用 payload(lines_mode=replace) では access_line_id をキーに
 * 既存明細を upsert する（全DELETE→INSERTだと id が振り直され、costs/prices も消えてしまうため）。
 * 処理完了後に recalcVoucher を呼び、total_amount 等を明細から再計算する。
 */
function replaceSyncedLinesFromPayload(PDO $pdo, int $voucherId, array $data): ?array {
    if (($data['lines_mode'] ?? null) !== 'replace') {
        return null;
    }
    if (!array_key_exists('lines', $data) || !is_array($data['lines'])) {
        return [
            'error' => 'invalid_lines',
            'field' => 'lines',
        ];
    }

    $lineError = upsertSyncedLines($pdo, $voucherId, $data['lines']);
    if ($lineError !== null) {
        return $lineError;
    }

    recalcVoucher($pdo, $voucherId, false);
    return null;
}

/**
 * R-0151 (3): payload の lines を access_line_id キーで既存 voucher_lines と突き合わせ、
 * 一致する行は UPDATE（id・voucher_line_costs/pricesはそのまま維持）、
 * 一致しない新規行は INSERT、payload に無い既存行（access_line_id が NULL の行も含む）は DELETE する。
 * この経路では edited_in_beaver 保護は適用しない（Access採用＝Access版が正のため）。
 * 不正値が見つかった場合は INSERT を中断し、422 のレスポンスボディ用配列を返す（正常系は null）。
 */
function upsertSyncedLines(PDO $pdo, int $voucherId, array $lines): ?array {
    $allowedLineTypes     = ['normal', 'discount', 'subtotal'];
    $allowedTaxCategories = ['課税', '非課税'];

    $existingStmt = $pdo->prepare('SELECT id, access_line_id FROM voucher_lines WHERE voucher_id = ?');
    $existingStmt->execute([$voucherId]);
    $existingByAccessId = [];
    $existingIds = [];
    foreach ($existingStmt->fetchAll() as $row) {
        $existingIds[] = (int)$row['id'];
        if ($row['access_line_id'] !== null) {
            $existingByAccessId[(int)$row['access_line_id']] = (int)$row['id'];
        }
    }

    $lineNo = 1;
    $matchedAccessIds = [];
    $toUpdate = [];
    $toInsert = [];

    foreach ($lines as $line) {
        if (!is_array($line)) { $lineNo++; continue; }

        $lineType = $line['line_type'] ?? 'normal';
        if (!in_array($lineType, $allowedLineTypes, true)) {
            return ['error' => 'invalid_line', 'field' => 'line_type', 'value' => $lineType, 'line_no' => $lineNo];
        }

        $taxCategory = $line['tax_category'] ?? '課税';
        if (!in_array($taxCategory, $allowedTaxCategories, true)) {
            return ['error' => 'invalid_line', 'field' => 'tax_category', 'value' => $taxCategory, 'line_no' => $lineNo];
        }

        $quantityRaw = $line['quantity'] ?? 1;
        if (!is_numeric($quantityRaw)) {
            return ['error' => 'invalid_line', 'field' => 'quantity', 'value' => $quantityRaw, 'line_no' => $lineNo];
        }

        $lineTotalRaw = $line['line_total'] ?? 0;
        if (!is_numeric($lineTotalRaw)) {
            return ['error' => 'invalid_line', 'field' => 'line_total', 'value' => $lineTotalRaw, 'line_no' => $lineNo];
        }

        $accessLineId = isset($line['access_line_id']) ? (int)$line['access_line_id'] : null;
        $normalized = [
            'line_no'        => isset($line['line_no']) ? (int)$line['line_no'] : $lineNo,
            'line_type'      => $lineType,
            'item_name'      => $line['item_name'] ?? null,
            'quantity'       => (float)$quantityRaw,
            'price_body'     => isset($line['price_body'])     ? (float)$line['price_body']     : 0.0,
            'price_hardware' => isset($line['price_hardware']) ? (float)$line['price_hardware'] : 0.0,
            'price_glass'    => isset($line['price_glass'])    ? (float)$line['price_glass']    : 0.0,
            'line_total'     => (float)$lineTotalRaw,
            'tax_category'   => $taxCategory === '課税' ? 'taxable' : 'non_taxable',
            'memo'           => $line['memo'] ?? null,
            'access_line_id' => $accessLineId,
        ];

        if ($accessLineId !== null && isset($existingByAccessId[$accessLineId])) {
            $matchedAccessIds[$accessLineId] = true;
            $toUpdate[] = ['id' => $existingByAccessId[$accessLineId]] + $normalized;
        } else {
            $toInsert[] = $normalized;
        }

        $lineNo++;
    }

    // payload に無い既存行（access_line_id が NULL の行も含む）を DELETE
    // CASCADE で voucher_line_costs/voucher_line_prices も削除される（想定通り）
    $matchedIds = array_map(fn($u) => $u['id'], $toUpdate);
    $deleteIds = array_diff($existingIds, $matchedIds);
    if (!empty($deleteIds)) {
        $placeholders = implode(',', array_fill(0, count($deleteIds), '?'));
        $pdo->prepare("DELETE FROM voucher_lines WHERE id IN ($placeholders)")->execute(array_values($deleteIds));
    }

    // line_no の UNIQUE(voucher_id, line_no) 制約に抵触しないよう、
    // 一旦負値へ退避してから本来の line_no を設定する（行同士の入れ替えに対応するため）
    foreach ($toUpdate as $u) {
        $pdo->prepare('UPDATE voucher_lines SET line_no = ? WHERE id = ?')->execute([-$u['id'], $u['id']]);
    }
    $upd = $pdo->prepare('
        UPDATE voucher_lines SET
            line_no = :line_no, line_type = :line_type, item_name = :item_name, quantity = :quantity,
            price_body = :price_body, price_hardware = :price_hardware, price_glass = :price_glass,
            line_total = :line_total, tax_category = :tax_category, memo = :memo,
            edited_in_beaver = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
    ');
    foreach ($toUpdate as $u) {
        $upd->execute([
            ':line_no'       => $u['line_no'],
            ':line_type'     => $u['line_type'],
            ':item_name'     => $u['item_name'],
            ':quantity'      => $u['quantity'],
            ':price_body'    => $u['price_body'],
            ':price_hardware' => $u['price_hardware'],
            ':price_glass'   => $u['price_glass'],
            ':line_total'    => $u['line_total'],
            ':tax_category'  => $u['tax_category'],
            ':memo'          => $u['memo'],
            ':id'            => $u['id'],
        ]);
    }

    if (!empty($toInsert)) {
        $ins = $pdo->prepare('
            INSERT INTO voucher_lines
                (voucher_id, line_no, line_type, item_name, quantity,
                 price_body, price_hardware, price_glass,
                 line_total, tax_category, memo,
                 source, access_line_id, edited_in_beaver, updated_at)
            VALUES
                (:voucher_id, :line_no, :line_type, :item_name, :quantity,
                 :price_body, :price_hardware, :price_glass,
                 :line_total, :tax_category, :memo,
                 :source, :access_line_id, 0, CURRENT_TIMESTAMP)
        ');
        foreach ($toInsert as $n) {
            $ins->execute([
                ':voucher_id'     => $voucherId,
                ':line_no'        => $n['line_no'],
                ':line_type'      => $n['line_type'],
                ':item_name'      => $n['item_name'],
                ':quantity'       => $n['quantity'],
                ':price_body'     => $n['price_body'],
                ':price_hardware' => $n['price_hardware'],
                ':price_glass'    => $n['price_glass'],
                ':line_total'     => $n['line_total'],
                ':tax_category'   => $n['tax_category'],
                ':memo'           => $n['memo'],
                ':source'         => 'access',
                ':access_line_id' => $n['access_line_id'],
            ]);
        }
    }

    return null;
}

/**
 * lines を最小フィールドで INSERT する。
 * R-066(c): source / access_line_id / edited_in_beaver / price_body /
 *           price_hardware / price_glass を追加。
 *
 * R-034 (c): line_type / tax_category / quantity / line_total を厳格に検証。
 * 不正値が見つかった場合は INSERT を中断し、422 のレスポンスボディ用配列を返す。
 * 正常系（不正なし）は null を返す。
 */
function insertSyncedLines(PDO $pdo, int $voucherId, array $lines): ?array {
    $allowedLineTypes    = ['normal', 'discount', 'subtotal'];
    $allowedTaxCategories = ['課税', '非課税'];

    $lineNo = 1;
    // Access側のpayloadに明細単位の更新日時は含まれないため、Beaverが受信した時刻をCURRENT_TIMESTAMPで明示セットする。
    $ins = $pdo->prepare('
        INSERT INTO voucher_lines
            (voucher_id, line_no, line_type, item_name, quantity,
             price_body, price_hardware, price_glass,
             line_total, tax_category, memo,
             source, access_line_id, edited_in_beaver, updated_at)
        VALUES
            (:voucher_id, :line_no, :line_type, :item_name, :quantity,
             :price_body, :price_hardware, :price_glass,
             :line_total, :tax_category, :memo,
             :source, :access_line_id, 0, CURRENT_TIMESTAMP)
    ');
    foreach ($lines as $line) {
        if (!is_array($line)) continue;

        $lineType = $line['line_type'] ?? 'normal';
        if (!in_array($lineType, $allowedLineTypes, true)) {
            return [
                'error'   => 'invalid_line',
                'field'   => 'line_type',
                'value'   => $lineType,
                'line_no' => $lineNo,
            ];
        }

        $taxCategory = $line['tax_category'] ?? '課税';
        if (!in_array($taxCategory, $allowedTaxCategories, true)) {
            return [
                'error'   => 'invalid_line',
                'field'   => 'tax_category',
                'value'   => $taxCategory,
                'line_no' => $lineNo,
            ];
        }

        $quantityRaw = $line['quantity'] ?? 1;
        if (!is_numeric($quantityRaw)) {
            return [
                'error'   => 'invalid_line',
                'field'   => 'quantity',
                'value'   => $quantityRaw,
                'line_no' => $lineNo,
            ];
        }
        // R-0140 (1): AccessTategu 側は quantity に小数・負数・0 を許容する（値引行は quantity=-1 固定）ため、
        // is_numeric の判定のみ残し、負数拒否は撤廃する。
        $quantity = (float)$quantityRaw;

        $lineTotalRaw = $line['line_total'] ?? 0;
        if (!is_numeric($lineTotalRaw)) {
            return [
                'error'   => 'invalid_line',
                'field'   => 'line_total',
                'value'   => $lineTotalRaw,
                'line_no' => $lineNo,
            ];
        }
        $lineTotal = (float)$lineTotalRaw;

        $dbTaxCategory = $taxCategory === '課税' ? 'taxable' : 'non_taxable';
        $ins->execute([
            ':voucher_id'    => $voucherId,
            ':line_no'       => isset($line['line_no']) ? (int)$line['line_no'] : $lineNo,
            ':line_type'     => $lineType,
            ':item_name'     => $line['item_name'] ?? null,
            ':quantity'      => $quantity,
            ':price_body'    => isset($line['price_body'])     ? (float)$line['price_body']     : 0.0,
            ':price_hardware' => isset($line['price_hardware']) ? (float)$line['price_hardware'] : 0.0,
            ':price_glass'   => isset($line['price_glass'])    ? (float)$line['price_glass']    : 0.0,
            ':line_total'    => $lineTotal,
            ':tax_category'  => $dbTaxCategory,
            ':memo'          => $line['memo'] ?? null,
            ':source'        => 'access',
            ':access_line_id' => isset($line['access_line_id']) ? (int)$line['access_line_id'] : null,
        ]);
        $lineNo++;
    }
    return null;
}

/**
 * PUT /projects/{id}/vouchers/{voucher_no}
 * voucher_no は AccessTategu 側の access_voucher_no で検索する仕様（設計書 §8.5）。
 *
 * R-055: access_voucher_no が未登録の場合は 404 ではなく新規 INSERT (upsert) する。
 * AccessTategu の既存売上が Beaver に未登録でも push が成功するようにする。
 */
function syncVoucherUpdate(PDO $pdo, int $projectId, string $accessVoucherNo): void {
    $data = readJsonBody();

    if (!projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません']);
        return;
    }

    $voucherType = $data['voucher_type'] ?? null;
    if ($voucherType !== null && !in_array($voucherType, ['estimate', 'sales'], true)) {
        respond(400, ['error' => 'voucher_type は estimate または sales のみ許可されます']);
        return;
    }

    $accessCustomerNo = isset($data['customer_access_no']) ? (string)$data['customer_access_no'] : null;
    $customerId = null;
    if ($accessCustomerNo !== null) {
        $customerId = resolveCustomerId($pdo, $accessCustomerNo);
        if ($customerId === null) {
            respond(400, [
                'error' => 'customer_access_no が customers.access_customer_no に存在しません',
            ]);
            return;
        }
    }

    $voucherDate = null;
    if (array_key_exists('voucher_date', $data)) {
        $voucherDate = validateVoucherDate(isset($data['voucher_date']) ? (string)$data['voucher_date'] : null);
        if ($voucherDate === null) {
            respond(400, ['error' => 'voucher_date は YYYY-MM-DD 形式で指定してください']);
            return;
        }
    }

    $totalAmount = null;
    if (array_key_exists('total_amount', $data)) {
        if (!is_numeric($data['total_amount'])) {
            respond(400, ['error' => 'total_amount は数値で指定してください']);
            return;
        }
        $totalAmount = (float)$data['total_amount'];
    }

    // R-035 (b): access_voucher_no 重複時の防御。
    // R-029 の access_voucher_id UNIQUE 制約で根本対処されるが、防御的に LIMIT 1 を明示し、
    // 2 件以上ヒットした場合は警告ログを残す。業務影響を抑えるため処理自体は継続する。
    $dupStmt = $pdo->prepare('SELECT id FROM vouchers WHERE access_voucher_no = ? ORDER BY id ASC');
    $dupStmt->execute([$accessVoucherNo]);
    $dupIds = $dupStmt->fetchAll(PDO::FETCH_COLUMN);
    if (count($dupIds) > 1) {
        error_log(sprintf(
            '[Beaver sync] syncVoucherUpdate: access_voucher_no=%s が %d 件ヒット (ids=%s)。先頭を更新します。',
            $accessVoucherNo,
            count($dupIds),
            implode(',', $dupIds)
        ));
    }

    $stmt = $pdo->prepare('SELECT id, voucher_no FROM vouchers WHERE access_voucher_no = ? ORDER BY id ASC LIMIT 1');
    $stmt->execute([$accessVoucherNo]);
    $target = $stmt->fetch();

    // R-066(a): 未同期フィールドをここで受信して保存する（syncVoucherUpsert と同様）。
    // NOT NULL 列も未送信時は null のままにし、UPDATE 分岐の null ガードで既存値を保持、
    // else（fresh INSERT）分岐の VALUES 句で既定値補完を行う。
    $tradeType          = isset($data['trade_type'])           ? (string)$data['trade_type']           : null;
    $consumptionTaxType = isset($data['consumption_tax_type']) ? (string)$data['consumption_tax_type'] : null;
    if ($consumptionTaxType !== null && !isValidConsumptionTaxType($consumptionTaxType)) {
        respond(400, ['error' => 'consumption_tax_type は ' . implode('/', allowedConsumptionTaxTypes()) . ' のいずれかで指定してください']);
        return;
    }
    $printDateFlag      = isset($data['print_date_flag'])      ? ($data['print_date_flag'] ? 1 : 0)    : null;
    $printTaxExclFlag   = isset($data['print_tax_excl_flag'])  ? ($data['print_tax_excl_flag'] ? 1 : 0) : null;
    $printCompanySeal   = isset($data['print_company_seal'])   ? ($data['print_company_seal'] ? 1 : 0) : null;
    $salesCategoryId    = isset($data['sales_category_id']) && is_numeric($data['sales_category_id'])
        ? (int)$data['sales_category_id']
        : null;
    $deliveryDate       = ($voucherType === 'sales' && isset($data['delivery_date']))
        ? validateVoucherDate((string)$data['delivery_date'])
        : null;
    $billingDateUpd     = ($voucherType === 'sales' && isset($data['billing_date']))
        ? validateVoucherDate((string)$data['billing_date'])
        : null;
    $sourceEstimateNo   = ($voucherType === 'sales' && isset($data['source_estimate_no']))
        ? (string)$data['source_estimate_no']
        : null;
    // R-066(b): 有効期限は見積のみ。売上には存在しない。
    $validityPeriodUpd  = ($voucherType === 'estimate' && isset($data['validity_period']))
        ? (string)$data['validity_period']
        : null;

    try {
        $pdo->beginTransaction();
        if ($target) {
            // 既存レコードあり → UPDATE
            $sets = [];
            $params = [':id' => (int)$target['id']];
            $allowedStatuses = ['draft', 'submitted', 'approved', 'billed', 'void'];
            if ($voucherType !== null)  { $sets[] = 'voucher_type = :voucher_type'; $params[':voucher_type'] = $voucherType; }
            if (isset($data['status']) && in_array($data['status'], $allowedStatuses, true)) {
                $sets[] = 'status = :status';
                $params[':status'] = $data['status'];
            }
            if ($customerId !== null)      { $sets[] = 'customer_id = :customer_id';       $params[':customer_id']         = $customerId; }
            if ($voucherDate !== null)     { $sets[] = 'voucher_date = :voucher_date';      $params[':voucher_date']        = $voucherDate; }
            if ($totalAmount !== null)     { $sets[] = 'total_amount = :total_amount';      $params[':total_amount']        = $totalAmount; }
            if (isset($data['memo']))      { $sets[] = 'memo = :memo';                      $params[':memo']                = $data['memo']; }
            if (isset($data['description'])) { $sets[] = 'description = :description';     $params[':description']         = $data['description']; }
            if ($tradeType !== null)       { $sets[] = 'trade_type = :trade_type';          $params[':trade_type']          = $tradeType; }
            if ($consumptionTaxType !== null) { $sets[] = 'consumption_tax_type = :consumption_tax_type'; $params[':consumption_tax_type'] = $consumptionTaxType; }
            if ($printDateFlag !== null)   { $sets[] = 'print_date_flag = :print_date_flag'; $params[':print_date_flag']   = $printDateFlag; }
            if ($printTaxExclFlag !== null) { $sets[] = 'print_tax_excl_flag = :print_tax_excl_flag'; $params[':print_tax_excl_flag'] = $printTaxExclFlag; }
            if ($printCompanySeal !== null) { $sets[] = 'print_company_seal = :print_company_seal'; $params[':print_company_seal'] = $printCompanySeal; }
            if ($salesCategoryId !== null) { $sets[] = 'sales_category_id = :sales_category_id'; $params[':sales_category_id'] = $salesCategoryId; }
            if ($deliveryDate !== null)    { $sets[] = 'delivery_date = :delivery_date';    $params[':delivery_date']       = $deliveryDate; }
            if ($billingDateUpd !== null)  { $sets[] = 'billing_date = :billing_date';      $params[':billing_date']        = $billingDateUpd; }
            if ($sourceEstimateNo !== null) { $sets[] = 'source_estimate_no = :source_estimate_no'; $params[':source_estimate_no'] = $sourceEstimateNo; }
            if ($validityPeriodUpd !== null) { $sets[] = 'validity_period = :validity_period'; $params[':validity_period'] = $validityPeriodUpd; }
            $sets[] = 'project_id = :project_id';
            $params[':project_id'] = $projectId;
            $sets[] = 'updated_at = CURRENT_TIMESTAMP';

            $pdo->prepare('UPDATE vouchers SET ' . implode(', ', $sets) . ' WHERE id = :id')->execute($params);

            $voucherId = (int)$target['id'];
            $lineError = replaceSyncedLinesFromPayload($pdo, $voucherId, $data);
            if ($lineError !== null) {
                $pdo->rollBack();
                respond(422, $lineError);
                return;
            }

            $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $s->execute([$voucherId]);
            $body = $s->fetch() ?: [];
            $pdo->commit();
            respond(200, $body);
        } else {
            // R-055: 未登録 access_voucher_no → INSERT (upsert)
            $insertType = $voucherType ?? 'sales';
            $insertVoucherNo = nextVoucherNoForSync($pdo, $insertType);
            $insertDate = $voucherDate ?? date('Y-m-d');
            $insertTotal = $totalAmount ?? 0.0;
            $insertMemo = $data['memo'] ?? null;
            $insertDescription = $data['description'] ?? null;

            $allowedStatuses = ['draft', 'submitted', 'approved', 'billed', 'void'];
            $insertStatus = (isset($data['status']) && in_array($data['status'], $allowedStatuses, true))
                ? $data['status']
                : 'approved';

            $accessVoucherIdFromPayload = isset($data['access_voucher_id']) ? (int)$data['access_voucher_id'] : null;

            $pdo->prepare('
                INSERT INTO vouchers
                    (voucher_no, voucher_type, status, project_id, customer_id,
                     voucher_date, total_amount, access_voucher_no, access_voucher_id,
                     memo, description,
                     trade_type, consumption_tax_type,
                     print_date_flag, print_tax_excl_flag, print_company_seal,
                     sales_category_id, delivery_date, billing_date, source_estimate_no,
                     validity_period)
                VALUES
                    (:voucher_no, :voucher_type, :status, :project_id, :customer_id,
                     :voucher_date, :total_amount, :access_voucher_no, :access_voucher_id,
                     :memo, :description,
                     :trade_type,
                     -- NOT NULL 列: fresh INSERT で未送信(null)ならスキーマ既定値を補完する。
                     COALESCE(:consumption_tax_type, ' . "'外税/伝票計'" . '),
                     COALESCE(:print_date_flag, 1), COALESCE(:print_tax_excl_flag, 0), COALESCE(:print_company_seal, 0),
                     :sales_category_id, :delivery_date, :billing_date, :source_estimate_no,
                     :validity_period)
            ')->execute([
                ':voucher_no'           => $insertVoucherNo,
                ':voucher_type'         => $insertType,
                ':status'               => $insertStatus,
                ':project_id'           => $projectId,
                ':customer_id'          => $customerId,
                ':voucher_date'         => $insertDate,
                ':total_amount'         => $insertTotal,
                ':access_voucher_no'    => $accessVoucherNo,
                ':access_voucher_id'    => $accessVoucherIdFromPayload,
                ':memo'                 => $insertMemo,
                ':description'          => $insertDescription,
                ':trade_type'           => $tradeType,
                ':consumption_tax_type' => $consumptionTaxType,
                ':print_date_flag'      => $printDateFlag,
                ':print_tax_excl_flag'  => $printTaxExclFlag,
                ':print_company_seal'   => $printCompanySeal,
                ':sales_category_id'    => $salesCategoryId,
                ':delivery_date'        => $deliveryDate,
                ':billing_date'         => $billingDateUpd,
                ':source_estimate_no'   => $sourceEstimateNo,
                ':validity_period'      => $validityPeriodUpd,
            ]);
            $voucherId = (int)$pdo->lastInsertId();

            // R-050 連動: 売上受信時に projects.customer_id を更新する
            if ($insertType === 'sales') {
                $projectAccessNo = isset($data['project_access_no']) ? (string)$data['project_access_no'] : (string)$projectId;
                $customerAccessNoForProject = $accessCustomerNo !== null && $accessCustomerNo !== '' ? $accessCustomerNo : null;
                updateProjectCustomerFromSales($pdo, $projectAccessNo, $customerAccessNoForProject);
            }

            $lineError = replaceSyncedLinesFromPayload($pdo, $voucherId, $data);
            if ($lineError !== null) {
                $pdo->rollBack();
                respond(422, $lineError);
                return;
            }

            $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $s->execute([$voucherId]);
            $body = $s->fetch() ?: [];
            $pdo->commit();
            respond(201, $body);
        }
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondInternalError($e, 'syncVoucherUpdate');
        return;
    }
}

function syncVoucherShipped(PDO $pdo, int $projectId, string $accessVoucherNo): void {
    $data = readJsonBody();

    if (!projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません']);
        return;
    }

    // R-035 (b): access_voucher_no 重複時の防御（syncVoucherShipped でも同様）
    $dupStmt = $pdo->prepare('SELECT id FROM vouchers WHERE access_voucher_no = ? ORDER BY id ASC');
    $dupStmt->execute([$accessVoucherNo]);
    $dupIds = $dupStmt->fetchAll(PDO::FETCH_COLUMN);
    if (count($dupIds) > 1) {
        error_log(sprintf(
            '[Beaver sync] syncVoucherShipped: access_voucher_no=%s が %d 件ヒット (ids=%s)。先頭を更新します。',
            $accessVoucherNo,
            count($dupIds),
            implode(',', $dupIds)
        ));
    }

    $stmt = $pdo->prepare('SELECT id FROM vouchers WHERE access_voucher_no = ? ORDER BY id ASC LIMIT 1');
    $stmt->execute([$accessVoucherNo]);
    $id = $stmt->fetchColumn();
    if (!$id) {
        respond(404, ['error' => '指定された access_voucher_no の伝票が見つかりません']);
        return;
    }

    if (!array_key_exists('shipped', $data)) {
        respond(400, ['error' => 'shipped フィールドは必須です']);
        return;
    }

    $shipped = $data['shipped'] ? 1 : 0;

    $shippedAtRaw = isset($data['shipped_at']) ? (string)$data['shipped_at'] : null;
    $shippedAt    = null;
    if ($shippedAtRaw !== null && $shippedAtRaw !== '') {
        $shippedAt = validateShippedAt($shippedAtRaw);
        if ($shippedAt === null) {
            respond(400, ['error' => 'shipped_at は ISO 8601 形式で指定してください']);
            return;
        }
    }

    try {
        $pdo->prepare('
            UPDATE vouchers SET shipped = :shipped, shipped_at = :shipped_at,
                updated_at = CURRENT_TIMESTAMP, last_synced_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ')->execute([
            ':shipped'    => $shipped,
            ':shipped_at' => $shippedAt,
            ':id'         => (int)$id,
        ]);
    } catch (Throwable $e) {
        respondInternalError($e, 'syncVoucherShipped');
        return;
    }

    // A-B-09: pushしたAccess側が自分のpushを競合と誤検知しないよう、応答にlast_synced_atを含める。
    $lastSyncedAtStmt = $pdo->prepare('SELECT last_synced_at FROM vouchers WHERE id = ?');
    $lastSyncedAtStmt->execute([(int)$id]);
    $lastSyncedAt = $lastSyncedAtStmt->fetchColumn();

    respond(200, [
        'voucher_id'     => (int)$id,
        'shipped'        => (bool)$shipped,
        'shipped_at'     => $shippedAt,
        'last_synced_at' => utcToJst($lastSyncedAt !== false ? $lastSyncedAt : null),
    ]);
}

/**
 * PATCH /vouchers/{id}/access-link
 * Beaver発の新規伝票をAccess側へ取り込んだ後、Access採番IDをBeaverへ書き戻す。
 */
function syncVoucherAccessLink(PDO $pdo, int $voucherId): void {
    $data = readJsonBody();

    $accessVoucherIdRaw = $data['access_voucher_id'] ?? null;
    if (!is_numeric($accessVoucherIdRaw) || (int)$accessVoucherIdRaw <= 0) {
        respond(400, ['error' => 'access_voucher_id は正の整数で指定してください']);
        return;
    }
    $accessVoucherId = (int)$accessVoucherIdRaw;
    $accessVoucherNo = array_key_exists('access_voucher_no', $data) && (string)$data['access_voucher_no'] !== ''
        ? (string)$data['access_voucher_no']
        : null;

    $stmt = $pdo->prepare('SELECT id, access_voucher_id, access_voucher_no FROM vouchers WHERE id = ?');
    $stmt->execute([$voucherId]);
    $target = $stmt->fetch();
    if (!$target) {
        respond(404, ['error' => 'voucher_id が Beaver に存在しません', 'voucher_id' => $voucherId]);
        return;
    }

    if ($target['access_voucher_id'] !== null && (int)$target['access_voucher_id'] !== $accessVoucherId) {
        respond(409, [
            'error' => 'access_voucher_id は既に別の値でリンク済みです',
            'voucher_id' => $voucherId,
            'current_access_voucher_id' => (int)$target['access_voucher_id'],
            'requested_access_voucher_id' => $accessVoucherId,
        ]);
        return;
    }

    if ($accessVoucherNo !== null && $target['access_voucher_no'] !== null
        && $target['access_voucher_no'] !== '' && $target['access_voucher_no'] !== $accessVoucherNo) {
        respond(409, [
            'error' => 'access_voucher_no は既に別の値でリンク済みです',
            'voucher_id' => $voucherId,
            'current_access_voucher_no' => $target['access_voucher_no'],
            'requested_access_voucher_no' => $accessVoucherNo,
        ]);
        return;
    }

    $dupStmt = $pdo->prepare('SELECT id FROM vouchers WHERE access_voucher_id = ? AND id <> ? LIMIT 1');
    $dupStmt->execute([$accessVoucherId, $voucherId]);
    $dupId = $dupStmt->fetchColumn();
    if ($dupId) {
        respond(409, [
            'error' => 'access_voucher_id は別の伝票で使用済みです',
            'voucher_id' => $voucherId,
            'existing_voucher_id' => (int)$dupId,
            'access_voucher_id' => $accessVoucherId,
        ]);
        return;
    }

    // R-0151 (1): lines 指定時は、適用前に全行を検証する（1件でも不正なら全件何も反映しない）。
    $lineUpdates = [];
    if (array_key_exists('lines', $data)) {
        if (!is_array($data['lines'])) {
            respond(422, ['error' => 'invalid_lines', 'field' => 'lines']);
            return;
        }

        $existingLinesStmt = $pdo->prepare('SELECT id, line_no, access_line_id FROM voucher_lines WHERE voucher_id = ?');
        $existingLinesStmt->execute([$voucherId]);
        $existingByLineNo = [];
        $existingLineNoByAccessLineId = [];
        foreach ($existingLinesStmt->fetchAll() as $row) {
            $existingByLineNo[(int)$row['line_no']] = $row;
            if ($row['access_line_id'] !== null) {
                $existingLineNoByAccessLineId[(int)$row['access_line_id']] = (int)$row['line_no'];
            }
        }

        $seenLineNo = [];
        $seenAccessLineId = [];

        foreach ($data['lines'] as $lineReq) {
            if (!is_array($lineReq) || !isset($lineReq['line_no']) || !isset($lineReq['access_line_id'])) {
                respond(422, ['error' => 'invalid_lines', 'field' => 'lines']);
                return;
            }
            $lineNo = (int)$lineReq['line_no'];
            $accessLineId = (int)$lineReq['access_line_id'];

            if (isset($seenLineNo[$lineNo])) {
                respond(422, ['error' => 'duplicate_line_no', 'line_no' => $lineNo]);
                return;
            }
            $seenLineNo[$lineNo] = true;

            if (isset($seenAccessLineId[$accessLineId])) {
                respond(422, ['error' => 'duplicate_access_line_id', 'access_line_id' => $accessLineId]);
                return;
            }
            $seenAccessLineId[$accessLineId] = true;

            if (!isset($existingByLineNo[$lineNo])) {
                respond(422, ['error' => 'line_no_not_found', 'line_no' => $lineNo]);
                return;
            }

            $existingRow = $existingByLineNo[$lineNo];
            $currentAccessLineId = $existingRow['access_line_id'] !== null ? (int)$existingRow['access_line_id'] : null;

            if ($currentAccessLineId !== null && $currentAccessLineId !== $accessLineId) {
                respond(409, [
                    'error' => 'line の access_line_id は既に別の値でリンク済みです',
                    'voucher_id' => $voucherId,
                    'line_no' => $lineNo,
                    'current_access_line_id' => $currentAccessLineId,
                    'requested_access_line_id' => $accessLineId,
                ]);
                return;
            }

            if (isset($existingLineNoByAccessLineId[$accessLineId]) && $existingLineNoByAccessLineId[$accessLineId] !== $lineNo) {
                respond(422, [
                    'error' => 'access_line_id_conflict',
                    'voucher_id' => $voucherId,
                    'line_no' => $lineNo,
                    'access_line_id' => $accessLineId,
                    'conflicting_line_no' => $existingLineNoByAccessLineId[$accessLineId],
                ]);
                return;
            }

            // 未設定（NULL）の行のみ更新対象にする（既に同値設定済みの行は冪等に成功扱い＝何もしない）
            if ($currentAccessLineId === null) {
                $lineUpdates[] = ['id' => (int)$existingRow['id'], 'access_line_id' => $accessLineId];
            }
        }
    }

    try {
        $pdo->beginTransaction();

        $pdo->prepare('
            UPDATE vouchers
            SET access_voucher_id = :access_voucher_id,
                access_voucher_no = COALESCE(:access_voucher_no, access_voucher_no),
                updated_at = CURRENT_TIMESTAMP,
                last_synced_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ')->execute([
            ':access_voucher_id' => $accessVoucherId,
            ':access_voucher_no' => $accessVoucherNo,
            ':id' => $voucherId,
        ]);

        // updated_at / edited_in_beaver は変更しない（次回pullでの誤検知を防ぐため）
        $lineUpdStmt = $pdo->prepare('UPDATE voucher_lines SET access_line_id = ? WHERE id = ?');
        foreach ($lineUpdates as $u) {
            $lineUpdStmt->execute([$u['access_line_id'], $u['id']]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        respondInternalError($e, 'syncVoucherAccessLink');
        return;
    }

    $s = $pdo->prepare('SELECT id, access_voucher_id, access_voucher_no, last_synced_at FROM vouchers WHERE id = ?');
    $s->execute([$voucherId]);
    $row = $s->fetch() ?: [];

    respond(200, [
        'voucher_id' => (int)$row['id'],
        'access_voucher_id' => (int)$row['access_voucher_id'],
        'access_voucher_no' => $row['access_voucher_no'],
        'last_synced_at' => utcToJst($row['last_synced_at']),
        'status' => 'linked',
    ]);
}

/**
 * PATCH /vouchers/{id}/sync-state
 * Access側で競合待ちの伝票に sync_pending の印を付ける。
 */
function syncVoucherSyncState(PDO $pdo, int $voucherId): void {
    $data = readJsonBody();

    if (!array_key_exists('sync_pending', $data)) {
        respond(400, ['error' => 'sync_pending は必須です']);
        return;
    }

    $stmt = $pdo->prepare('SELECT id FROM vouchers WHERE id = ?');
    $stmt->execute([$voucherId]);
    if (!$stmt->fetchColumn()) {
        respond(404, ['error' => 'voucher_id が Beaver に存在しません', 'voucher_id' => $voucherId]);
        return;
    }

    $syncPending = $data['sync_pending'] ? 1 : 0;
    try {
        $pdo->prepare('UPDATE vouchers SET sync_pending = :sync_pending WHERE id = :id')
            ->execute([':sync_pending' => $syncPending, ':id' => $voucherId]);
    } catch (Throwable $e) {
        respondInternalError($e, 'syncVoucherSyncState');
        return;
    }

    respond(200, ['voucher_id' => $voucherId, 'sync_pending' => (bool)$syncPending]);
}

/**
 * PATCH /projects/{id}/customer
 * 案件マスタの得意先変更を受信。Body: {customer_access_no: "456"}
 */
function syncProjectCustomer(PDO $pdo, int $projectId): void {
    $data = readJsonBody();

    if (!projectExists($pdo, $projectId)) {
        respond(404, ['error' => 'project_id が Beaver に存在しません']);
        return;
    }

    $accessCustomerNo = isset($data['customer_access_no']) ? (string)$data['customer_access_no'] : '';
    if ($accessCustomerNo === '') {
        respond(400, ['error' => 'customer_access_no は必須です']);
        return;
    }

    $customerId = resolveCustomerId($pdo, $accessCustomerNo);
    if ($customerId === null) {
        respond(400, [
            'error' => 'customer_access_no が customers.access_customer_no に存在しません',
            'customer_access_no' => $accessCustomerNo,
        ]);
        return;
    }

    try {
        $pdo->prepare('UPDATE projects SET customer_id = :customer_id, updated_at = CURRENT_TIMESTAMP WHERE id = :id')
            ->execute([':customer_id' => $customerId, ':id' => $projectId]);
    } catch (Throwable $e) {
        respondInternalError($e, 'syncProjectCustomer');
        return;
    }

    // A-B-09: projectsテーブルにlast_synced_at列が無いため永続化はせず、
    // サーバ現在時刻(JST)をそのまま応答に含める。
    $lastSyncedAt = (new DateTime('now', new DateTimeZone('Asia/Tokyo')))->format('Y-m-d H:i:s');

    respond(200, [
        'project_id'     => $projectId,
        'customer_id'    => $customerId,
        'status'         => 'updated',
        'last_synced_at' => $lastSyncedAt,
    ]);
}
