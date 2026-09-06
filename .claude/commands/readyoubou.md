本番環境に届いた改善要望（フィードバックフォーム投稿）を読み取り、SdDDに従って仕様化・実装・検証・デプロイまで進める。

## 手順

1. **トークン取得**: `.claude/secrets/admin_feedback_token` を読む（Git管理外）。無ければ本番の `api/config.local.php` からSSHで取得し同じ場所に保存する。**ローカルに `api/config.local.php` を置いてはいけない**（PHPテストのビルトインサーバ起動時にJSON応答が壊れ、`AUTH_DRIVER`混入で別テストも落ちる）
2. **本番フィードバック取得**: `GET https://door-fujita.com/contents/Beaver/api/admin/feedback` にヘッダ `X-Admin-Token: <トークン>` を付けて叩く（PHPのcurlワンライナーで可）
3. **新着分の抽出**: 取得したidを `docs/requests_log.md` の既存記録と突合し、未対応分だけを対象にする
4. **要望の記録**: 新着分を `docs/requests.md` へ原文のまま記録する。仕様化を始めるものには `SDDD.md` の採番規則でR-IDを付ける
5. **仕様化**: 曖昧な点は藤田晴樹さんに確認する。確定したら `docs/requests_log.md`・`docs/spec/`・`docs/SPEC.md`・`task.md` を更新し、`docs/requests.md` の該当項目を削除する（`SDDD.md` の「仕様が確定した時」の手順どおり）
6. **実装**: 指揮役はコードを直接編集しない。実装はAgentへ委譲する（Beaver CLAUDE.mdの委譲規律に従う：トークン予算・再試行上限を事前宣言、行き詰まったら`fixer`エージェントへ）
7. **検証**: Agentの完了報告を指揮役が再実行して裏取りする（vitest・PHPテスト・回帰スイート `bash .claude/regression-suite.sh`）
8. **コミット**: 検証OK後にコミット
9. **デプロイ**: `upload.ps1` を実行（許可ルール登録済み）。`frontend/index.html` にWuunuスニペット（未コミットのローカル変更）がある場合は、一時的にHEAD版へ戻してビルド→デプロイ後に復元する（本番へ持ち込まない）
10. **デプロイ後確認**: `/api/health` とアプリ本体の200応答を確認する
11. **通知**: デプロイ成功後、番頭AI（ListAgentsの `BantoAI`）へ通知を送る
12. **引き継ぎ更新**: `docs/handover/Hikitsugi_LATEST.md` に対応内容・コミットSHA・確認結果を追記する

## 注意

- `SDDD.md` が正本。手順で迷ったら `SDDD.md` を優先する
- 詳細な背景・過去の学びは `docs/wiki/knowledge/readyoubou.md` を参照する
- 藤田晴樹さんの許可なく実装・デプロイを進めない（仕様確定の確認、実装着手の確認は都度取る）
