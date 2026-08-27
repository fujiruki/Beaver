<?php
/**
 * R-076 Part A Phase 1: 一覧系エンドポイント共通のサーバソート基盤。
 *
 * ソート対象列は呼び出し側がホワイトリストとして明示する。$_GET由来の値を
 * SQL文字列へ直接埋め込まないことで、任意のカラム名注入を防ぐ。
 */

if (!function_exists('resolveSortClause')) {
    /**
     * $_GET['sort'] / $_GET['order'] をホワイトリストで検証し、ORDER BY句を組み立てる。
     *
     * - $_GET['sort'] がホワイトリストに存在しない/未指定なら $default を使う（400にしない）
     * - $_GET['order'] が 'asc'/'desc'（大文字小文字不問）のいずれかを明示指定していればそれを使う。
     *   未指定または不正値のときは $defaultOrder を使う（呼び出し元が既存の並び順を
     *   DESC既定で維持したいエンドポイント向け。省略時はASC＝3引数呼び出しと同じ挙動）
     * - 同値時の安定ソートのため $tiebreaker 列を常に ASC で末尾に付与する
     *
     * @param array<string,string> $whitelist 列key => SQL式（例: ['name' => 'name']）。
     *                                        すべてハードコード文字列で呼び出すこと。
     * @param string $default ホワイトリストに存在しない/未指定時に使うデフォルトのSQL式
     * @param string $tiebreaker 同値時の安定ソート用に末尾へ付与する列（例: 'id'）
     * @param string $defaultOrder order未指定・不正値時に使う方向（'ASC'|'DESC'）
     * @return string 'ORDER BY ...' から始まる句
     */
    function resolveSortClause(array $whitelist, string $default, string $tiebreaker, string $defaultOrder = 'ASC'): string {
        $sortRaw = isset($_GET['sort']) ? (string)$_GET['sort'] : '';
        $orderRaw = isset($_GET['order']) ? (string)$_GET['order'] : '';
        $fallbackOrder = strtoupper($defaultOrder) === 'DESC' ? 'DESC' : 'ASC';

        $sortKeys = array_values(array_filter(explode(',', $sortRaw), fn(string $k) => $k !== ''));

        // カンマが無い単一カラム指定（従来の3引数/4引数呼び出しと完全互換の経路）
        if (count($sortKeys) <= 1) {
            $sortKey = $sortKeys[0] ?? '';
            $singleOrderRaw = strtolower($orderRaw);
            $order = ($singleOrderRaw === 'asc' || $singleOrderRaw === 'desc') ? strtoupper($singleOrderRaw) : $fallbackOrder;
            $expr = array_key_exists($sortKey, $whitelist) ? $whitelist[$sortKey] : $default;
            return "ORDER BY $expr $order, $tiebreaker ASC";
        }

        // R-0092: 複合ソート（カンマ区切り）。ホワイトリスト外のカラムは無視する。
        $orderParts = explode(',', $orderRaw);
        $clauses = [];
        foreach ($sortKeys as $i => $key) {
            if (!array_key_exists($key, $whitelist)) continue;
            $orderPart = strtolower(trim($orderParts[$i] ?? ''));
            $order = ($orderPart === 'asc' || $orderPart === 'desc') ? strtoupper($orderPart) : $fallbackOrder;
            $clauses[] = "{$whitelist[$key]} $order";
        }

        if (empty($clauses)) {
            return "ORDER BY $default $fallbackOrder, $tiebreaker ASC";
        }

        return 'ORDER BY ' . implode(', ', $clauses) . ", $tiebreaker ASC";
    }
}

if (!function_exists('selectPlanningEstimateVouchers')) {
    /**
     * R-0117: 指定した案件ID群について「計画基準見積」を選定する。
     * 計画基準見積 = 工数明細（cost_factory_hours>0 または cost_site_hours>0 の行）を持つ
     * 非void見積のうち、voucher_date降順→id降順で最新の1件。
     * 複数の有効見積があっても合算せず、この1件だけを正本とする（R-0117設計ゲート）。
     *
     * @param array<int> $projectIds
     * @return array<int,array{voucher_id:int,updated_at:?string}> project_id => 選定された見積伝票の情報
     */
    function selectPlanningEstimateVouchers(PDO $pdo, array $projectIds): array {
        if (empty($projectIds)) return [];
        $placeholders = implode(',', array_fill(0, count($projectIds), '?'));
        $sql = "
            WITH qualifying AS (
                SELECT v.id, v.project_id, v.voucher_date, v.updated_at
                FROM vouchers v
                WHERE v.project_id IN ($placeholders)
                  AND v.voucher_type = 'estimate'
                  AND v.status != 'void'
                  AND EXISTS (
                      SELECT 1 FROM voucher_lines vl
                      WHERE vl.voucher_id = v.id
                        AND (vl.cost_factory_hours > 0 OR vl.cost_site_hours > 0)
                  )
            ),
            ranked AS (
                SELECT id, project_id, updated_at,
                       ROW_NUMBER() OVER (
                           PARTITION BY project_id ORDER BY voucher_date DESC, id DESC
                       ) AS rn
                FROM qualifying
            )
            SELECT project_id, id AS voucher_id, updated_at FROM ranked WHERE rn = 1
        ";
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_values($projectIds));
        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[(int)$row['project_id']] = [
                'voucher_id' => (int)$row['voucher_id'],
                'updated_at' => $row['updated_at'],
            ];
        }
        return $result;
    }
}

if (!function_exists('sumHoursByVoucherIds')) {
    /** @param array<int> $voucherIds @return array<int,float> voucher_id => 工場時間+現場時間の合計 */
    function sumHoursByVoucherIds(PDO $pdo, array $voucherIds): array {
        if (empty($voucherIds)) return [];
        $placeholders = implode(',', array_fill(0, count($voucherIds), '?'));
        $stmt = $pdo->prepare("
            SELECT voucher_id,
                   COALESCE(SUM(cost_factory_hours * quantity), 0) AS total_factory_hours,
                   COALESCE(SUM(cost_site_hours    * quantity), 0) AS total_site_hours
            FROM voucher_lines
            WHERE voucher_id IN ($placeholders)
            GROUP BY voucher_id
        ");
        $stmt->execute(array_values($voucherIds));
        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[(int)$row['voucher_id']] = round((float)$row['total_factory_hours'] + (float)$row['total_site_hours'], 2);
        }
        return $result;
    }
}

if (!function_exists('fetchWorkPackagesByVoucherIds')) {
    /**
     * R-0120: 選定済み計画基準見積の明細をwork_packages生成用に一括取得する。
     * 日時のISO8601整形やfactory/siteへの分解は契約境界側で行う。
     *
     * @param array<int> $voucherIds
     * @return array<int,array<int,array<string,mixed>>> voucher_id => line_no昇順の生明細
     */
    function fetchWorkPackagesByVoucherIds(PDO $pdo, array $voucherIds): array {
        if (empty($voucherIds)) return [];
        $placeholders = implode(',', array_fill(0, count($voucherIds), '?'));
        $stmt = $pdo->prepare("
            SELECT vl.voucher_id,
                   vl.id AS line_id,
                   vl.line_no,
                   vl.item_name,
                   vl.quantity,
                   vl.cost_factory_hours,
                   vl.cost_site_hours,
                   COALESCE(vl.updated_at, v.updated_at) AS updated_at
            FROM voucher_lines vl
            INNER JOIN vouchers v ON v.id = vl.voucher_id
            WHERE vl.voucher_id IN ($placeholders)
            ORDER BY vl.voucher_id ASC, vl.line_no ASC
        ");
        $stmt->execute(array_values($voucherIds));
        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[(int)$row['voucher_id']][] = $row;
        }
        return $result;
    }
}

if (!function_exists('fetchEstimatedHoursByProjectIds')) {
    /**
     * R-0097 / R-0117: 指定した案件ID群について、計画基準見積（selectPlanningEstimateVouchers）の
     * 工場時間+現場時間の合計を project_id => 時間 で返す（0件のIDはキーが存在しない）。
     * 一覧はページングされるため、呼び出し側は「該当ページの案件ID」だけを渡すこと。
     *
     * @param array<int> $projectIds
     * @return array<int,float>
     */
    function fetchEstimatedHoursByProjectIds(PDO $pdo, array $projectIds): array {
        $selected = selectPlanningEstimateVouchers($pdo, $projectIds);
        if (empty($selected)) return [];
        $hoursByVoucherId = sumHoursByVoucherIds($pdo, array_column($selected, 'voucher_id'));
        $result = [];
        foreach ($selected as $projectId => $info) {
            $result[$projectId] = $hoursByVoucherId[$info['voucher_id']] ?? 0.0;
        }
        return $result;
    }
}

if (!function_exists('fetchProjectBaselines')) {
    /**
     * R-0117: Youkan連携向けのbaseline_hours/baseline_source/baseline_updated_atを算出する。
     * 計画基準見積があればそれを優先(estimate)、無ければmanual_estimated_hours(manual)、
     * どちらも無ければnone。
     *
     * @param array<array{id:int|string,manual_estimated_hours:mixed,updated_at:?string}> $projectRows
     * @return array<int,array{hours:?float,source:string,updated_at:?string,voucher_id:?int}> project_id => baseline情報
     */
    function fetchProjectBaselines(PDO $pdo, array $projectRows): array {
        $ids = array_map('intval', array_column($projectRows, 'id'));
        $selected = selectPlanningEstimateVouchers($pdo, $ids);
        $hoursByVoucherId = empty($selected) ? [] : sumHoursByVoucherIds($pdo, array_column($selected, 'voucher_id'));

        $result = [];
        foreach ($projectRows as $p) {
            $pid = (int)$p['id'];
            if (isset($selected[$pid])) {
                $voucherId = $selected[$pid]['voucher_id'];
                $result[$pid] = [
                    'hours'      => $hoursByVoucherId[$voucherId] ?? 0.0,
                    'source'     => 'estimate',
                    'updated_at' => $selected[$pid]['updated_at'],
                    'voucher_id' => $voucherId,
                ];
            } elseif ($p['manual_estimated_hours'] !== null) {
                $result[$pid] = [
                    'hours'      => (float)$p['manual_estimated_hours'],
                    'source'     => 'manual',
                    'updated_at' => $p['updated_at'],
                    'voucher_id' => null,
                ];
            } else {
                $result[$pid] = ['hours' => null, 'source' => 'none', 'updated_at' => null, 'voucher_id' => null];
            }
        }
        return $result;
    }
}

if (!function_exists('effectiveEstimatedHours')) {
    /** R-0097: 見積伝票集計値があればそれを優先し、無ければ手動入力値を使う（実効工数目安）。 */
    function effectiveEstimatedHours(float $sumHours, $manualHours): ?float {
        if ($sumHours > 0) return $sumHours;
        return $manualHours === null ? null : (float)$manualHours;
    }
}
