# R-0090: 検索のひらがな/カタカナ正規化＋空白区切りAND検索

## 背景

R-0080フィードバック（id=9、2026-08-05 04:50）より。

> 検索のときにひらがな・カタカナの揺れに対応してほしい。どちらでもまっちするように。それと空白区切りでアンド検索もできるといいな

## 対象

`api/search_helpers.php` の `buildMultiColumnSearchClause`（R-0083で新設、得意先検索 `api/routes/customers.php` で使用中）を拡張する。

## 仕様

- キーワードを空白（半角スペース・全角スペース）区切りでトークン化し、**各トークンはAND**（全トークンにマッチする行のみ）、**1トークン内では複数カラム×ひらがな/カタカナ両方の表記でOR**マッチにする
- 各トークンについて、そのままの表記に加え、`mb_convert_kana($token, 'c')`（カタカナ→ひらがな）・`mb_convert_kana($token, 'C')`（ひらがな→カタカナ）の変換形も生成し、重複を除いた上でLIKE条件に含める
- 既存の呼び出し元（`customers.php`の得意先検索）は変更不要（関数のシグネチャ・戻り値の形は維持する: `[SQL断片, パラメータ配列]`）
- 既存の単一トークン検索の挙動（後方互換）が壊れないこと

### 関数のイメージ

```php
function buildMultiColumnSearchClause(array $columns, string $keyword): array {
    $tokens = preg_split('/[\s　]+/u', trim($keyword), -1, PREG_SPLIT_NO_EMPTY);
    if (empty($tokens)) return ['1=1', []];
    $andClauses = [];
    $params = [];
    foreach ($tokens as $token) {
        $variants = array_unique([$token, mb_convert_kana($token, 'c'), mb_convert_kana($token, 'C')]);
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
```

## 受け入れ条件

1. 得意先検索で、ひらがな入力でカタカナ表記の`name_kana`にマッチすること（逆も同様）
2. 得意先検索で、空白区切りの複数キーワードが全て含まれる行のみヒットすること（AND）
3. 既存のR-0083テスト（`api/tests/test_customers.php` T-14〜T-18）が壊れないこと
4. 新規のケース（かな正規化・AND検索）をTDDでテスト追加すること

## 非スコープ
- このヘルパーを使う他の検索画面（案件検索等）への適用はR-0091側で別途対応する
