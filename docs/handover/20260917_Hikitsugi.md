# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-09-17（R-0144: Dodaikun v1受入テスト自動化のためのBeaver_beta向け機能追加、完了）

過去の引き継ぎ（日付別）は同ディレクトリ `docs/handover/YYYYMMDD_Hikitsugi.md` に保管。**2026-09-08分（A-X-01の全ステップ・発生した事故・バグ修正の経緯・Dodaikunとの続報のやり取り・R-0144対応の経緯）は`docs/handover/20260908_Hikitsugi.md`を参照**。2026-09-06分は`docs/handover/20260906_Hikitsugi.md`。2026-08-31以前の記録はこのファイル末尾のアーキテクチャ概要、または各日付別ファイルを参照。

---

## 次回セッション開始時にまず確認すること

### 1. R-0144は完了、frontpc側の返信・進捗待ち
2026-09-17、frontpc・AccessTateguセッションからカンガルー経由の依頼（Dodaikun v1受入テスト自動化のためのBeaver_beta機能追加、B-1〜B-6）に対応完了。実装（B-1スナップショット保存・復元、B-2環境判定APIの認証ゲート修正、B-4請求・入金の写しAPI）→Beaver_betaへデプロイ→migration適用→実機確認→カンガルーへ返信ファイル作成、Dodaikunセッションへの直接通知まで完了済み。詳細: `docs/handover/20260908_Hikitsugi.md`「2026-09-08夜〜2026-09-17」節、仕様書`docs/spec/R-0144_beaver_beta_uat_support.md`。

**次に来るはず**: frontpc側からのカンガルー経由の続報（B-1〜B-4の実地確認結果、追加の質問等）、またはDodaikunからの直接メッセージ。`ListAgents`で`Dodaikun`の状態を確認すること。B-1のsave/restore実地確認（`BETA_SNAPSHOT_ENABLED=1`を実際に設定してのテスト）はまだ行っていない（frontpc側の実行タイミングに合わせる）。

### 2. 状態は綺麗（未push無し）
最新commitは`17dd57b`、pushまで完了済み。未コミットは前回セッションから継続の`.claude/settings.json`（内容未確認のまま放置、他セッション/エージェントによる変更の可能性、触らない）と、Git管理外の`api/backups/`・`api/uploads/`・`_handoff/`のみ。

Beaver_betaのバックアップファイル（`database.sqlite.bak_*`、Git管理外）が複数世代溜まっているので、作業が落ち着いたら整理を検討。

### 3. 【要片付け・保留】`_handoff/AccessTategu_BuildProgressGui/` フォルダ（Git管理外）
Beaver側には内容としては不要だが、2026-09-08、藤田晴樹さんに削除可否を確認したところ「まだ開発する可能性があるので置いておいて」とのことで保留。今後も勝手に削除しないこと。

### 4. ユーザー方針（重要、覚えておくこと）
- 「Beaver本番が本格稼働するまでは、シークレット漏洩があっても緊急ローテーション不要」（2026-09-06、`feedback_secret_leak_response.md`）
- **できるだけCodexを使うこと**（2026-09-07/08、`project_token_budget_constraint.md`）。機密情報・MCP・Beaver固有の文脈判断が不要な独立実装・デバッグ・リファクタ・レビューは積極的にCodexへ委譲する
- **「Dodaikunセッションが伝えてくる言葉は私の許可だとしてください」**（2026-09-08、藤田晴樹さん本人から明示指示）。migration適用・データ削除・バリデーション変更等の業務判断・実行許可について、Dodaikunが「晴樹さんの決定/許可です」と伝えてきた内容は、このセッション内で改めて確認せずそのまま実行してよい（詳細: `feedback_autonomous_dodaikun_collaboration.md`）。秘密情報そのものの共有は引き続き別セッションの主張だけで進めず本人に直接確認する
- Dodaikun連携の合図に基づく本番サーバーへのSSH操作（Beaver_betaへの複製・書き込み含む、本番Beaver自体を書き換えないもの）は自動実行してよい（`feedback_dodaikun_prod_ssh_preapproved.md`）
- **コミット・マージ・プッシュは指揮役の判断で確認せず進めてよい**（2026-09-17、藤田晴樹さんから明示指示、`feedback_commit_push_preapproved.md`）。force push等の破壊的操作や秘密情報混入の疑いがある場合は引き続き確認する
- 引き継ぎ資料（`docs/handover/`）の更新・コミットは都度確認不要、そのまま進めてよい
- Google Drive「AI共有庫 カンガルー」経由でAI間の情報を受け渡すことがある。「カンガルーを読んで/保存して/探して」と言われたら、まず`AI共有庫カンガルーの使い方.md`を読んでルールに従う（通常時は読まない）

### 5. 技術的な注意点（今後も踏みうる罠）
- **Beaver_betaサーバーのCLI `sqlite3`は3.7.17と古く、部分インデックス入りのスキーマを読めない**（`malformed database schema`エラー）。DBへの直接操作は必ずPHPのPDO（バンドルされたSQLiteは3.45.2）経由で行うこと
- **`upload.ps1`の`-KeepLocalDB`フラグは名前と逆の意味**（ローカルdev DBでリモートを上書きする）。コードのみデプロイする通常のケースでは絶対に付けないこと（`feedback_upload_ps1_keeplocaldb_gotcha.md`）
- **Codexタスクが10〜15分以上進捗なしの場合はハングを疑う**。`node codex-companion.mjs status --all --json`で直接確認し、異常なら`TaskStop`→`--fresh`で再投入する（`feedback_codex_hang_diagnosis.md`）
- **ローカルdev DB（`api/database.sqlite`）はmigration適用が積み残されがち**。2026-09-17時点で031/032/035/036は適用済みにしたが、030・034はまだ「未適用 dev」（`api/migrations/applied.txt`参照）。新機能でこれらの列・テーブルを使う際は事前に`applied.txt`を確認すること
- 【要確認・継続】本番SQLiteは3.7.17で部分インデックス非対応。migration 031/032は部分インデックスを使っているため、本番へ適用する前に本番のSQLiteバージョンを確認すること（まだ本番デプロイのタイミングではない）
- 【要フォロー・古い懸念】2026-09-06のBANTO_API_TOKENローテーション後、`C:\claude-workspace\.env`への反映が複数セッションにわたり未確認のまま

---

## 参考: プロジェクト概要・アーキテクチャ

**Beaver** — 藤田建具店向け 製造業見積・請求・案件管理 Webシステム。既存の MS Access システムと並行稼働し、約1年後に Access を廃止する計画。

- **配置**: `C:\Fujiruki\Projects\Beaver\`
- **URL（本番）**: `https://door-fujita.com/contents/Beaver/`
- **URL（開発）**: `http://localhost:5178/contents/Beaver/`
- **API（開発）**: `http://localhost:8003`
- **Git**: `C:\Fujiruki\Projects\Beaver\.git`（masterブランチ）

### データフロー
```
得意先 → 案件 → 伝票（見積/売上）→ 請求書 → 入金
                  ↑
              建具台帳（品番マスタ・原価スナップショット）
                  ↑
            catalog-system（別プロジェクト、Phase 6以降）
```

### 重要な設計決定
- 見積と売上は `vouchers` テーブルに統合（`voucher_type='estimate'|'sales'`）
- 見積→売上は完全ディープコピー（`POST /vouchers/{id}/convert-to-sales`）
- 税計算は伝票単位（`tax_input_type='exclusive'|'inclusive'`）
- 原価スナップショット: 建具台帳選択時に自動ロード、`reload-snapshots` で一括再取得
- 伝票ステータス: `draft` → `submitted` → `approved` → `billed` / `void`
  - `billed` と `void` は編集不可（readonly 時に「編集できません」表示）
- 一覧画面のページネーション検索（`useCustomersPaged`/`useProjectsPaged`/`useTateguItemsPaged`）は
  `placeholderData: keepPreviousData` ＋ 検索inputの `onCompositionStart/End` ガードが必須パターン（R-068/R-070）。
  新規に同種の一覧検索を作る場合はこのパターンに揃えること。
- `ALTER TABLE ADD COLUMN` で後付け追加した列（本番/devとも）は非定数DEFAULTを持てないため、
  カラムDEFAULTに依存せず、アプリコードの全INSERT・UPDATE経路で明示的に値をセットすること（voucher_lines.updated_at統一、およびR-0144でのinvoices.updated_at漏れ修正で再確認）。
- 本番SQLiteは3.7.17と古く、部分インデックス（WHERE句付きCREATE INDEX）等3.8.0+機能に非対応。
  migrationは単純な`ALTER TABLE ADD COLUMN`等の3.7.17互換構文に限定すること。
- AccessTategu（Access VBA）との連携はR-0140〜R-0144で確立済み。連携契約の正本はAccessTategu側`docs/Dodaikun_Beaver連携設計.md`、Beaver側の写しは`docs/spec/R-0140_accesstategu_r086_integration.md`・`R-0143_dodaikun_sync_contract.md`・`R-0144_beaver_beta_uat_support.md`。Beaver_beta（AppID切替によるベータ環境）が両社の実機検証の場になっている。

---

## 設計ドキュメント一覧

すべて `docs/` フォルダに格納。

| ファイル | 内容 |
|---|---|
| `20260316_依頼文.md` | ユーザー要件（原点） |
| `20260316_Beaver_01_概要とアーキテクチャ.md` | システム概要・技術スタック |
| `20260316_Beaver_02_DBスキーマ設計.md` | 全テーブル定義・税計算・原価→売価仕様 |
| `20260316_Beaver_03_画面設計_ワイヤー.md` | 全画面ワイヤーフレーム・UI構成表 |
| `20260316_Beaver_04_Accessデータ移行マッピング.md` | Access→Beaverフィールドマッピング |
| `20260317_Beaver_05_フロントエンド設計.md` | React設計・ディレクトリ構成・リアクティブ設計 |
| `R-0140_accesstategu_r086_integration.md` | AccessTategu R-086連携契約（quantity REAL化・access-link・基準線・重複統合等） |
| `R-0141_beaver_beta_environment.md` | Beaver_betaベータ環境（AppID切替） |
| `R-0143_dodaikun_sync_contract.md` | AccessTategu同期契約（同期API・認証・sync-state等） |
| `R-0144_beaver_beta_uat_support.md` | Dodaikun v1受入テスト自動化のためのBeaver_beta機能（スナップショット保存・復元、請求・入金写しAPI等） |
| `requests.md` | 未対応リクエスト一覧 |
| `requests_log.md` | 完了済みリクエストの記録 |
