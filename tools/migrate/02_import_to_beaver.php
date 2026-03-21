<?php
/**
 * 02_import_to_beaver.php
 * JSONエクスポートデータをBeaverのSQLiteに取り込む
 *
 * 使用方法:
 *   php 02_import_to_beaver.php            # 本番実行
 *   php 02_import_to_beaver.php --dry-run  # ドライラン（INSERT不実行）
 */

$dryRun = in_array('--dry-run', $argv);
$exportDir = __DIR__ . '/export';
$beaverRoot = dirname(dirname(__DIR__));
$dbPath = $beaverRoot . '/api/database.sqlite';
$schemaPath = $beaverRoot . '/api/schema.sql';

echo $dryRun ? "=== DRY RUN モード（DBは変更されません）===\n\n" : "=== 本番実行 ===\n\n";

// ------------------------------------------------------------
// DB初期化（DBが存在しない場合はスキーマを適用）
// ------------------------------------------------------------
if (!file_exists($dbPath)) {
    if (!file_exists($schemaPath)) {
        die("エラー: schema.sql が見つかりません: $schemaPath\n");
    }
    echo "DB が存在しないためスキーマを初期化します...\n";
    if (!$dryRun) {
        $pdo = openDb($dbPath);
        $schema = file_get_contents($schemaPath);
        $pdo->exec($schema);
        echo "  スキーマ適用完了\n\n";
    }
} else {
    $pdo = openDb($dbPath);
}

if ($dryRun) {
    $pdo = null; // ドライランでは書き込まない
}

// ------------------------------------------------------------
// JSONファイル読み込み
// ------------------------------------------------------------
echo "JSONファイル読み込み中...\n";
$tokuisaki     = readJson($exportDir . '/tokuisaki.json');
$tategu        = readJson($exportDir . '/tategu.json');
$honbai        = readJson($exportDir . '/tategu_honbai.json');
$kanamono      = readJson($exportDir . '/tategu_kanamono.json');
$garasu        = readJson($exportDir . '/tategu_garasu.json');
$romuhi        = readJson($exportDir . '/tategu_romuhi.json');
$mitsumori     = readJson($exportDir . '/mitsumori.json');
$mitsumoriMei  = readJson($exportDir . '/mitsumori_meisai.json');
$uriage        = readJson($exportDir . '/uriage.json');
$uriageMei     = readJson($exportDir . '/uriage_meisai.json');

printf("  得意先: %d件, 建具台帳: %d件, 見積: %d件, 売上: %d件, 見積明細: %d件, 売上明細: %d件\n\n",
    count($tokuisaki), count($tategu),
    count($mitsumori), count($uriage),
    count($mitsumoriMei), count($uriageMei)
);

// ------------------------------------------------------------
// デフォルト労務単価（company_settingsから取得）
// ------------------------------------------------------------
$defaultLaborRate = 5000;
if ($pdo) {
    $row = $pdo->query("SELECT default_labor_rate FROM company_settings WHERE id = 1")->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        $defaultLaborRate = (float)$row['default_labor_rate'];
    }
}
$migrationDate = date('Y-m-d\TH:i:s');

// ------------------------------------------------------------
// インポート実行
// ------------------------------------------------------------
$customerMap = importCustomers($pdo, $tokuisaki, $dryRun);
$tateguMap   = importTateguItems($pdo, $tategu, $honbai, $kanamono, $garasu, $romuhi, $defaultLaborRate, $migrationDate, $dryRun);
$voucherMap  = importVouchers($pdo, $mitsumori, $uriage, $customerMap, $dryRun);
importVoucherLines($pdo, $mitsumoriMei, $uriageMei, $voucherMap, $tateguMap, $defaultLaborRate, $migrationDate, $dryRun);
updateSequences($pdo, $mitsumori, $uriage, $dryRun);

echo "\n完了\n";

// ============================================================
// 関数群
// ============================================================

function importCustomers(?PDO $pdo, array $rows, bool $dryRun): array
{
    echo "得意先インポート中...\n";
    $map = [];
    $inserted = 0;
    $skipped = 0;

    $stmt = $pdo ? $pdo->prepare("
        INSERT OR IGNORE INTO customers
            (code, name, name_kana, honorific_type, gender,
             postal_code, address1, address2, tel, mobile, fax, email,
             memo, cutoff_day, billing_offset_days, payment_due_days,
             carry_forward_balance, is_active)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,10,30,?,?)
    ") : null;

    foreach ($rows as $r) {
        $no   = (int)$r['得意先№'];
        $code = (string)$no;
        $name = (string)($r['名前'] ?? '');

        if ($name === '') {
            $skipped++;
            continue;
        }

        $isActive = isset($r['使用不可']) ? ($r['使用不可'] ? 0 : 1) : 1;
        $cutoffDay = isset($r['締日']) && $r['締日'] !== null ? (int)$r['締日'] : 31;
        if ($cutoffDay === 0) {
            $cutoffDay = 31; // 0=月末→31で統一
        }

        if ($dryRun) {
            printf("  [DRY] customers INSERT: code=%s name=%s\n", $code, $name);
            $map[$no] = -1;
            $inserted++;
            continue;
        }

        $pdo->beginTransaction();
        $stmt->execute([
            $code,
            $name,
            $r['名前カナ'] ?? null,
            $r['敬称区分'] ?? '御中',
            $r['性別'] ?? null,
            $r['郵便番号'] ?? null,
            $r['住所１'] ?? null,
            $r['住所２'] ?? null,
            $r['電話番号'] ?? null,
            $r['携帯電話'] ?? null,
            $r['FAX番号'] ?? null,
            $r['電子メール'] ?? null,
            $r['備考'] ?? null,
            $cutoffDay,
            isset($r['繰越残高']) && $r['繰越残高'] !== null ? (float)$r['繰越残高'] : 0,
            $isActive,
        ]);
        $pdo->commit();

        $id = (int)$pdo->query("SELECT id FROM customers WHERE code = " . $pdo->quote($code))->fetchColumn();
        if ($id > 0) {
            $map[$no] = $id;
            $inserted++;
        } else {
            $skipped++;
        }
    }

    printf("  挿入: %d件, スキップ: %d件\n", $inserted, $skipped);
    return $map;
}

function importTateguItems(
    ?PDO $pdo, array $tategu,
    array $honbai, array $kanamono, array $garasu, array $romuhi,
    float $defaultLaborRate, string $migrationDate, bool $dryRun
): array {
    echo "建具台帳インポート中...\n";

    // 建具№ごとにコストを集計
    $costBody     = aggregateByKey($honbai, '建具№', '本体金額');
    $costHardware = aggregateByKey($kanamono, '建具№', '金物金額');
    $costGlass    = aggregateByKey($garasu, '建具№', '硝子金額');
    $costHours    = aggregateByKey($romuhi, '建具№', '作業時間');

    $map = [];
    $inserted = 0;
    $skipped = 0;

    $stmt = $pdo ? $pdo->prepare("
        INSERT OR IGNORE INTO tategu_items
            (code, name, description, status,
             cost_body, cost_hardware, cost_glass,
             cost_factory_hours, cost_site_hours, cost_labor_rate,
             cost_snapshot_at)
        VALUES (?,?,?,?,?,?,?,?,0,?,?)
    ") : null;

    foreach ($tategu as $r) {
        $no     = (int)$r['建具№'];
        $code   = sprintf('%05d', $no);
        $name   = (string)($r['建具名'] ?? '');
        $status = ($r['使用不可'] ?? 0) ? 'archived' : 'active';

        if ($dryRun) {
            printf("  [DRY] tategu_items INSERT: code=%s name=%s\n", $code, $name);
            $map[$no] = -1;
            $inserted++;
            continue;
        }

        $pdo->beginTransaction();
        $stmt->execute([
            $code,
            $name,
            $r['備考'] ?? null,
            $status,
            $costBody[$no]     ?? 0,
            $costHardware[$no] ?? 0,
            $costGlass[$no]    ?? 0,
            $costHours[$no]    ?? 0,
            $defaultLaborRate,
            $migrationDate,
        ]);
        $pdo->commit();

        $id = (int)$pdo->query("SELECT id FROM tategu_items WHERE code = " . $pdo->quote($code))->fetchColumn();
        if ($id > 0) {
            $map[$no] = $id;
            $inserted++;
        } else {
            $skipped++;
        }
    }

    printf("  挿入: %d件, スキップ: %d件\n", $inserted, $skipped);
    return $map;
}

function importVouchers(
    ?PDO $pdo, array $mitsumori, array $uriage,
    array $customerMap, bool $dryRun
): array {
    echo "伝票インポート中...\n";

    $map = [];
    $inserted = 0;
    $skipped = 0;

    $stmt = $pdo ? $pdo->prepare("
        INSERT OR IGNORE INTO vouchers
            (voucher_no, voucher_type, status, customer_id,
             voucher_date, delivery_date,
             tax_input_type, consumption_tax_type,
             memo)
        VALUES (?,?,?,?,?,?,?,?,?)
    ") : null;

    // 見積
    foreach ($mitsumori as $r) {
        $no         = (int)$r['見積伝票№'];
        $voucherNo  = sprintf('M%05d', $no);
        $custNo     = (int)($r['得意先№'] ?? 0);
        $custId     = $customerMap[$custNo] ?? null;
        $date       = $r['見積日'] ?? null;

        if (!$custId || !$date) {
            $skipped++;
            continue;
        }

        [$taxInput, $taxType] = mapTaxType($r['消費税区分'] ?? null);

        if ($dryRun) {
            printf("  [DRY] vouchers INSERT: %s (estimate)\n", $voucherNo);
            $map['M' . $no] = -1;
            $inserted++;
            continue;
        }

        $pdo->beginTransaction();
        $stmt->execute([
            $voucherNo, 'estimate', 'submitted', $custId,
            normalizeDate($date), null,
            $taxInput, $taxType,
            $r['摘要'] ?? null,
        ]);
        $pdo->commit();

        $id = (int)$pdo->query("SELECT id FROM vouchers WHERE voucher_no = " . $pdo->quote($voucherNo))->fetchColumn();
        if ($id > 0) {
            $map['M' . $no] = $id;
            $inserted++;
        } else {
            $skipped++;
        }
    }

    // 売上
    foreach ($uriage as $r) {
        $no         = (int)$r['売上伝票№'];
        $voucherNo  = sprintf('U%05d', $no);
        $custNo     = (int)($r['得意先№'] ?? 0);
        $custId     = $customerMap[$custNo] ?? null;
        $date       = $r['売上日'] ?? null;

        if (!$custId || !$date) {
            $skipped++;
            continue;
        }

        [$taxInput, $taxType] = mapTaxType($r['消費税区分'] ?? null);

        if ($dryRun) {
            printf("  [DRY] vouchers INSERT: %s (sales)\n", $voucherNo);
            $map['U' . $no] = -1;
            $inserted++;
            continue;
        }

        $pdo->beginTransaction();
        $stmt->execute([
            $voucherNo, 'sales', 'approved', $custId,
            normalizeDate($date), normalizeDate($r['納品日'] ?? null),
            $taxInput, $taxType,
            $r['摘要'] ?? null,
        ]);
        $pdo->commit();

        $id = (int)$pdo->query("SELECT id FROM vouchers WHERE voucher_no = " . $pdo->quote($voucherNo))->fetchColumn();
        if ($id > 0) {
            $map['U' . $no] = $id;
            $inserted++;
        } else {
            $skipped++;
        }
    }

    printf("  挿入: %d件, スキップ: %d件\n", $inserted, $skipped);
    return $map;
}

function importVoucherLines(
    ?PDO $pdo,
    array $mitsumoriMei, array $uriageMei,
    array $voucherMap, array $tateguMap,
    float $defaultLaborRate, string $migrationDate, bool $dryRun
): void {
    echo "明細インポート中...\n";

    $stmt = $pdo ? $pdo->prepare("
        INSERT OR IGNORE INTO voucher_lines
            (voucher_id, line_no, line_type,
             location_no, location_name,
             tategu_item_id, item_name, quantity,
             price_body, price_hardware, price_glass, line_total,
             cost_body, cost_hardware, cost_glass,
             cost_factory_hours, cost_site_hours, cost_labor_rate,
             snapshot_loaded_at, tax_category, memo)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?)
    ") : null;

    $inserted = 0;
    $skipped = 0;

    // 見積明細と売上明細を統合処理
    $batches = [
        ['prefix' => 'M', 'keyField' => '見積伝票№', 'rows' => $mitsumoriMei],
        ['prefix' => 'U', 'keyField' => '売上伝票№', 'rows' => $uriageMei],
    ];

    foreach ($batches as $batch) {
        $prefix   = $batch['prefix'];
        $keyField = $batch['keyField'];

        if ($pdo && !$dryRun) {
            $pdo->beginTransaction();
        }

        foreach ($batch['rows'] as $r) {
            $voucherNo = (int)$r[$keyField];
            $voucherId = $voucherMap[$prefix . $voucherNo] ?? null;
            if (!$voucherId) {
                $skipped++;
                continue;
            }

            $lineNo    = (int)($r['行№'] ?? 0);
            $lineType  = mapLineType($r['内訳'] ?? null);
            $tateguNo  = isset($r['取付建具№']) && $r['取付建具№'] !== null ? (int)$r['取付建具№'] : null;
            $tateguId  = $tateguNo ? ($tateguMap[$tateguNo] ?? null) : null;

            $priceBody = (float)($r['本体金額'] ?? 0);
            $priceHw   = (float)($r['金物金額'] ?? 0);
            $priceGl   = (float)($r['ガラス金額'] ?? 0);
            $lineTotal = (float)($r['明細金額'] ?? ($priceBody + $priceHw + $priceGl));

            $costBody  = (float)($r['原価_本体材料'] ?? 0);
            $costHw    = (float)($r['原価_金物'] ?? 0);
            $costGl    = (float)($r['原価_ガラス'] ?? 0);
            $costHours = (float)($r['作業時間'] ?? 0);
            $costRate  = $r['原価_労務単価'] !== null ? (float)$r['原価_労務単価'] : $defaultLaborRate;

            if ($dryRun) {
                $inserted++;
                continue;
            }

            $stmt->execute([
                $voucherId, $lineNo, $lineType,
                $r['取付場所№'] ?? null,
                $r['取付場所'] ?? null,
                $tateguId,
                $r['取付建具'] ?? null,
                (int)($r['数量'] ?? 1),
                $priceBody, $priceHw, $priceGl, $lineTotal,
                $costBody, $costHw, $costGl,
                $costHours,
                $costRate,
                $migrationDate,
                $r['課税区分'] ?? '課税',
                $r['備考'] ?? null,
            ]);
            $inserted++;
        }

        if ($pdo && !$dryRun) {
            $pdo->commit();
        }
    }

    if (!$dryRun && $pdo) {
        recalcVoucherTotals($pdo);
    }

    printf("  挿入: %d件, スキップ: %d件\n", $inserted, $skipped);
}

function recalcVoucherTotals(PDO $pdo): void
{
    echo "伝票集計を再計算中...\n";
    $pdo->exec("
        UPDATE vouchers SET
            subtotal_taxable = (
                SELECT COALESCE(SUM(line_total), 0)
                FROM voucher_lines
                WHERE voucher_id = vouchers.id AND tax_category = '課税' AND line_type != 'discount'
            ),
            subtotal_nontaxable = (
                SELECT COALESCE(SUM(line_total), 0)
                FROM voucher_lines
                WHERE voucher_id = vouchers.id AND tax_category != '課税' AND line_type != 'discount'
            ),
            subtotal_discount = (
                SELECT COALESCE(SUM(line_total), 0)
                FROM voucher_lines
                WHERE voucher_id = vouchers.id AND line_type = 'discount'
            ),
            total_amount = (
                SELECT COALESCE(SUM(line_total), 0)
                FROM voucher_lines
                WHERE voucher_id = vouchers.id
            )
    ");
    // tax_amount は Beaver アプリ側で開いた際に再計算される
    echo "  完了\n";
}

function updateSequences(?PDO $pdo, array $mitsumori, array $uriage, bool $dryRun): void
{
    echo "連番更新中...\n";

    $maxEstimate = 0;
    foreach ($mitsumori as $r) {
        $no = (int)($r['見積伝票№'] ?? 0);
        if ($no > $maxEstimate) $maxEstimate = $no;
    }

    $maxSales = 0;
    foreach ($uriage as $r) {
        $no = (int)($r['売上伝票№'] ?? 0);
        if ($no > $maxSales) $maxSales = $no;
    }

    printf("  estimate: %d, sales: %d\n", $maxEstimate, $maxSales);

    if ($dryRun || !$pdo) return;

    $pdo->exec("UPDATE sequences SET last_no = $maxEstimate WHERE key = 'estimate'");
    $pdo->exec("UPDATE sequences SET last_no = $maxSales WHERE key = 'sales'");
}

// ============================================================
// ユーティリティ
// ============================================================

function openDb(string $path): PDO
{
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->exec('PRAGMA foreign_keys = OFF'); // 移行中は外部キー制約を無効化
    $pdo->exec('PRAGMA journal_mode = WAL');
    return $pdo;
}

function readJson(string $path): array
{
    if (!file_exists($path)) {
        echo "  警告: ファイルが見つかりません: $path\n";
        return [];
    }
    $content = file_get_contents($path);
    // UTF-8 BOM除去
    if (str_starts_with($content, "\xEF\xBB\xBF")) {
        $content = substr($content, 3);
    }
    $data = json_decode($content, true);
    if ($data === null) {
        throw new RuntimeException("JSONデコード失敗: $path (" . json_last_error_msg() . ')');
    }
    return $data;
}

function aggregateByKey(array $rows, string $keyField, string $valueField): array
{
    $result = [];
    foreach ($rows as $r) {
        $key = (int)($r[$keyField] ?? 0);
        $result[$key] = ($result[$key] ?? 0) + (float)($r[$valueField] ?? 0);
    }
    return $result;
}

function mapTaxType(?string $value): array
{
    if ($value === null || $value === '') {
        return ['exclusive', '外税/伝票計'];
    }
    $input = str_contains($value, '内税') ? 'inclusive' : 'exclusive';
    // 値をそのまま使う（'外税/伝票計', '外税/請求計', '内税/伝票計', etc.）
    $type = $value;
    // '内税' のみ（サフィックスなし）の場合はデフォルト
    if ($value === '内税') $type = '内税/伝票計';
    if ($value === '外税') $type = '外税/伝票計';
    return [$input, $type];
}

function mapLineType(?string $naiwake): string
{
    if ($naiwake === null || $naiwake === '') return 'normal';
    if ($naiwake === '小計') return 'subtotal';
    if ($naiwake === '値引') return 'discount';
    return 'normal';
}

function normalizeDate(?string $v): ?string
{
    if ($v === null || $v === '') return null;
    // "YYYY-MM-DDTHH:MM:SS" or "YYYY-MM-DD" → "YYYY-MM-DD"
    return substr($v, 0, 10);
}
