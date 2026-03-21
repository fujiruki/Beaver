# 開発環境設定

## プロジェクト情報

| 項目 | 値 |
|---|---|
| AppID | Beaver |
| コードベース | `C:\Fujiruki\Projects\Beaver\` |

## ポート番号

| サービス | ポート |
|---|---|
| フロントエンド（Vite） | 5178 |
| バックエンド（PHP） | 8003 |

## URL

| 環境 | URL |
|---|---|
| 開発 | `http://localhost:5178/contents/Beaver/` |
| 本番 | `https://door-fujita.com/contents/Beaver/` |

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
