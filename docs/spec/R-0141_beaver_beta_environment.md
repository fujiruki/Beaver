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
- 受入条件1〜3・5の実機確認（ベータ用ディレクトリ・SQLite複製を含む本番サーバー作業）は本セッションのスコープ外

## Access 側に渡す情報（本番サーバー側のベータ環境構築後に追記）

- ベータ API のベース URL: `https://door-fujita.com/contents/Beaver_beta/api`（サーバー側配置完了後に疎通確認して確定）
- 認証方式: auth-hub driver=shared、`df_session` Cookie（本番と共通。上表「認証」参照）
- SQLite を本番から再複製する手順: 未整備（本番サーバー作業のため今回のスコープ外。次回、指揮役がベータ用ディレクトリ作成時に手順を確定しここへ追記する）
