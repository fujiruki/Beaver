# R-038 customers API — access_customer_no サポート

## 概要

AccessTategu の `tbl得意先M` 全件 push を受け入れるため、Beaver の customers API を拡張。

## API 変更点

### POST /customers

| 追加フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `access_customer_no` | string \| null | AccessTategu の得意先番号（任意） |

**upsert 動作:**

- `access_customer_no` が payload にあり、DB に既存レコードが見つかった場合 → `200 OK` で UPDATE
- 未存在の場合 → `201 Created` で INSERT
- 別レコードに同じ `access_customer_no` が存在する場合 → `409 Conflict`

### PUT /customers/{id}

`access_customer_no` を更新フィールドに追加。UNIQUE 制約違反は `409 Conflict` を返す。

## DB 変更

| migration | 内容 |
| :--- | :--- |
| `009_customers_access_customer_no.sql` | `access_customer_no TEXT` 列追加（既存） |
| `013_customers_access_customer_no_unique.sql` | 部分 UNIQUE インデックス追加（NULL を除外） |

```sql
CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_access_customer_no
    ON customers(access_customer_no)
    WHERE access_customer_no IS NOT NULL;
```

## テスト

`api/tests/test_customers.php` に以下を追加:

- T-01: access_customer_no 指定で新規 INSERT → 201
- T-02: 同じ access_customer_no で POST → 200 UPDATE (upsert)
- T-03: PUT /customers/{id} で access_customer_no 更新
- T-04: UNIQUE 制約違反 → 409
