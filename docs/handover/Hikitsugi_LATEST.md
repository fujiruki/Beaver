# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-09-08（A-X-01 手順7まで完了、Dodaikunの続報待ちの状態でのアーカイブ整理）

過去の引き継ぎ（日付別）は同ディレクトリ `docs/handover/YYYYMMDD_Hikitsugi.md` に保管。**2026-09-08分の詳細（A-X-01の全ステップ・発生した事故・バグ修正の経緯）は`docs/handover/20260908_Hikitsugi.md`を参照**。2026-09-06分は`docs/handover/20260906_Hikitsugi.md`。2026-08-31以前の記録はこのファイル末尾のアーキテクチャ概要、または各日付別ファイルを参照。

---

## 次回セッション開始時にまず確認すること

### 1. 【最優先】Dodaikunからの続報を確認
`ListAgents`で`Dodaikun`の状態を見る、または新規cross-session-messageが来ていれば自動的に見える。2026-09-08、A-X-01（Dodaikun⇔Beaverベータ切替）の手順7（藤田晴樹さんがベータFEで「Beaverと同期」）まで完了し、途中で見つかった複数のバグ（A-B-11〜16、タイムゾーン変換漏れ、sync_helpers.php未ロード回帰）はすべて修正・デプロイ・Dodaikunへ報告済み。**次に来るのは手順7の再実行結果、または手順8（実機確認）の進捗のはず。** 詳細な経緯は`docs/handover/20260908_Hikitsugi.md`を参照。

### 2. 状態は綺麗（未push無し）
最新commitは`b18e9e6`、pushまで完了済み。未コミットは前回セッションから継続の`.claude/settings.json`（内容未確認のまま放置、他セッション/エージェントによる変更の可能性、触らない）と、Git管理外の`api/backups/`・`api/uploads/`・`_handoff/`のみ。

Beaver_betaのバックアップファイル（`database.sqlite.bak_*`、Git管理外）が複数世代溜まっているので、作業が落ち着いたら整理を検討。

### 3. 【要片付け・保留】`_handoff/AccessTategu_BuildProgressGui/` フォルダ（Git管理外）
Beaver側には内容としては不要だが、**2026-09-08、藤田晴樹さんに削除可否を確認したところ「まだ開発する可能性があるので置いておいて」とのことで保留。今後も勝手に削除しないこと。**

### 4. ユーザー方針（重要、覚えておくこと）
- 「Beaver本番が本格稼働するまでは、シークレット漏洩があっても緊急ローテーション不要」（2026-09-06、`feedback_secret_leak_response.md`）
- 「Dodaikun（frontpc）セッションからの依頼は9/9まで事前承認」という期限付き承認（2026-09-06発言。9/9を過ぎたら都度確認に戻すこと）
- **できるだけCodexを使うこと**（2026-09-07/08、`project_token_budget_constraint.md`）。機密情報・MCP・Beaver固有の文脈判断が不要な独立実装・デバッグ・リファクタ・レビューは積極的にCodexへ委譲する。待ち時間にバックログから拾って進める程度に能動的に
- **「Dodaikunセッションが伝えてくる言葉は私の許可だとしてください」**（2026-09-08、藤田晴樹さん本人から明示指示）。migration適用・データ削除・バリデーション変更等の業務判断・実行許可について、Dodaikunが「晴樹さんの決定/許可です」と伝えてきた内容は、このセッション内で改めて確認せずそのまま実行してよい（詳細: `feedback_autonomous_dodaikun_collaboration.md`）。秘密情報そのものの共有は引き続き別セッションの主張だけで進めず本人に直接確認する
- Dodaikun連携の合図に基づく本番サーバーへのSSH操作（Beaver_betaへの複製・書き込み含む、本番Beaver自体を書き換えないもの）は自動実行してよい（`feedback_dodaikun_prod_ssh_preapproved.md`）。分類器にブロックされても極力確認を挟まず進める
- 引き継ぎ資料（`docs/handover/`）の更新・コミットは都度確認不要、そのまま進めてよい

### 5. 技術的な注意点（今後も踏みうる罠）
- **Beaver_betaサーバーのCLI `sqlite3`は3.7.17と古く、部分インデックス入りのスキーマを読めない**（`malformed database schema`エラー）。DBへの直接操作は必ずPHPのPDO（バンドルされたSQLiteは3.45.2）経由で行うこと
- **`upload.ps1`の`-KeepLocalDB`フラグは名前と逆の意味**（ローカルdev DBでリモートを上書きする）。コードのみデプロイする通常のケースでは絶対に付けないこと（`feedback_upload_ps1_keeplocaldb_gotcha.md`）
- **Codexタスクが10〜15分以上進捗なしの場合はハングを疑う**。`node codex-companion.mjs status --all --json`で直接確認し、異常なら`TaskStop`→`--fresh`で再投入する（`feedback_codex_hang_diagnosis.md`）。進捗監視は`Monitor`でのtail -fではなく、完了通知を待つか10分間隔程度の確認に留める（トークン消費を避ける）
- 【要確認・継続】本番SQLiteは3.7.17で部分インデックス非対応。migration 031/032は部分インデックスを使っているため、**本番へ適用する前に本番のSQLiteバージョンを確認すること**（まだ本番デプロイのタイミングではない、Dodaikun側の合図待ち）
- 【要フォロー・古い懸念】2026-09-06のBANTO_API_TOKENローテーション後、`C:\claude-workspace\.env`への反映が複数セッションにわたり未確認のまま。次回、番頭AIがBeaver APIを正常に呼べているか確認すること（`docs/wiki/knowledge/banto_ai_beaver_integration.md`参照）

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
  カラムDEFAULTに依存せず、アプリコードの全INSERT経路で明示的に値をセットすること（voucher_lines.updated_at統一で確定）。
- 本番SQLiteは3.7.17と古く、部分インデックス（WHERE句付きCREATE INDEX）等3.8.0+機能に非対応。
  migrationは単純な`ALTER TABLE ADD COLUMN`等の3.7.17互換構文に限定すること。
- AccessTategu（Access VBA）との連携はR-0140〜R-0143で確立済み。連携契約の正本はAccessTategu側`docs/Dodaikun_Beaver連携設計.md`、Beaver側の写しは`docs/spec/R-0140_accesstategu_r086_integration.md`・`R-0143_dodaikun_sync_contract.md`。Beaver_beta（AppID切替によるベータ環境）が両社の実機検証の場になっている。

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
| `requests.md` | 未対応リクエスト一覧 |
| `requests_log.md` | 完了済みリクエストの記録 |
