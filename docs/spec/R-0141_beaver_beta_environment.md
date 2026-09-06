# R-0141: AccessTategu ベータ用の Beaver ベータ環境

作成日: 2026-09-06　実装: Beaver 側（backpc）　状態: 仕様化済み・着手可

## 目的

AccessTategu の R-086 ベータ（`beta\tate202403_beta_dev.accdb`）から Beaver 同期を再開するとき、同期先が本番 Beaver（`https://door-fujita.com/contents/Beaver/api/`）にならないよう、本番と同じコードを**別 SQLite** に対して動かすベータ環境を用意する。AccessTategu 側 R-108（同期先 URL の切替）と対。

## 仕様

| 項目 | 本番 | ベータ |
|---|---|---|
| AppID | `Beaver` | `Beaver_beta` |
| URL | `https://door-fujita.com/contents/Beaver/` | `https://door-fujita.com/contents/Beaver_beta/` |
| API | `.../contents/Beaver/api/` | `.../contents/Beaver_beta/api/` |
| SQLite | `api/database.sqlite` | ベータ配置先の `api/database.sqlite`（本番の複製から開始） |
| 認証 | auth-hub（`df_session` Cookie） | 本番と同じにする。`api/auth_client.php` はCookie名（`df_session`）のみで検証しており、app_id相当の概念自体を持たない（auth-hub側にアプリ単位の許可リストも見当たらない）。ベータもdriver=shared・base=`https://door-fujita.com/contents/auth`のまま流用し、ログイン状態も本番と共有される（`df_session`は`path=/`のドメイン共通Cookieのため、CLAUDE.mdの例外規定どおり） |
| ローカル開発 | 5178 / 8003 | ローカルは既存のまま（ローカル開発環境自体がベータ扱い）。追加ポートは不要 |

- `BASE_PATH`（`api/config.php`）と Vite の `base` を AppID から切り替えられるようにする。`.env` またはビルド引数で `Beaver_beta` を指定してビルド・配置できること
- Cookie・LocalStorage・Cache のプレフィックスは `[AppID]_` の規約に従い、ベータでは `Beaver_beta_` になること（本番と混ざらない）
- デプロイ手順 `upload.ps1` にベータ向けの配置先切替（引数）を追加する
- `docs/development_env.md` と `CLAUDE.md` の AppID・ポート表にベータ行を追記する
- ベータの SQLite は本番の複製で初期化し、R-0140 (5) の変換をベータで先に試す場として使う

## 受入条件

| # | 確認 | 期待 |
|---|---|---|
| 1 | `https://door-fujita.com/contents/Beaver_beta/api/health` | 200 |
| 2 | ベータの画面でログインして伝票一覧が開く | 本番の複製データが見える。本番の SQLite は変化しない |
| 3 | ベータに `POST /vouchers/sync` で検体 `voucher_sales_12962.json` を送る | ベータの SQLite だけに入る。本番に無い |
| 4 | ブラウザの Cookie 名 | `Beaver_beta_` で始まる（※実装時の訂正: Beaverが独自に発行するCookieは存在せず、`[AppID]_`規約で分離されるのはLocalStorageキーのみ。認証Cookie`df_session`はドメイン共通の意図的な例外のため対象外。実質的な検証項目は「LocalStorageキーが`Beaver_beta_`で始まる」に読み替える） |
| 5 | `upload.ps1` を本番向けに実行 | ベータ配置先は変化しない（逆も同じ） |

## 実装メモ（コード側、2026-09-06完了）

- `api/config.php`: 環境変数 `BEAVER_APP_ID` から `APP_ID`/`BASE_PATH` を導出（未指定時は`Beaver`のまま、後方互換）
- `frontend/vite.config.ts`: `VITE_APP_ID`（`.env`またはシェル環境変数）から `base` とdevプロキシを導出
- `frontend/src/lib/appId.ts`: `APP_ID`・`APP_STORAGE_PREFIX`を一元管理。本番AppID（`Beaver`）のみ既存の`bv_`を維持し、それ以外は`{AppID}_`にする後方互換ルール
- `upload.ps1`: `-Beta`スイッチで配置先・ビルド時AppID・`.htaccess`の`RewriteBase`/`SetEnv BEAVER_APP_ID`を切替。引数省略時の本番向け配置先文字列は変更なし
## 本番サーバー側構築・実機疎通確認（2026-09-06完了）

- `upload.ps1 -Beta` でBeaver_betaディレクトリを新規作成・コード一式デプロイ（既存の本番Beaverには一切触れず）
- 本番`api/database.sqlite`・`api/config.local.php`をSSH `cp`でBeaver_beta用に複製（ファイルサイズ一致確認済み: DB 8159232バイト、config.local.php 889バイト）
- 受入条件1: `curl https://door-fujita.com/contents/Beaver_beta/api/health` → 200確認済み（レスポンス本文の`'app':'Beaver'`は固定文字列のバグ、後述）
- 受入条件2: ブラウザ（Chrome自動化）で`https://door-fujita.com/contents/Beaver_beta/`にアクセスし、`df_session`共有Cookieでログイン状態のまま自動的にダッシュボードが開くことを確認。本番複製データ（進行中12件等）が表示され、本番Beaverの`/api/health`は作業前後で200のまま無傷なことを確認
- 受入条件4: `Beaver_beta`のJSバンドルに文字列`"Beaver_beta"`が実際に埋め込まれていることを確認（LocalStorageキーの`Beaver_beta_`プレフィックスはコード上保証済み、実データでの確認は次回ページ操作時に）
- 受入条件3・5は未実施（(3)はR-0140(5)関連でAccess側のタイミング調整待ち、(5)は`upload.ps1`を本番向けに実行するテストは今回省略）
- BASE_PATH切替の実機確認: `curl https://door-fujita.com/contents/Beaver_beta/api/nonexistent` → `{"error":"Not found","path":"/nonexistent"}`。`SetEnv BEAVER_APP_ID`がConoHa WINGのPHPに正しく反映されることを確認（この仕様書§受入条件1で「未確認」としていた懸念点はクリア）

### 発見したバグ（実害なし、次回修正）
`api/index.php`の`/health`エンドポイントが`{"status":"ok","app":"Beaver"}`と固定文字列を返す（`APP_ID`定数を使っていない）。ルーティング自体はBASE_PATH経由で正しく動作しているため実害はないが、`'app' => APP_ID`に直すのが望ましい。

## Access 側に渡す情報

- ベータ API のベース URL: `https://door-fujita.com/contents/Beaver_beta/api`（疎通確認済み）
- 認証方式: auth-hub driver=shared、`df_session` Cookie（本番と共通。上表「認証」参照）
- SQLite を本番から再複製する手順: `ssh`で本番サーバーに接続し、`cp public_html/door-fujita.com/contents/Beaver/api/database.sqlite public_html/door-fujita.com/contents/Beaver_beta/api/database.sqlite && chmod 666 .../Beaver_beta/api/database.sqlite`
