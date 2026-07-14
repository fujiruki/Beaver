# 本番デプロイ: SSH遮断時のFTPSフォールバック手順

2026-07-14、`upload.ps1`が前提とするSSH/SCP（`www1045.conoha.ne.jp:8022`）がConoHa側でブロックされる事象が発生。FTPS（明示的AUTH TLS、ポート21）は生きていたため、これを使った代替デプロイ手順を確立した。

## 前提条件（確認済み）

- FTPSアカウント: `ai@door-fujita.com`（別途安全な経路で入手すること。本ページには書かない）
- 接続先は`upload.ps1`と同じサーバー（`www1045.conoha.ne.jp`）、ホームディレクトリ配下は同じファイルツリー
- デプロイ先: `public_html/door-fujita.com/contents/Beaver/`（`upload.ps1`の`$remoteDir`と同一）
- 本番DB: `api/database.sqlite`。**手動バックアップの慣行が既にある**（`api/backups/database_YYYYMMDD[_説明].sqlite`、`api/backup.log`に記録）。**自動日次バックアップは2026-06-09以降停止している**（R-027b、別課題）。デプロイ・マイグレーション前は必ず手動バックアップを取ること

## curlでのFTPS接続

```bash
curl --ssl-reqd -k "ftp://www1045.conoha.ne.jp/<path>" --user "<user>:<pass>" ...
```

- `--ssl-reqd`（明示的AUTH TLS、ポート21）を使う。`ftps://`スキーム＋暗黙的TLS（ポート990）は本環境からは接続タイムアウトした（サンドボックス側でポート990が塞がれている可能性）
- **大きめのファイル（数十KB〜）で`curl: (18) server did not report OK, got 451`が頻発する**。原因はWindows版curl（Schannel）とサーバー（Pure-FTPd）間のTLS再ネゴシエーション絡みの相性問題（`Shutdown send direction error: 81`が併発）。**`--tlsv1.2 --tls-max 1.2`でTLSバージョンを固定すると解消する**。最初から全アップロードにこのオプションを付けるのが安全
- 個別ファイルのDELETEは`-Q "DELE <FTPルートからの絶対パス>"`を使う。URLをディレクトリに向けても`PWD`は`/`のままなので、相対パスでの`DELE`は失敗する（`550 No such file or directory`）

## マイグレーションの当て方（SSHが無い場合）

FTPはリモートコマンド実行ができないため、SSH経由の`sqlite3 < migration.sql`が使えない。代わりに:

1. 一回限りのPHPスクリプト（ワンタイムトークンで保護）をFTPSで`api/`直下にアップロード
2. スクリプトの中身: (a) `copy()`でサーバー上の`database.sqlite`を`backups/`へバックアップ、(b) PDOでmigrationのSQLをその場で適用、(c) 結果（テーブル存在確認等）を出力
3. HTTPSで1回だけアクセスして実行、出力を確認
4. スクリプトをFTPSで削除（`-Q "DELE ..."`、絶対パスで）

ダウンロード→ローカルで書き換え→再アップロードという方式は、その間の本番書き込みが失われるレース条件があるため避けること。サーバー上のPHPスクリプトで完結させれば、この種の競合は発生しない。

## 実例（2026-07-14、R-076 ADR-003 P0デプロイ）

- migration 021（`tategu_item_cost_lines`/`tategu_item_labor_lines`新設）を上記手順で適用
- バックアップ: `api/backups/database_20260714_145125_pre_r076_tategu_cost_lines.sqlite`
- コード74ファイル（frontend/dist全体 + api/一式、`.sqlite`/`.db`/`tests/`除外）をFTPSでアップロード。初回9件が451で失敗、`--tlsv1.2 --tls-max 1.2`付きで再送し全件成功
- デプロイ後、`/api/health`・`/api/tategu-items`等で疎通確認済み

---
所有者: 藤田晴樹 / しっきー(AI指揮役)
最終検証日: 2026-07-14
