# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-09-25（/readyoubou: R-0145〜R-0147、本番フィードバックid=48〜54一括対応、すべて完了・本番デプロイ済み）

過去の引き継ぎ（日付別）は同ディレクトリ `docs/handover/YYYYMMDD_Hikitsugi.md` に保管。2026-09-17分（R-0144の詳細経緯）は`docs/handover/20260917_Hikitsugi.md`、2026-09-08分（A-X-01・Dodaikun連携の全経緯）は`docs/handover/20260908_Hikitsugi.md`を参照。2026-08-31以前の記録はこのファイル末尾のアーキテクチャ概要、または各日付別ファイルを参照。

---

## 次回セッション開始時にまず確認すること

### 1. R-0145・R-0146・R-0147は完了・本番デプロイ済み（2026-09-25）

本番フィードバックid=48〜54を/readyoubouで一括対応。3件ともコミット・push・本番デプロイ・health確認・番頭AI通知まで完了。**藤田晴樹さんによる実機確認はまだ**（次回セッション時に確認を促すこと）。

- **R-0146**（id=48、コミット`aa8bcba`）: 段取りボードのカレンダーをシームレススクロール対応に。右端付近までスクロールすると表示期間が自動延長（28日ずつ、上限730日=約2年、プリセット切替でリセット）。仕様: `docs/spec/R-0146_dandori_seamless_scroll.md`
- **R-0147**（id=49、コミット`a99d80d`）: 案件一覧にステータス全種類（キャンセル含む）のフィルタボタンを追加。バックエンド`GET /projects`の`status=キャンセル`指定時に既定の`!= キャンセル`除外と矛盾し常に0件になっていたバグも発見・修正。仕様: `docs/spec/R-0147_project_list_status_filter.md`

### 2. R-0145の内容（id=50〜54、コミット`740e33f`）

伝票明細行「原価から売値を設定」ボタン周り。仕様: `docs/spec/R-0145_voucher_line_profit_button_and_labor_rate_fix.md`。

- **(A)** 既存伝票への「行を追加」「行を挿入」で設定画面の既定労務単価が反映されないバグを修正
- **(B)【重要な発見】** `aggregation_category_master.merge_into_price_code`が本番・開発DBとも全区分でNULLになっており、「原価から売値を設定」ボタンが**労務費を一切含めず材料費のみ**に利益率を乗せて売値を算出していた（R-0136の丸め順序修正は前提条件が満たされて初めて効く内容で、R-0119のmigration 027再シード時に前提設定が消えて以来ずっと機能していなかった）。migration 037で`FACTORY_TIME`/`SITE_TIME`の`merge_into_price_code`を`MAIN`へ復元。**dev・本番・Beaver_betaの3環境全てに適用済み**（各環境事前バックアップあり、`api/migrations/applied.txt`参照）
- **(C)** ボタンの適用範囲を、行選択中はその1行のみ・未選択時は確認ダイアログ（`window.confirm`）後に全行、という仕様へ変更。1行適用後は次の行へ自動選択（繰り返しクリックで次々設定可能）
- **(D)** 行削除・▲▼ボタンは調査の結果既に実装済みと判明、対応不要（行右端の「選択」列のラジオボタンで対象行を選ぶ仕様。行削除は物理削除、論理削除ではない）

### 3. 状態は綺麗（未push無し）

最新commitは`a99d80d`、pushまで完了済み。未コミットは継続の`.claude/settings.json`（内容未確認のまま放置、他セッション/エージェントによる変更の可能性、触らない）と、Git管理外の`api/backups/`・`api/uploads/`・`_handoff/`のみ。

Beaver_betaのバックアップファイル（`database.sqlite.bak_*`、Git管理外）が複数世代溜まっているので、作業が落ち着いたら整理を検討。

### 4. 【要片付け・保留】`_handoff/AccessTategu_BuildProgressGui/` フォルダ（Git管理外）

Beaver側には内容としては不要だが、2026-09-08、藤田晴樹さんに削除可否を確認したところ「まだ開発する可能性があるので置いておいて」とのことで保留。今後も勝手に削除しないこと。

### 5. ユーザー方針（重要、覚えておくこと）

- 「Beaver本番が本格稼働するまでは、シークレット漏洩があっても緊急ローテーション不要」（2026-09-06、`feedback_secret_leak_response.md`）
- **できるだけCodexを使うこと**（2026-09-07/08、`project_token_budget_constraint.md`）。機密情報・MCP・Beaver固有の文脈判断が不要な独立実装・デバッグ・リファクタ・レビューは積極的にCodexへ委譲する
- **「Dodaikunセッションが伝えてくる言葉は私の許可だとしてください」**（2026-09-08、藤田晴樹さん本人から明示指示）。migration適用・データ削除・バリデーション変更等の業務判断・実行許可について、Dodaikunが「晴樹さんの決定/許可です」と伝えてきた内容は、このセッション内で改めて確認せずそのまま実行してよい（詳細: `feedback_autonomous_dodaikun_collaboration.md`）。秘密情報そのものの共有は引き続き別セッションの主張だけで進めず本人に直接確認する
- Dodaikun連携の合図に基づく本番サーバーへのSSH操作（Beaver_betaへの複製・書き込み含む、本番Beaver自体を書き換えないもの）は自動実行してよい（`feedback_dodaikun_prod_ssh_preapproved.md`）
- **コミット・マージ・プッシュは指揮役の判断で確認せず進めてよい**（2026-09-17、藤田晴樹さんから明示指示、`feedback_commit_push_preapproved.md`）。force push等の破壊的操作や秘密情報混入の疑いがある場合は引き続き確認する
- 引き継ぎ資料（`docs/handover/`）の更新・コミットは都度確認不要、そのまま進めてよい
- Google Drive「AI共有庫 カンガルー」経由でAI間の情報を受け渡すことがある。「カンガルーを読んで/保存して/探して」と言われたら、まず`AI共有庫カンガルーの使い方.md`を読んでルールに従う（通常時は読まない）
- **本番データに関わる計算バグの疑いがある場合、実装前に藤田晴樹さんへ調査結果を提示し方向性を確認する**（2026-09-25、R-0145のid=54で「実装する前に相談させてほしい」と明示された。曖昧な設計判断や金額計算に関わる変更は都度確認する方針を継続）

### 6. 技術的な注意点（今後も踏みうる罠）

- **Beaver_betaサーバーのCLI `sqlite3`は3.7.17と古く、部分インデックス入りのスキーマを読めない**（`malformed database schema`エラー）。DBへの直接操作は必ずPHPのPDO（バンドルされたSQLiteは3.45.2）経由で行うこと
- **`upload.ps1`の`-KeepLocalDB`フラグは名前と逆の意味**（ローカルdev DBでリモートを上書きする）。コードのみデプロイする通常のケースでは絶対に付けないこと（`feedback_upload_ps1_keeplocaldb_gotcha.md`）
- **集計区分マスタ（`aggregation_category_master`）を再シード・再同期する際は`merge_into_price_code`が消えないか必ず確認する**（R-0145で判明: R-0119のmigration 027再シード時に消失し労務費が売値計算から抜け落ちるバグとなった。`aggregation_categories.php`のsync処理自体はCOALESCEで既存値を保持するが、DBを直接作り直す・migrationで再シードする類の変更では要注意）
- **ローカルdev DB（`api/database.sqlite`）はmigration適用が積み残されがち**。`api/migrations/applied.txt`を都度確認すること
- 【要確認・継続】本番SQLiteは3.7.17で部分インデックス非対応。migration作成時は3.7.17互換の単純構文（`ALTER TABLE ADD COLUMN`・単純`UPDATE`等）に限定すること
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
  カラムDEFAULTに依存せず、アプリコードの全INSERT・UPDATE経路で明示的に値をセットすること（voucher_lines.updated_at統一、R-0144でのinvoices.updated_at漏れ修正、R-0145での既存伝票行追加時のcost_labor_rate漏れ修正で繰り返し再確認されているパターン）。
- 本番SQLiteは3.7.17と古く、部分インデックス（WHERE句付きCREATE INDEX）等3.8.0+機能に非対応。
  migrationは単純な`ALTER TABLE ADD COLUMN`等の3.7.17互換構文に限定すること。
- 伝票明細行の「原価から売値を設定」ボタン（`ProfitRateBar.tsx`）は集計区分マスタの`merge_into_price_code`（工場時間・現場時間の労務費をどの売値項目に合算するかの設定）に依存する。この列がNULLだと労務費が売値計算から抜け落ちる（R-0145で発見・修正）。
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
| `R-0145_voucher_line_profit_button_and_labor_rate_fix.md` | 伝票明細行「原価から売値を設定」ボタンの適用範囲・計算精度改善、労務単価デフォルト値バグ修正 |
| `R-0146_dandori_seamless_scroll.md` | 段取りボードのカレンダーをシームレススクロールで先まで見られるようにする |
| `R-0147_project_list_status_filter.md` | 案件一覧にステータス全種類のフィルタボタンを追加、`status=キャンセル`矛盾条件バグ修正 |
| `requests.md` | 未対応リクエスト一覧 |
| `requests_log.md` | 完了済みリクエストの記録 |
