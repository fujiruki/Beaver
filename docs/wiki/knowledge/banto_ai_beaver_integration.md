# 番頭AI(claude-workspace)からBeaver APIを叩く方法（R-0110）

番頭AI（`C:\claude-workspace`で動作するAIセッション）が、ブラウザを介さずBeaver APIへ直接得意先・案件・見積伝票等を登録できるようにするための接続情報。

## 認証

R-0109でBeaver全体がauth-hub経由のログイン必須になったが、番頭AIはブラウザセッションを持たないため、代わりに固定トークンでの認証を使う。

```
Authorization: Bearer <BANTO_API_TOKEN>
```

- トークンの値は本ページに書かない。藤田晴樹さんから別途安全な経路で受け取ること
- トークンが一致すれば、auth-hubへのログインなしで全画面系APIを呼べる（`api/auth_gate.php`の`authGateHasValidBantoToken()`参照）
- 対象外（トークン不要）のエンドポイント: `GET /health`, `POST /feedback`, `GET /admin/feedback`, パスに`sync`を含むもの、末尾が`access-link`のもの（いずれもR-0109参照）

## ベースURL

```
https://door-fujita.com/contents/Beaver/api
```

## エンドポイント一覧

全エンドポイントは `C:\Fujiruki\Projects\Beaver\api\index.php` の `$routes` 配列と各 `api/routes/*.php` が正本。主に使うのは以下:

| リソース | パス | 用途 |
|:--|:--|:--|
| 得意先 | `/customers` | `GET`一覧・`POST`新規作成・`GET /customers/{id}`詳細・`PUT /customers/{id}`更新 |
| 案件 | `/projects` | `GET`一覧・`POST`新規作成・`GET /projects/{id}`詳細・`PUT /projects/{id}`更新 |
| 伝票（見積・売上） | `/vouchers` | `GET`一覧・`POST`新規作成・`GET /vouchers/{id}`詳細・`PUT /vouchers/{id}`更新 |

フィールド仕様（必須項目・型）はコード（`api/routes/customers.php` / `projects.php` / `vouchers.php`）を直接参照するのが最も確実。

## リクエスト例

```bash
curl -X POST "https://door-fujita.com/contents/Beaver/api/customers" \
  -H "Authorization: Bearer <BANTO_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name": "山田様邸"}'
```

```bash
curl -X GET "https://door-fujita.com/contents/Beaver/api/projects?q=山田" \
  -H "Authorization: Bearer <BANTO_API_TOKEN>"
```

## スコープ外

- 「誰が登録したか」（`created_by`）の記録は未実装。番頭AI経由で登録したレコードも他の登録と区別されない
- 複数トークンの発行・失効管理はない。トークン漏洩時は`config.local.php`の`BANTO_API_TOKEN`を藤田晴樹さんが差し替える運用
