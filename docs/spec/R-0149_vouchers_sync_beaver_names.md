# R-0149: `/vouchers/sync`に得意先名・案件名の生データを追加する

## 背景

dodai-back（AccessTategu側backpc指揮役）より（2026-10-04、`docs/requests.md` §35）:

> `/vouchers/sync`エンドポイント(api/routes/vouchers.php:89-100のSELECT)が、得意先情報として`access_customer_no`だけを返しており、Beaver側の生の得意先名(`customers.name`)を一切含んでいない。AccessTategu側の競合解決画面で、まだAccessとリンクされていない新規得意先の伝票を見ると、Beaver版の得意先名が永遠に「該当なし」としか表示されず、見積/売上の内容を比較・判断する材料がない。

同様に案件名についても、`project_id`はあるが`projects`テーブルとのJOIN自体が無く、案件名が取得できない。

## 調査結果

`api/routes/vouchers.php`の`GET /vouchers/sync`（89〜100行目付近）のSELECTは`customers`をLEFT JOINして`access_customer_no`のみ取得しており、`projects`とのJOINは無い。

案件IDについては`docs/from_access/20260906_R-086_Beaverスキーマ対応表.md`§2.2の既存調査で、Access/Beaver間の**共通ID**（`projects.id`をAccess側「案件番号」としてそのまま使用）と判明済み。Beaver側にAccess案件ID専用の別列は存在せず、既存の`v.project_id`自体が共通IDの役割を果たすため、新規の「project_access_no」相当の列は不要（dodai-backにもこの旨を回答し合意済み）。

## 対応方針

`api/routes/vouchers.php`の`GET /vouchers/sync`のSELECT文を変更する。

1. 既存の`customers` LEFT JOINに`c.name AS beaver_customer_name`を追加
2. `projects`テーブルへの新規LEFT JOIN（`LEFT JOIN projects p ON p.id = v.project_id`）を追加し、`p.name AS beaver_project_name`を取得
3. `project_access_no`相当の列は追加しない（`v.project_id`が既に共通IDのため）

`/customers/sync`・`/projects/sync`は自テーブルの`name`を直接返す構造のため変更不要（確認済み）。

## TDD

`api/tests/test_sync.php`の「R-076 B2-1 GET /vouchers/sync のヘッダ項目拡張」節に追加:
1. レスポンスの各伝票に`beaver_customer_name`・`beaver_project_name`キーが存在すること
2. `beaver_customer_name`が紐づく得意先の`customers.name`と一致すること
3. `beaver_project_name`が紐づく案件の`projects.name`と一致すること
4. `project_id`がNULL（過去伝票モード）の伝票は`beaver_project_name`がnullであること
5. 既存の項目（`customer_access_no`等）に回帰がないこと

## 受け入れ条件

1. `GET /vouchers/sync`のレスポンスに`beaver_customer_name`・`beaver_project_name`が追加される
2. 既存のレスポンス項目・値に変更がない（純粋な追加）
3. `project_id`がNULLの伝票では`beaver_project_name`がnull
4. 既存テスト・回帰スイートが通る
