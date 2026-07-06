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
        if ($totalAmount < 0) {
            respond(400, ['error' => 'total_amount は 0 以上で指定してください']);
            return;
        }
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
                 validity_period)
            VALUES
                (:voucher_no, :voucher_type, :status, :project_id, :customer_id,
                 :voucher_date, :total_amount, :access_voucher_id, :access_voucher_no,
                 :memo, :description,
                 :trade_type,
                 -- NOT NULL 列: fresh INSERT で未送信(null)ならスキーマ既定値を補完する。
                 COALESCE(:consumption_tax_type, ' . "'外税/伝票計'" . '),
                 COALESCE(:print_date_flag, 1), COALESCE(:print_tax_excl_flag, 0), COALESCE(:print_company_seal, 0),
                 :sales_category_id, :delivery_date, :billing_date, :source_estimate_no,
                 :validity_period)
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
                updated_at          = CURRENT_TIMESTAMP
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
        ]);

        if ($existing) {
            $voucherId = (int)$existing['id'];
        } else {
            $voucherId = (int)$pdo->lastInsertId();
        }

        // R-066(c) Phase1: payload に lines がある場合、当該伝票の voucher_lines が
        // 0件のときのみ Access 明細を INSERT する（Beaver 編集済み明細を保護）。
        // INSERT 経路（新規伝票）も UPDATE 経路（既存伝票）も同じ条件でガードする。
        if (!empty($data['lines']) && is_array($data['lines'])) {
            $lineError = insertSyncedLinesIfEmpty($pdo, $voucherId, $data['lines']);
            if ($lineError !== null) {
                $pdo->rollBack();
                respond(422, $lineError);
                return;
            }
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

    respond(200, [
        'voucher_id' => $voucherId,
        'voucher_no' => $voucherNo,
        'status'     => 'synced',
    ]);
}

/**
 * R-066(c) Phase1: 当該 voucher_id の voucher_lines が 0 件のときのみ
 * Access 明細を INSERT する。既に 1 件でも明細がある場合は何もしない（保護）。
 * 戻り値は insertSyncedLines と同じ: 不正値があれば配列、正常系は null。
 */
function insertSyncedLinesIfEmpty(PDO $pdo, int $voucherId, array $lines): ?array {
    $countStmt = $pdo->prepare('SELECT COUNT(*) FROM voucher_lines WHERE voucher_id = ?');
    $countStmt->execute([$voucherId]);
    if ((int)$countStmt->fetchColumn() > 0) {
        return null;
    }
    return insertSyncedLines($pdo, $voucherId, $lines);
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
        $quantity = (float)$quantityRaw;
        if ($quantity < 0) {
            return [
                'error'   => 'invalid_line',
                'field'   => 'quantity',
                'value'   => $quantityRaw,
                'line_no' => $lineNo,
            ];
        }

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
            ':tax_category'  => $taxCategory,
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
        if ($totalAmount < 0) {
            respond(400, ['error' => 'total_amount は 0 以上で指定してください']);
            return;
        }
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
            $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $s->execute([$voucherId]);
            respond(200, $s->fetch() ?: []);
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

            $s = $pdo->prepare('SELECT * FROM vouchers WHERE id = ?');
            $s->execute([$voucherId]);
            respond(201, $s->fetch() ?: []);
        }
    } catch (Throwable $e) {
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
            UPDATE vouchers SET shipped = :shipped, shipped_at = :shipped_at, updated_at = CURRENT_TIMESTAMP
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

    respond(200, ['voucher_id' => (int)$id, 'shipped' => (bool)$shipped, 'shipped_at' => $shippedAt]);
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

    respond(200, [
        'project_id'  => $projectId,
        'customer_id' => $customerId,
        'status'      => 'updated',
    ]);
}
