<?php
/**
 * R-0083: 複数カラムを対象とした LIKE 検索条件を組み立てる共通ヘルパー。
 * 得意先検索を皮切りに、他エンティティの一覧検索（Phase 2）でも再利用する想定。
 * R-0090: 空白区切りのAND検索＋ひらがな/カタカナ正規化に対応。
 */

if (!function_exists('buildMultiColumnSearchClause')) {
    /**
     * @param array<int,string> $columns 検索対象カラム名（すべてハードコード文字列で呼び出すこと）
     * @param string $keyword 検索キーワード
     * @return array{0:string,1:array<int,string>} [WHERE句に埋め込むSQL断片, バインドパラメータ配列]
     */
    function buildMultiColumnSearchClause(array $columns, string $keyword): array {
        $tokens = preg_split('/[\s　]+/u', trim($keyword), -1, PREG_SPLIT_NO_EMPTY);
        if (empty($tokens)) {
            return ['1=1', []];
        }

        $andClauses = [];
        $params = [];
        foreach ($tokens as $token) {
            $kata = mb_convert_kana($token, 'KVC');
            $variants = array_unique([$token, $kata, mb_convert_kana($kata, 'c'), mb_convert_kana($kata, 'k')]);
            $orClauses = [];
            foreach ($columns as $col) {
                foreach ($variants as $v) {
                    $orClauses[] = "$col LIKE ?";
                    $params[] = '%' . $v . '%';
                }
            }
            $andClauses[] = '(' . implode(' OR ', $orClauses) . ')';
        }
        return [implode(' AND ', $andClauses), $params];
    }
}
