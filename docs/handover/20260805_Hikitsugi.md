## 過去の作業（2026-08-05）: SdDDテンプレート改訂の導入 + R-0080 改善要望フィードバックフォーム

### SdDDテンプレート改訂 ✅ 完了
- 参照リポジトリが `C:\Fujiruki\00_AI共通\spec-docs-driven-dev-template` から `C:\Fujiruki\Projects\SDDD` に更新されていたため、Beaverへ安全にアップグレード適用
- `SDDD.md`（ツール非依存の正本ルール）・`AGENTS.md` を新規追加、`CLAUDE.md` を `sddd:rules`/`sddd:project` マーカー付きアダプター構成に変更（既存のBeaver固有ルールは無変更）
- `docs/request_log.md` → `docs/requests_log.md` にリネーム（git mv、履歴保持）
- 新しい要望IDは `R-0001` 形式（4桁連番）を採用。次の新規IDは `R-0080` から開始済み
- コミット `0a05d60`

### R-0080: 改善要望フィードバックフォーム ✅ 実装・検証完了、本番デプロイは未実施（ブロック中）
- Beaver内どの画面からも開ける「改善要望を送る」ボタン→本文＋画像最大5枚を添付して送信
- `feedback`/`feedback_images`テーブル（migration 022）、`POST /feedback`、`GET /admin/feedback`（`X-Admin-Token`認証、開発側=Claudeが本番データを直接読みに行く用）
- 実装はCodex（`codex:codex-rescue`）に委譲、TDDでPHPテスト8件・vitest 6件を追加。指揮役が再実行して検証: PHPテスト8/8 PASS、vitest 19ファイル108件 PASS、`npm run build` exit 0、`regression-suite.sh` exit 0（🔵青）
- 仕様: `docs/spec/R-0080_feedback_form.md`
- コミット `e479c1d`
- **本番デプロイは未実施**: `upload.ps1`が前提とするSSH鍵（`C:\Fujiruki\Projects\AI_DEVELOP_RULES\UPLOAD\key-2025-11-29-07-10.pem`）がこのマシン（backPC）上に存在せず（ディレクトリごと無い）、SSH接続がPermission deniedで失敗。FTPS代替手順（`docs/wiki/knowledge/deploy_ftps_fallback.md`）もアカウント`ai@door-fujita.com`の認証情報が必要で、このセッションには無い
- **次回セッションでやること**: (a) SSH鍵をbackPCへ配置してもらう、(b) FTPSアカウント情報を安全な経路で受け取る、(c) 藤田晴樹さん側で`upload.ps1`を実行してもらう、のいずれかで本番反映を完了させる。migration 022は`CREATE TABLE IF NOT EXISTS`のみで既存データに影響しない安全な追加のみ
- 本番反映時は他のmigrationと同様に事前バックアップ必須。`api/config.local.php`（`ADMIN_FEEDBACK_TOKEN`、Git管理外）を本番に手動設置することを忘れないこと（`upload.ps1`はこのファイルをステージングから除外するよう修正済み）

---
