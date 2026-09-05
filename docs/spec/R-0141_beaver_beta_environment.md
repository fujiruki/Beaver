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
| 認証 | auth-hub（`app_id=Beaver`） | auth-hub の `app_id` を `Beaver_beta` にするか本番と同じにするかを決め、決めた内容をここに追記 |
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
| 4 | ブラウザの Cookie 名 | `Beaver_beta_` で始まる |
| 5 | `upload.ps1` を本番向けに実行 | ベータ配置先は変化しない（逆も同じ） |

## Access 側に渡す情報（完了時にここへ追記）

- ベータ API のベース URL
- 認証方式（app_id、トークン）
- SQLite を本番から再複製する手順（Access 側の再テストのたびに初期化したい）
