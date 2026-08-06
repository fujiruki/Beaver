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

if (!function_exists('fetchEstimatedHoursByProjectIds')) {
    /**
     * R-0097: 指定した案件ID群について、見積伝票のvoucher_linesから集計した
     * 工場時間+現場時間の合計を project_id => 時間 で返す（0件のIDはキーが存在しない）。
     * 一覧はページングされるため、呼び出し側は「該当ページの案件ID」だけを渡すこと。
     *
     * @param array<int> $projectIds
     * @return array<int,float>
     */
    function fetchEstimatedHoursByProjectIds(PDO $pdo, array $projectIds): array {
        if (empty($projectIds)) return [];
        $placeholders = implode(',', array_fill(0, count($projectIds), '?'));
        $stmt = $pdo->prepare("
            SELECT v.project_id,
                   COALESCE(SUM(vl.cost_factory_hours * vl.quantity), 0) AS total_factory_hours,
                   COALESCE(SUM(vl.cost_site_hours    * vl.quantity), 0) AS total_site_hours
            FROM voucher_lines vl
            JOIN vouchers v ON v.id = vl.voucher_id
            WHERE v.project_id IN ($placeholders) AND v.voucher_type = 'estimate' AND v.status != 'void'
            GROUP BY v.project_id
        ");
        $stmt->execute(array_values($projectIds));
        $result = [];
        foreach ($stmt->fetchAll() as $row) {
            $result[(int)$row['project_id']] = round((float)$row['total_factory_hours'] + (float)$row['total_site_hours'], 2);
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
