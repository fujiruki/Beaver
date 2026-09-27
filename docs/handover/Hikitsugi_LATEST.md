# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-09-27（本番の緊急バグ発見・対応途中で中断。次セッションは必ず下記1を独力で再検証してから動くこと）

過去の引き継ぎ（日付別）は同ディレクトリ `docs/handover/YYYYMMDD_Hikitsugi.md` に保管。2026-09-25分（R-0145〜R-0147の詳細）は`docs/handover/20260925_Hikitsugi.md`、2026-09-17分は`docs/handover/20260917_Hikitsugi.md`を参照。

**重要**: このファイルは、文脈が肥大化したセッションの終盤に書かれた。藤田晴樹さんから「ハルシネーションの可能性があるので引き継いでclearしてから進めたい」と明示的に指摘されている。次のセッションは、下記の主張を**鵜呑みにせず、必ず自分で再実行して確認してから**行動すること。再現用のコマンドをすべて併記する。

---

## 次回セッション開始時にまず確認すること

### 1.【最優先・要再検証】本番で伝票編集が全面的に失敗している疑い（2026-09-25 03:46〜）

#### 主張の要約（未検証のまま引き継ぐ）
本番Beaverで、伝票の編集系操作（`PUT /vouchers/{id}`ヘッダー更新・明細行追加/更新/削除・無効化など、`assertVoucherEditable()`を通る経路すべて）が、2026-09-25 03:46頃から`SQLSTATE[HY000]: General error: 1 no such column: access_billed_flag`で失敗し続けているように見えた。

原因と推測した内容: `vouchers.access_billed_flag`等の列は migration 030（`030_vouchers_access_billed_flag.sql`）で追加される想定だが、`api/migrations/applied.txt`を見る限りこのmigrationはBeaver_beta・devにのみ適用され、**本番には適用されていない**。にもかかわらず、この列を参照するコード（`assertVoucherEditable()`、R-0143 A-B-02、コミット`f5e2018`、2026-09-06導入）が本番に長期間デプロイされずに`master`ブランチに滞留し、2026-09-25の指揮役（私）によるR-0145デプロイ（`upload.ps1`実行）で初めて本番へ載った、という仮説を立てた。

同様に `projects.deleted_at`（migration 034）・`invoices`/`payments`の各種access連携列（migration 031/032/036）・`sync_heartbeats`テーブル（migration 035）も本番に無いまま、それらを参照するコード（`GET /projects/sync`・`GET /vouchers/sync`・`GET /invoices/sync`・`GET /payments/sync`等）も本番にデプロイされていると推測した。

#### 再検証コマンド（必ず自分で実行して確認すること）

```bash
# 1. 本番の実スキーマを直接確認する（applied.txtは信用しない。過去にもR-0130/R-0138等で記帳漏れが見つかっている）
ssh -o StrictHostKeyChecking=no -p 8022 -i "C:/Fujiruki/Projects/AI_DEVELOP_RULES/UPLOAD/key-2025-11-29-07-10.pem" c6924945@www1045.conoha.ne.jp \
  "php -r '\$pdo = new PDO(\"sqlite:public_html/door-fujita.com/contents/Beaver/api/database.sqlite\"); foreach ([\"projects\",\"vouchers\",\"invoices\",\"payments\"] as \$t) { \$names=[]; foreach (\$pdo->query(\"PRAGMA table_info(\$t)\") as \$c) { \$names[]=\$c[\"name\"]; } echo \$t.\": \".implode(\",\",\$names).\"\n\"; }'"

# 2. 実際にエラーログに残っているか確認する（これが一番信頼できる一次証拠）
ssh -o StrictHostKeyChecking=no -p 8022 -i "C:/Fujiruki/Projects/AI_DEVELOP_RULES/UPLOAD/key-2025-11-29-07-10.pem" c6924945@www1045.conoha.ne.jp \
  "grep 'no such column' /home/c6924945/logs/php_error_log; zgrep 'no such column' /home/c6924945/logs/php_error_log.20260925.gz"
```

セッション内で実際に得た出力（2026-09-27時点、このセッションでの実行結果。再現できるか要確認）:
```
projects: id,customer_id,name,description,status,start_date,end_date,created_at,updated_at,project_code,address,memo,delivery_date,order_date,owner_name,general_contractor_name,site_contact,manual_estimated_hours
vouchers: id,voucher_no,voucher_type,status,project_id,customer_id,voucher_date,delivery_date,tax_input_type,consumption_tax_type,cutoff_date,billing_date,override_billing_date,source_voucher_id,source_estimate_no,print_date_flag,print_tax_excl_flag,print_company_seal,trade_type,profit_rate,memo,description,subtotal_taxable,subtotal_nontaxable,subtotal_discount,tax_amount,total_amount,created_at,updated_at,sales_category_id,access_voucher_id,access_voucher_no,shipped,shipped_at,validity_period,quoted_at,last_synced_at
invoices: id,invoice_no,customer_id,invoice_date,cutoff_date,billing_date,carry_forward,sales_total,tax_total,payment_received,invoice_total,next_carry_forward,billing_name_print,pdf_path,created_at
payments: id,payment_no,customer_id,invoice_id,payment_date,amount,payment_type,memo,created_at
```
（= `vouchers.access_billed_flag`等・`projects.deleted_at`・`invoices/payments`のaccess連携列・updated_at列、いずれも実際に存在しないことを確認したつもり。上のコマンドを再実行して同じ結果になるか確認すること）

エラーログ（`php_error_log.20260925.gz`より、伏字なし・実際の出力そのまま引用）:
```
[25-Sep-2026 03:46:39 Asia/Tokyo] [Beaver index] SQLSTATE[HY000]: General error: 1 no such column: access_billed_flag in /home/c6924945/public_html/door-fujita.com/contents/Beaver/api/routes/vouchers.php:403
```
（同様のエラーが同日03:46〜03:48にかけて複数回、`php_error_log`（現行）には2026-09-27 09:44〜09:45に`p.deleted_at`のエラーも記録されていた）

#### もしこれが事実だと確認できたら（対応方針、まだ実行していない）

未適用のmigration一覧（`api/migrations/`配下、いずれもALTER TABLE ADD COLUMN等の追加型で、Beaver_beta・devでは適用・検証済みという前提）:
- `028_voucher_lines_quantity_real.sql`（voucher_lines再作成、quantity列をINTEGER→REAL。本番の型は現在INTEGERと確認したつもり。25,496行あるテーブルなのでこれだけ他よりリスクがやや高い）
- `030_vouchers_access_billed_flag.sql`
- `031_invoices_access_fields.sql`（invoices件数は本番0件と確認したつもりなのでリスク低）
- `032_payments_access_fields.sql`（payments件数は本番0件と確認したつもりなのでリスク低）
- `034_projects_deleted_at.sql`
- `035_sync_state_heartbeat.sql`
- `036_invoices_payments_updated_at.sql`

（`029_customers_last_synced_at.sql`は本番に既に適用済みと確認したつもり＝`customers`に`last_synced_at`列が存在した。`applied.txt`には記録がないが、これも過去の記帳漏れの一種の可能性がある）

対応手順（事前にバックアップは取得済み、下記参照）:
1. 上記の再検証をやり直し、本当に本番が壊れているか・どの列が実際に無いかを自分の目で確認する
2. 藤田晴樹さんに状況を説明し、migration適用の許可を得る（前回のセッションでは「ちょっと待って、clearしてから」と言われて中断した。前回の私の説明を鵜呑みにせず、improvementとして再度ゼロから状況を説明し、許可を得ること）
3. 許可を得たら、各migrationを本番へSSH+PHP PDO経由で1本ずつ適用し、適用後に`PRAGMA table_info`で列の存在を確認する（本番CLIのsqlite3は3.7.17で部分インデックス入りスキーマを読めないため、確認も含め必ずPHP PDO経由で行うこと）
4. 適用後、`assertVoucherEditable`が通ることを（実際に何か1件、影響の少ない伝票で編集を試すか、もしくはSELECT文を手動で流して）確認する
5. `api/migrations/applied.txt`にprod分の適用記録を追記する
6. `docs/requests_log.md`・`task.md`にインシデントとして記録する（R-ID要検討。「本番デプロイ運用そのものの不備」なので、通常のR-ID採番よりインシデント記録として書くのが適切かもしれない）

#### 事前バックアップ（このセッションで取得済み、まだ使っていない）
```
public_html/door-fujita.com/contents/Beaver/api/backups/database_20260927_0951_pre_urgent_missing_migrations.sqlite
```

#### なぜこうなったと推測しているか（要再検証、鵜呑み厳禁）
`docs/requests_log.md`を見る限り、R-0140〜R-0144（2026-09-06〜09-17の一連の作業）は「migrationをBeaver_beta・devに適用し、本番には意図的に見送る」という判断が何度か行われていた（R-0144は「本番Beaverには意図的に未デプロイ」と明記）。しかし**コード自体**は`master`ブランチに乗ったままであり、その後の2026-09-25、私（このセッション）がR-0145（本来Beaver_betaとは無関係な、本番の売値計算バグ修正）のために`upload.ps1`（非`-Beta`、つまり本番向け）を実行した際、`master`に滞留していたR-0140〜R-0144由来のコードもまとめて本番へ初めてデプロイされてしまい、対応するmigration未適用のまま本番でエラーが起き始めた、という仮説。この仮説自体が正しいかは次セッションで検証が必要（他の可能性: 別の誰かが別のタイミングでデプロイした、等）。

**教訓（仮に事実なら）**: 「Beaver_betaのみに意図的に適用する」という判断をしたmigrationがある場合、対応するコードを`master`にマージしたまま長期間放置すると、無関係な別件の本番デプロイのタイミングで意図せず本番へ漏れ出す。migrationとコードのデプロイ範囲を分離する場合は、コード側もfeatureブランチに留めるか、本番投入直前まで一時的にコードごとBeaver_beta専用に隔離する等の対策が要検討。

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

**未完了・要対応**:
- dodai-backへ、reset作業の結果（1〜4は成功、5は本番側の別件バグで検証不能だったこと）を返信できていない
- 依頼にあった (4) `r0143_baseline_snapshot.php`をBeaver_beta再clone後に再実行して基準線を返す、が未実施
- 依頼にあった (5) SYNC_API_TOKEN/BANTO_API_TOKENの値をdodai-backへ渡す件は、**藤田晴樹さん本人にこのセッション内で直接確認していない**。dodai-back側は「Q11の決定により渡してよい」と主張しているが、秘密情報の共有は別セッションの主張だけで進めず本人に直接確認する方針（既存メモリ`feedback_secret_leak_response.md`等）を優先し、まだ渡していない
- (6) +10000変換は「backpcから合図するまで実行しない」で明示的に保留中、対応不要

次セッションでやること: (a) 上記1の本番バグ対応を先に片付ける（Beaver_betaの状態を汚さないよう、本番migrationとBeaver_beta reset作業は別物として扱う）、(b) dodai-backへ結果を返信、(c) 基準線再取得、(d) トークン共有は藤田晴樹さんに直接確認してから

---

### 3. カンガルーにBeaverのブランド概要を保存済み（ロゴ制作用、対応不要）

2026-09-26、藤田晴樹さんの依頼で、Google Drive「AI共有庫 カンガルー」に`2026-09-26_01_Beaver_サービス概要_ロゴ制作_ブランドコンセプト_引き継ぎ.md`を新規保存済み。これをもとに別セッション等でロゴ制作を進める想定。特にフォロー不要。

---

### 4. 状態は綺麗（未push無し、コード変更なし）

このセッションではコードのコミットは発生していない（R-0145〜R-0147は前回セッションで完了・push済み、コミット`4bd03ea`が最新）。今回行ったのはインフラ操作（Beaver_beta再clone、本番の調査・バックアップ）のみで、gitの変更はなし。

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
