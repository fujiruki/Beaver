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
