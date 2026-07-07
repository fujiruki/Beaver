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
        $sortKey = isset($_GET['sort']) ? (string)$_GET['sort'] : '';
        $orderRaw = isset($_GET['order']) ? strtolower((string)$_GET['order']) : '';
        if ($orderRaw === 'asc' || $orderRaw === 'desc') {
            $order = strtoupper($orderRaw);
        } else {
            $order = strtoupper($defaultOrder) === 'DESC' ? 'DESC' : 'ASC';
        }

        $expr = array_key_exists($sortKey, $whitelist) ? $whitelist[$sortKey] : $default;

        return "ORDER BY $expr $order, $tiebreaker ASC";
    }
}
