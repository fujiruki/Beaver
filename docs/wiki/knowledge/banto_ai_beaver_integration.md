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

### トークンを更新（ローテーション）する時の反映手順

Beaver側で`BANTO_API_TOKEN`を変更したら、番頭AI側にも新しい値を反映する必要がある。

- **どこにある**: `C:\claude-workspace\.env`ファイルの`BEAVER_API_TOKEN=`の行（Beaver側の定数名は`BANTO_API_TOKEN`だが、番頭AI側の`.env`キー名は`BEAVER_API_TOKEN`。名前が違うので注意）
- **何を**: `BEAVER_API_TOKEN=`の後ろの値を、Beaver側で新しく生成した値に置き換える（同じ行に`BEAVER_API_BASE=`もあるはずだが、そちらはURLなので通常は変更しない）
- **誰が**: 藤田晴樹さん自身がテキストエディタで`.env`ファイルを直接編集する（番頭AIやBeaver側のAIセッションがこのファイルを書き換えることはしない。`shared/beaver_helper.py`のコメントに書かれている運用ルール）
- **どうやって**:
  1. `C:\claude-workspace\.env`をメモ帳等で開く
  2. `BEAVER_API_TOKEN=`の行を見つけ、`=`の後ろを新しい値に書き換えて保存する
  3. 番頭AI（`shared/beaver_helper.py`の`_load_env()`）はBeaver APIを呼ぶたびに`.env`を毎回読み直す実装のため、**番頭AIプロセスの再起動は不要**。保存した直後の次の呼び出しから新しい値が使われる
  4. 動作確認は、番頭AIに「Beaverの得意先一覧を見せて」のような軽い操作を頼み、エラーにならないことを見る程度でよい

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

### 案件ステータス（`projects.status`）は既存リストのみ使用すること

`POST /projects` / `PUT /projects/{id}` の `status` はAPI側でバリデーションされておらず、任意の文字列を渡せてしまう（`api/routes/projects.php`参照）。しかし正しい値は `project_statuses` テーブル（`api/migrations/023_project_statuses.sql`）で定義された以下のみ：

```
問い合わせ, 見積済, 受注済, 進行中, 納品済, 請求済, 完了, キャンセル
```

`status` を省略した場合のデフォルトは `問い合わせ`。番頭AIが案件を新規登録する際、見積もり前の新規問い合わせ段階では独自の値（例:「見積前」）を作らず、必ず `問い合わせ` を使うこと（2026-08-20、番頭AIが独自ステータスを登録し晴樹さんから指摘を受けた実例あり）。

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
