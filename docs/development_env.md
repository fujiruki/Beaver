# 開発環境設定

## プロジェクト情報

| 項目 | 値 |
|---|---|
| AppID | Beaver（本番） / Beaver_beta（ベータ、R-0141） |
| コードベース | `C:\Fujiruki\Projects\Beaver\` |

## ポート番号

| サービス | ポート |
|---|---|
| フロントエンド（Vite） | 5178（本番・ベータ共通） |
| バックエンド（PHP） | 8003（本番・ベータ共通） |

## URL

| 環境 | URL |
|---|---|
| 開発 | `http://localhost:5178/contents/Beaver/` |
| 本番 | `https://door-fujita.com/contents/Beaver/` |
| ベータ（R-0141） | `https://door-fujita.com/contents/Beaver_beta/`。別SQLite・別AppIDで本番と分離。`upload.ps1 -Beta` でデプロイ、フロントは`VITE_APP_ID=Beaver_beta`、APIは環境変数`BEAVER_APP_ID=Beaver_beta`でビルド・起動する |

**⚠️ `upload.ps1`の`-KeepLocalDB`フラグに注意**: 名前から「リモートのDBをそのまま保持する」という意味だと誤解しやすいが、実際は逆で、**ローカルの開発用SQLiteをアーカイブに含めてアップロードし、リモート（本番/ベータ）のDBを上書きする**フラグ。コードのみをデプロイしたい通常のケース（`-Beta`でのBeaver_betaへのデプロイ含む）では**絶対に付けないこと**。2026-09-08、この誤解によりBeaver_betaのDBを一時的に上書きしてしまう事故が発生した（`docs/handover/20260906_Hikitsugi.md`以降の引き継ぎ参照）。

## 起動方法

```bash
cd C:\Fujiruki\Projects\Beaver

# バックエンド
cd api
php -S localhost:8003 index.php

# フロントエンド
cd frontend
npm run dev
```

## ヘルスチェック

- バックエンド: `http://localhost:8003/health`
- フロントエンド: `http://localhost:5178/contents/Beaver/`
