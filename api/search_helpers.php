<?php
/**
 * R-0083: 複数カラムを対象とした LIKE 検索条件を組み立てる共通ヘルパー。
 * 得意先検索を皮切りに、他エンティティの一覧検索（Phase 2）でも再利用する想定。
 */

if (!function_exists('buildMultiColumnSearchClause')) {
    /**
     * @param array<int,string> $columns 検索対象カラム名（すべてハードコード文字列で呼び出すこと）
     * @param string $keyword 検索キーワード
     * @return array{0:string,1:array<int,string>} [WHERE句に埋め込むSQL断片, バインドパラメータ配列]
     */
    function buildMultiColumnSearchClause(array $columns, string $keyword): array {
        $like = '%' . $keyword . '%';
        $clauses = array_map(fn(string $c) => "$c LIKE ?", $columns);
        $params = array_fill(0, count($columns), $like);
        return ['(' . implode(' OR ', $clauses) . ')', $params];
    }
}
