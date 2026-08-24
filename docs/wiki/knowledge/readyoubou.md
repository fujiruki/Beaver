# /readyoubou — 本番の改善要望を読み取って対応する手順

「readyoubou」は藤田晴樹さんの指示語で、**本番環境に届いた改善要望（R-0080のフィードバックフォーム投稿）を読み取り、SdDDに従って対応し、デプロイまで進める**という意味。

## 手順

1. トークンを読む: `.claude/secrets/admin_feedback_token`（Git管理外）。無ければ本番の `api/config.local.php` からSSHで取得して同じ場所に保存する
2. 取得: `GET https://door-fujita.com/contents/Beaver/api/admin/feedback` にヘッダ `X-Admin-Token: <トークン>` を付けて叩く（PHPのcurlワンライナーで可）
3. 新着分（過去対応済みidは `docs/requests_log.md` と突合）を `docs/requests.md` に原文記録し、R-IDを採番
4. 仕様化 → 実装Agentへ委譲 → 検証 → コミット → `upload.ps1` でデプロイ（許可ルール登録済み）

## 注意（2026-08-24の学び）

- **ローカルに `api/config.local.php` を置いてはいけない**。PHPテストは `ADMIN_FEEDBACK_TOKEN` 等を事前定義してビルトインサーバを起動するため、config.local.php の再defineで警告がJSON応答に混ざりテストが壊れる。また本番の `AUTH_DRIVER` を持ち込むと認証ゲートが有効化されて別のテストも落ちる。トークンは必ず `.claude/secrets/` 側に置く
- `frontend/index.html` にWuunuスニペット（未コミットのローカル変更）がある間は、デプロイ時に一時的にHEAD版へ戻してビルドし、デプロイ後に復元する（本番へ持ち込まない）
- デプロイ成功後は番頭AI（ListAgentsの `BantoAI`）へ通知を送る（藤田晴樹さんの指示、2026-08-24）
