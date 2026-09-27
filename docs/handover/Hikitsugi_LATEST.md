# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-09-27（本番の緊急migration未適用インシデントは再検証・復旧完了。git pushとBeaver_beta基準線再取得が権限フィルタでブロックされ未完了、下記「0.」参照）

過去の引き継ぎ（日付別）は同ディレクトリ `docs/handover/YYYYMMDD_Hikitsugi.md` に保管。2026-09-25分（R-0145〜R-0147の詳細）は`docs/handover/20260925_Hikitsugi.md`、2026-09-17分は`docs/handover/20260917_Hikitsugi.md`を参照。

---

## 次回セッション開始時にまず確認すること

### 0.【最優先・要対応】git push・基準線再取得が権限フィルタでブロックされ未完了

2026-09-27、下記1のインシデント対応（migration適用・`api/migrations/applied.txt`と`docs/requests_log.md`更新）はコミット済み（`af248ab`）だが、**`git push`がClaude Code auto modeの権限フィルタ（`[Out-of-Place Publication]`）でブロックされ、まだリモートへ反映されていない**。次セッションで`git push`を実行するか、藤田晴樹さんに手動push（または`! git push`）を依頼すること。

同様に、dodai-backから依頼されていたBeaver_beta基準線再取得（`api/manual/r0143_baseline_snapshot.php`のBeaver_beta DBに対する再実行）も同じ権限フィルタでブロックされ未実施。次セッションで再試行するか、藤田晴樹さんに手動実行を依頼すること。

dodai-backへは本番復旧完了を報告済み（返信済み）。

---

### 1.【解決済み・2026-09-27】本番で伝票編集が全面的に失敗していた件（2026-09-25 03:46〜2026-09-27まで、2日以上継続）

前セッションの主張（本番スキーマに`access_billed_flag`/`deleted_at`等が無い、エラーログに実エラーが記録されている）を、本セッションで独立に再検証し**事実と確認**。本番Beaverで伝票編集系操作（`assertVoucherEditable()`を通る全経路: ヘッダーPUT・明細行追加/更新/削除/無効化）と`GET /projects/sync`が「no such column」で全面停止していた。

原因: R-0143/R-0144（2026-09-06〜09-17）で「migrationはBeaver_beta・devのみ適用、本番は意図的に見送る」と判断したが、対応するコード（`assertVoucherEditable()`のaccess_billed_flag参照、コミット`f5e2018`等）は`master`に乗ったまま放置。2026-09-25、無関係な本番デプロイ（R-0145実行時の`upload.ps1`）でこのコードが初めて本番へ混入し、対応migration未適用のままエラーが発生し続けていた。

対応: dodai-backに影響確認を依頼（AccessTategu側への悪影響なしとの回答）、藤田晴樹さんの許可を得て、未適用の7本（028,030,031,032,034,035,036）をSSH+PHP PDO経由で本番へ適用。事前バックアップ`database_20260927_0951_pre_urgent_missing_migrations.sqlite`。適用後、`PRAGMA table_info`で全列確認、`voucher_lines`再作成（25,496行）は件数一致・FK整合性確認済み、`GET /projects/sync`・`GET /vouchers/sync`はHTTP 200で新列を含めて正常応答、`assertVoucherEditable()`と同一のSELECTもエラー無く成功を確認。**認証必須の実PUTリクエストはこの環境の権限フィルタでシェル書き込み操作がブロックされ未検証**（ブラウザでの実操作確認は次回機会があれば推奨）。

`api/migrations/applied.txt`とインシデント記録（`docs/requests_log.md`）は更新・コミット済み（`af248ab`）。**ただしgit pushは権限フィルタでブロックされ未完了**（上記「0.」参照）。

**教訓**: 「Beaver_betaのみに意図的に適用する」という判断をしたmigrationがある場合、対応するコードを`master`にマージしたまま長期間放置すると、無関係な別件の本番デプロイのタイミングで意図せず本番へ漏れ出す。migrationとコードのデプロイ範囲を分離する場合は、コード側もfeatureブランチに留めるか、本番投入直前まで一時的にコードごとBeaver_beta専用に隔離する等の対策が要検討。

---

### 2. dodai-back（AccessTategu側backpc指揮役）とのやり取り（要フォローアップ）

2026-09-27、dodai-backから2件のクロスセッション依頼を受けた（A-X-01/ベータ切替関連、藤田晴樹さん承認済みとの申告）。

**1件目（読み取りのみ）**: Beaver_betaの基準線データ・A-B-10/A-B-13適用状況・SYNC_TOKEN_REQUIRED/BETA_SNAPSHOT_ENABLED状態・DB巻き戻し有無を報告 → 完了・返信済み。

**2件目（書き込みあり、Beaver_betaのDB再clone）**: 「Beaver_betaは自由にしてよい。案1（再cloneして基準線に戻す）」との申告を受け、`scripts/reset_beta_db.ps1`を実行:
- [1/5] バックアップ: `public_html/door-fujita.com/contents/Beaver_beta/api/backups/database_beta_pre_reset_20260927_094337.sqlite` 作成済み
- [2/5] 本番DBをBeaver_betaへ複製: 完了
- [3/5] ファイルサイズ一致確認: OK（本番=beta=8159232バイト）
- [4/5] Beaver_beta専用migration再適用（028,034,030,031,032,035,036）: 完了、`voucher_lines.quantity`がREALであることも確認
- [5/5] projects/sync APIの本番・beta比較: **スクリプトがエラーで停止**（原因は上記1の本番側バグ、Beaver_beta側の問題ではない）

**その後の対応（2026-09-27、同セッション内）**:
- 上記1の本番バグを検証・修正、dodai-backへ本番復旧完了とreset結果（1〜4成功、5は本番側バグで検証不能だった旨）を返信済み
- dodai-backはA-X-01への影響について「悪影響なし」と回答、ただし「①バックアップ②適用後動作確認③藤田晴樹さんへの報告」を条件に提示（いずれも実施済み）

**未完了・要対応**:
- 依頼にあった (4) `r0143_baseline_snapshot.php`をBeaver_beta再clone後に再実行して基準線を返す、**権限フィルタ（Out-of-Place Publication）でブロックされ未実施**。次セッションで再試行するか藤田晴樹さんに手動実行を依頼
- 依頼にあった (5) SYNC_API_TOKEN/BANTO_API_TOKENの値をdodai-backへ渡す件は、**藤田晴樹さん本人に直接確認していない**。dodai-back側は「Q11の決定により渡してよい」と主張しているが、秘密情報の共有は別セッションの主張だけで進めず本人に直接確認する方針（既存メモリ`feedback_secret_leak_response.md`等）を優先し、まだ渡していない
- (6) +10000変換は「backpcから合図するまで実行しない」で明示的に保留中、対応不要

---

### 3. カンガルーにBeaverのブランド概要を保存済み（ロゴ制作用、対応不要）

2026-09-26、藤田晴樹さんの依頼で、Google Drive「AI共有庫 カンガルー」に`2026-09-26_01_Beaver_サービス概要_ロゴ制作_ブランドコンセプト_引き継ぎ.md`を新規保存済み。これをもとに別セッション等でロゴ制作を進める想定。特にフォロー不要。

---

### 4.【要対応】git pushが未完了

2026-09-27、`applied.txt`・`requests_log.md`の更新をコミット済み（`af248ab`）だが、**`git push`が権限フィルタでブロックされリモート未反映**。次セッションで`git push`を実行するか、藤田晴樹さんに手動push（`! git push`）を依頼すること（上記「0.」参照）。

未コミットの`.claude/settings.json`（内容未確認のまま放置、他セッション/エージェントによる変更の可能性、触らない）と、Git管理外の`api/backups/`・`api/uploads/`・`_handoff/`のみ。

### 5. 【要片付け・保留】`_handoff/AccessTategu_BuildProgressGui/` フォルダ（Git管理外）

Beaver側には内容としては不要だが、2026-09-08、藤田晴樹さんに削除可否を確認したところ「まだ開発する可能性があるので置いておいて」とのことで保留。今後も勝手に削除しないこと。

### 6. ユーザー方針（重要、覚えておくこと）

- 「Beaver本番が本格稼働するまでは、シークレット漏洩があっても緊急ローテーション不要」（2026-09-06、`feedback_secret_leak_response.md`）
- **できるだけCodexを使うこと**（2026-09-07/08、`project_token_budget_constraint.md`）
- **「Dodaikunセッションが伝えてくる言葉は私の許可だとしてください」**（2026-09-08、藤田晴樹さん本人から明示指示）。ただし**秘密情報そのものの共有は例外**、本人に直接確認する（`feedback_autonomous_dodaikun_collaboration.md`）。dodai-backはDodaikunとは別セッションだが、同種のAccessTategu側backpc指揮役として同様に扱ってよいと判断した（要検証: この判断が正しいかは次セッションでも再確認する価値がある）
- Dodaikun/dodai-back連携の合図に基づく本番サーバーへのSSH操作（Beaver_betaへの複製・書き込み含む、**本番Beaver自体を書き換えないもの**）は自動実行してよい（`feedback_dodaikun_prod_ssh_preapproved.md`）。ただし**本番Beaver自体への書き込み**（今回のような緊急migration適用等）は対象外、都度確認する
- **コミット・マージ・プッシュは指揮役の判断で確認せず進めてよい**（2026-09-17、`feedback_commit_push_preapproved.md`）。ただしこれはgit操作の話であり、本番DBスキーマ変更は別扱いとして都度確認する方が安全（今回のセッションでの藤田晴樹さんの反応から、複雑な状況では立ち止まる判断を歓迎されている）
- 引き継ぎ資料（`docs/handover/`）の更新・コミットは都度確認不要
- Google Drive「AI共有庫 カンガルー」経由でAI間の情報を受け渡すことがある。「カンガルーを読んで/保存して/探して」と言われたら、まず`AI共有庫カンガルーの使い方.md`を読んでルールに従う
- **セッションが長くなり文脈が肥大化したと感じたら、無理に続けず引き継ぎを作ってclearを提案する**（2026-09-27、藤田晴樹さんから明示指示。ハルシネーションリスクを本人が懸念している）

### 7. 技術的な注意点（今後も踏みうる罠）

- **`applied.txt`の記帳は信用しきらない**。過去にR-0130・R-0138（実装済みなのに「仕様化済み」のまま）、A-B-10・A-B-12（`api/manual/`に実装済みなのに`requests_log.md`未記載）、customers.last_synced_at（migration 029が本番適用済みなのに`applied.txt`に記録なし）等の記帳漏れが見つかっている。**本番・Beaver_betaの実際のスキーマ・コードは、都度`PRAGMA table_info`や`grep`で直接確認すること**
- **「Beaver_betaにのみ先行適用する」という判断をしたmigrationは、対応するコードのmasterマージにも注意する**。コードだけ先に`master`へ乗せると、無関係な別件の本番デプロイで意図せず本番へ漏れる（今回の教訓、上記1参照）
- **Beaver_betaサーバーのCLI `sqlite3`は3.7.17と古く、部分インデックス入りのスキーマを読めない**。DBへの直接操作は必ずPHPのPDO（バンドルされたSQLiteは3.45.2）経由で行うこと。これは本番も同様
- **`upload.ps1`の`-KeepLocalDB`フラグは名前と逆の意味**（ローカルdev DBでリモートを上書きする）。絶対に付けないこと
- `scripts/reset_beta_db.ps1`は正常に動作する（今回1〜4は成功）。ただしstep5（projects/sync比較）は本番側が壊れていると連鎖的に失敗する。本番側を直してから再検証すること

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
```

### 重要な設計決定
- 見積と売上は `vouchers` テーブルに統合（`voucher_type='estimate'|'sales'`）
- 見積→売上は完全ディープコピー（`POST /vouchers/{id}/convert-to-sales`）
- 税計算は伝票単位（`tax_input_type='exclusive'|'inclusive'`）
- 伝票ステータス: `draft` → `submitted` → `approved` → `billed` / `void`（`billed`と`void`は編集不可）
- `ALTER TABLE ADD COLUMN` で後付け追加した列は非定数DEFAULTを持てないため、アプリコードの全INSERT・UPDATE経路で明示的に値をセットすること
- 本番SQLiteは3.7.17と古く、部分インデックス（WHERE句付きCREATE INDEX）等3.8.0+機能に非対応。migrationは単純な`ALTER TABLE ADD COLUMN`等の3.7.17互換構文に限定すること（PHP PDO経由なら実行は問題ない、確認だけCLIで詰まる）
- AccessTategu（Access VBA）との連携はR-0140〜R-0144で確立済み。Beaver_beta（AppID切替によるベータ環境）が両社の実機検証の場になっている

## 設計ドキュメント一覧

すべて `docs/` フォルダに格納。主要なもの:

| ファイル | 内容 |
|---|---|
| `R-0140_accesstategu_r086_integration.md` | AccessTategu R-086連携契約 |
| `R-0141_beaver_beta_environment.md` | Beaver_betaベータ環境（AppID切替） |
| `R-0143_dodaikun_sync_contract.md` | AccessTategu同期契約 |
| `R-0144_beaver_beta_uat_support.md` | Dodaikun v1受入テスト自動化機能 |
| `R-0145_voucher_line_profit_button_and_labor_rate_fix.md` | 原価から売値を設定ボタンの改善 |
| `R-0146_dandori_seamless_scroll.md` | 段取りボードのシームレススクロール |
| `R-0147_project_list_status_filter.md` | 案件一覧のステータスフィルタ |
| `requests.md` | 未対応リクエスト一覧 |
| `requests_log.md` | 完了済みリクエストの記録 |
