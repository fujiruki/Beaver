# 引き継ぎ資料 — Beaver（2026-09-06分アーカイブ）

`Hikitsugi_LATEST.md`から肥大化のため切り出し。R-0140〜R-0143（AccessTategu連携）関連の詳細記録。

---

## AccessTategu 側からの依頼（2026-09-06、frontPC の指揮役が登録）: R-0140・R-0141

Beaver 側の開発は backpc で行う（藤田晴樹さん方針 2026-09-06）。frontPC 側は Access の R-086 ベータを進めており、Beaver に必要な変更を**連携契約**として仕様化して push した。着手前に `git pull` すること。

- `docs/spec/R-0140_accesstategu_r086_integration.md`: quantity REAL 化・負数許容、`PATCH /customers/{id}/access-link` 新設、同期再開前の基準線 SQL、売上種別突合（一致確認済み）、見積番号 +10000 変換。各項目に入力→期待の受入条件表があり、検体 JSON（`docs/spec/fixtures/accesstategu_r086/`）は Access ベータの実データから書き出したもの
- `docs/spec/R-0141_beaver_beta_environment.md`: 別 AppID `Beaver_beta` のベータ環境
- Access 側の設計資料の写しは `docs/from_access/20260906_*`（API の入出力は対応表 §3 が正）
- 7 月にこの PC で作った同期 API 実装 5 コミットは `backup/local-access-sync-20260905` に退避済み。master には入れていない。R-0140 (2) の参考にはなるが、そのまま取り込まない
- 完了報告は「テスト名・実行コマンドと生ログ・変更ファイル一覧」で。契約書の受入条件表にテスト名を書き足す

---

## R-0143 完了後の通し確認（2026-09-06、Dodaikun依頼）

Access側がA-F-04〜07で待機中のため、backpc側での積み重ね確認を実施。

### 1. 通し回帰確認 — 🔵青
メインリポジトリ（Beaver_betaにデプロイ済みのコードと同一）で`bash .claude/regression-suite.sh`（vitest+PHPテスト30本超）・`npm run build`とも成功。Beaver_beta実機でも`customers/sync`・`projects/sync`・`vouchers/sync`・`health`が200、`/sync/status`（SYNC_API_TOKENでは401、仕様通り）を確認。

### 2. 本番Beaver無傷確認
- 本番サーバー上のコード（`grep -l 'R-0143' api/routes/*.php`等）にR-0143関連文字列が一切無いことを確認
- 本番`api/migrations/`の最新は`027_seed_aggregation_categories.sql`のまま（028以降のR-0140/R-0141/R-0143系migrationは一切存在しない）
- 本番DBスキーマ: `vouchers.access_billed_flag`列は存在せず、`voucher_lines.quantity`は`INTEGER`型のまま（R-0143はおろかR-0140すら本番未適用のまま維持されている）
- 本番API実データ確認（BANTOトークン使用）:
  - `GET /customers` → 812件、応答キーに`access_billed_flag`等のR-0143追加列なし
  - `GET /projects` → 54件
  - `GET /vouchers` → 5800件、`access_billed_flag`キー含まれず（正常）
  - `GET /api/health` → 200、`{"status":"ok","app":"Beaver"}`

**結論: 本番Beaverは今回の一連のR-0140〜R-0143作業で一切変更されていないことを確認済み。** Dodaikunへ報告し、Access側のA-F-04〜07完了まで待機。

---

## R-0143 A-B-06 完了・backpc側タスク全完了（2026-09-06）

`PATCH /vouchers/{id}/sync-state`・`POST /sync/heartbeat`・`GET /sync/status`（通常認証）を新設、伝票詳細・得意先詳細に同期バッジ、伝票詳細に請求済みロックバナー（保存ボタン無効化含む）・確認待ちバナー、設定画面に同期先AppID・最終同期時刻表示（コミット`0f2d493`）。migration 035（`vouchers.sync_pending`、単一行`sync_heartbeats`テーブル）。`test_sync_state.php`4件・`test_sync_status.php`4件・フロントvitest全PASS、`npm run build`成功。

### Beaver_beta実機確認
```
POST /sync/heartbeat → 200
GET /sync/status（SYNC_API_TOKEN） → 401（仕様通り。/sync/statusは免除リスト対象外）
GET /sync/status（BANTO_API_TOKEN） → 200、{"app_id":"Beaver_beta","last_synced_at":"2026-09-06 19:00:00","source":"access"}（UTC→JST変換も正常、10:00→19:00）
PATCH /vouchers/{id}/sync-state → 200、sync_pending更新成功
```
本番`/api/health`→200で無事。`reset_beta_db.ps1`にmigration035も登録済み（コミット`dca8a37`）、試走で`[1/5]〜[5/5]`成功。

### R-0143 Phase A（backpc側）全タスク完了
A-B-01〜09すべてdone。Dodaikunより「A-B-06完了後は状況整理してAccess側のA-F-04〜07に集中する」旨の連絡あり。次にBeaver側で新規タスクの依頼が来るまでは、他の作業（通常のreadyoubouフロー等）に戻ってよい。

### 累積の教訓（次回セッション・今後のR-0143系タスクへの参考）
- Agent実装検証には`npx vitest run`だけでなく`npm run build`（tsc型チェック）も必須で含めること。過去2回、この検証漏れでビルドエラーを本番デプロイ直前に発見する事態になった
- worktree統合後は`bash .claude/regression-suite.sh`を実行する前に必ず`pwd`でカレントディレクトリを確認すること。`cd`の効果がBashツール呼び出しをまたいで持続しない場合がある
- `reset_beta_db.ps1`試走のたびにBeaver_betaのDBは本番複製に巻き戻る。実機確認は都度、本番に実在するID（access_customer_no等）を確認してから行うこと
- 秘密トークンを扱うcurl確認では`-v`（verbose）を絶対に使わない。値がログに出力される事故が過去に発生した
- 日本語を含むJSONペイロードはWindows環境のcurlコマンドライン引数だとエンコーディングが崩れる。PHPスクリプト経由（`json_encode`+`curl_exec`）で送信すること

---

## R-0143 A-B-04 完了（2026-09-06）

`POST /invoices/sync`・`POST /payments/sync`を新設（コミット`5f72c26`）。migration 031（`invoices.access_receivable_id`/`access_cancelled_at`、部分UNIQUEインデックス）・032（`payments.access_payment_no`/`origin`、同）。ON CONFLICTではなくトランザクション内SELECT→INSERT/UPDATE分岐を採用（部分UNIQUEインデックスへのON CONFLICTはconflict targetにWHERE句が必要で複雑なため。Access単体からの同期で並列書き込みが無い前提、`ponytail:`コメントで判断根拠を明記）。既存のUI経由`POST /payments`には`origin='beaver'`を明示。いずれも`BILLING_EDIT_ENABLED`封印の対象外（Accessからの一方向push）。`test_invoices_sync.php`5件・`test_payments_sync.php`4件全PASS。

### Beaver_betaへのmigration適用・reset_beta_db.ps1試走
`$betaOnlyMigrations`に031/032を追加（コミット`1673351`）、試走で`[1/5]〜[5/5]`成功。**注意: reset_beta_db.ps1試走のたびにBeaver_betaのDBは本番の複製に巻き戻るため、それ以前にAPI経由で作成したテストデータ（顧客・伝票等）は消える。** 実機確認時は本番に実在するaccess_customer_no（今回は"1"＝大石工務店）を使うこと。

### 実機確認（Beaver_beta、PHPスクリプト経由）
```
POST /invoices/sync（access_receivable_id=88001）→ 200、id=1新規作成
POST /invoices/sync 再送（同じaccess_receivable_id、cancelled_at付き）→ 200、id=1のまま更新（冪等性確認）、access_cancelled_atが反映
POST /payments/sync（receivable_id=88001）→ 200、invoice_id=1に正しく解決、origin="access"

POST /vouchers/sync（access_voucher_id=88501）→ voucher_id=5809作成
POST /invoices/sync（voucher_access_ids=[88501]）→ invoice_vouchers(invoice_id=2, voucher_id=5809)が正しく作成される
```
本番`/api/health`→200で無事。

---

## R-0143 A-B-03 price訂正 完了（2026-09-06）

Dodaikun指摘のprice仕様訂正を反映（コミット`d32925e`）。誤って追加していた単一`price`キーを削除、既存の`price_body`/`price_hardware`/`price_glass`/`line_total`/`tax_category`/`memo`/`updated_at`（+`line_no`/`item_name`/`quantity`で計10列）で往復一致することを`test_vouchers_sync_lines.php`で検証し直した。POST側（`insertSyncedLines`）はもともとこれら全列を正しく受信済みと確認（修正不要）。

Beaver_betaで実機確認: `price`キーが応答から消え、10列すべて正しく含まれることを確認済み。本番`/api/health`→200で無事。

### Dodaikunからの優先順位指示（2026-09-06）
A-B-04（migration031/032、invoices/payments sync）→A-B-06（バッジ・sync-state等）→A-B-03price訂正、の順で進めるよう指示があった（A-B-03は既に着手済みだったためそのまま完了させ、A-B-04も並行で着手中）。

---

## R-0143 A-B-05 完了（2026-09-06）

`BILLING_EDIT_ENABLED`フラグ（既定false）で請求・入金編集を封印（コミット`b70d349`）。API側6経路（`POST/DELETE /invoices`・`POST/DELETE /payments`・`POST /history/{id}/restore`（請求書・入金対象のみ）・`PATCH /customers/{id}/carry-forward`）を409化。UI側は新規請求書ボタン・削除ボタン・入金追加/取消ボタン・繰越残高編集リンクを非表示化、直URLアクセスも防御。`GET /settings/billing-edit-enabled`新設でフロントへフラグ伝達。バックエンド13ケース・フロントvitest3ファイル全PASS。

### 統合時に発見したビルドエラー（修正済み、コミット`2630741`）
Agent完了報告では`npx vitest run`のみ実行しており`npm run build`は未実施だったため、テストファイルの未使用import（`beforeEach`）によるTypeScript型チェックエラー（TS6133）を見落としていた。指揮役がBeaver_betaデプロイ時のビルドで発覚、fixerエージェントへ委譲して修正。**教訓: Agentの検証には`npx vitest run`だけでなく`npm run build`も含めるよう、今後の実装依頼プロンプトに明記すること。**

### 実機確認（Beaver_beta、本番未配置）
```
$ curl ".../Beaver_beta/api/settings/billing-edit-enabled" -H "Authorization: Bearer <BANTO token>"
{"billing_edit_enabled":false} HTTP:200

$ curl -X POST ".../Beaver_beta/api/invoices" -H "Authorization: Bearer <BANTO token>" -d '{"customer_id":1}'
{"error":"billing_edit_disabled"} HTTP:409

$ curl -X PATCH ".../Beaver_beta/api/customers/826/carry-forward" -H "Authorization: Bearer <BANTO token>" -d '{"carry_forward_balance":5000}'
{"error":"billing_edit_disabled"} HTTP:409
```
本番`/api/health`→200で無事。

---

## R-0143 A-B-03 完了（2026-09-06）

`GET/POST /vouchers/sync`に明細`lines[]`を追加（コミット`9fa585b`）。`GET`応答に`price`（=`line_total`）キー追加、`POST`側の明細同期を自動判定方式に変更（`lines_mode=replace`明示時は常に全置換、未指定時は`edited_in_beaver=1`の行が無ければ自動全置換・あれば保護）。

### 実機確認（Beaver_beta、PHP curl経由。日本語混じりJSONはcurlコマンドのコマンドライン引数だとWindows環境でエンコーディング崩れが起きるため、PHPスクリプト経由でリクエストした）
```
POST（lines同梱） → voucher_id=5810作成
GET → line_no=1, item_name="TestItemA", quantity=2, price=12000(=line_total), updated_at="2026-09-06 18:23:10" が往復一致
```

---

## R-0143 A-B-02 完了（2026-09-06）

migration 030（`vouchers.access_billed_flag`/`access_billing_date`/`access_receivable_id`）新設、`POST /vouchers/sync`でAccess側の請求済み情報を受信、`assertVoucherEditable`を拡張（コミット`f5e2018`）。

### 副次的に修正した既存の欠落・バグ
- `DELETE /vouchers/{id}`・`DELETE /vouchers/{id}/lines/{lineId}`にロックチェック（`assertVoucherEditable`呼び出し）が一切無かった欠落を追加
- `DELETE /invoices/{id}`・`POST /history/{id}/restore`（`restoreInvoiceDelete`）が対象伝票の`status`を無条件で書き換えていたバグを修正（`access_billed_flag=1`ならAccess管理下として触れないよう保護）

### 実機確認（Beaver_betaのみ、本番未配置）
```
$ curl -X POST ".../Beaver_beta/api/vouchers/sync" -H "Authorization: Bearer <SYNC token>" -d '{"access_voucher_id":99001,...,"billed_flag":true,"billing_date":"2026-09-01"}'
→ 200、voucher_id=5809で作成

$ curl -X PUT ".../Beaver_beta/api/vouchers/5809" -H "Authorization: Bearer <BANTO token>" -d '{"total_amount":9999}'
{"error":"locked_by_access","billing_date":"2026-09-01"} HTTP:409
```
仕様通りロックが機能。本番`/api/health`→200で無事。

`reset_beta_db.ps1`の`$betaOnlyMigrations`に`030_vouchers_access_billed_flag.sql`を追加済み（コミット`dd6e605`）、試走で`[1/5]〜[5/5]`成功確認済み。

---

## ⚠️ セキュリティインシデント: BANTO_API_TOKENの会話ログ露出とローテーション（2026-09-06）

### 何が起きたか
R-0143 A-B-09の実機確認中、`POST /customers`（通常認証が必要なエンドポイント）を叩くために`curl -v`を実行したところ、`Authorization: Bearer <値>`ヘッダーの実際の値（`BANTO_API_TOKEN`、R-0110番頭AI用の固定トークン）がverboseログに出力され、指揮役のツール実行結果としてこのセッションの会話に露出した。確認したところ**本番Beaverと Beaver_betaで同一の値**だった。

### 対応（藤田晴樹さんの承認を得て実施）
1. 新しいランダムトークン（32バイト、hex）を生成
2. 本番・Beaver_beta両方の`config.local.php`をバックアップ（`config.local.php.bak_pre_banto_rotate_20260906`）してからローテーション
3. 新トークンで本番・Beaver_beta両方の認証が通ることを確認
4. 新トークンの値は藤田晴樹さんに会話内で提示し、番頭AI側への反映は藤田晴樹さんに依頼（指揮役から番頭AIへ直接は伝えない運用ルール通り）
5. リモート・ローカルの一時ファイルはすべて削除済み

### 教訓
- SSH越しに秘密情報を扱うコマンドで`-v`（verbose）オプションは絶対に使わない
- 本番とBeaver_betaで同一の秘密トークンを使い回す設計だと、片方の事故が両方に波及する

---

## R-0143 A-B-09 完了（2026-09-06）

push系応答に`last_synced_at`を追加（コミット`e6dfef8`）。対象5経路すべて対応。`test_push_responses_last_synced_at.php`6件全PASS、回帰スイート🔵青。Beaver_betaへデプロイ済み。

**注意**: 日本語を含むJSONボディをWindows環境のcurlで送信すると文字コードの問題で正しく送信されないことが判明。実機確認時は英数字のみのテストデータを使うか、別の方法（PHPスクリプト経由等）でJSONを送ること。

---

## reset_beta_db.ps1のトークン対応・試走成功（2026-09-06）

Dodaikunの指摘（A-B-08でBeaver_betaが`SYNC_TOKEN_REQUIRED=true`になったため、`reset_beta_db.ps1`の[5/5]が認証で落ちる）を受けて対応（コミット`23be01e`）。ローカル秘密ファイル`scripts/.sync_token.local`（`.gitignore`済み）があればBeaver_beta側のリクエストにのみ`Authorization: Bearer`を付与、無ければ従来どおり無トークンで実行（後方互換）。試走[1/5]〜[5/5]すべて成功。

---

## R-0143 Phase A着手: A-B-07・A-B-08 完了（2026-09-06）

Dodaikunから連携契約R-0143を受領。`docs/spec/R-0143_dodaikun_sync_contract.md`に写し済み。

### A-B-07: GET /projects/sync に deleted_at 追加 — done（コミット`21f7c3f`）
migration 034で`projects.deleted_at`列を新設。

### A-B-08: 同期APIの認証 — done（コミット`cd981d7`）
`authGateIsExempt()`を部分一致から完全一致リストに変更、`SYNC_API_TOKEN`＋`SYNC_TOKEN_REQUIRED`（既定false）を新設。SYNC_API_TOKENの値はBeaver_beta側`config.local.php`にのみ保存（会話ログ・Dodaikunへの報告には含めていない）。

---

## A-B-01・A-B-01追補: GET /customers/sync 新設（2026-09-06）

Dodaikun側の連携設計書ドラフトから先行して渡されたタスク。`GET /customers/sync`を`GET /vouchers/sync`と同じ設計パターンで`api/routes/customers.php`に追加（コミット`20de0a2`）。追補（コミット`8c4f31b`）で`gender`・`mobile`・`fax`・`is_active`の4列を追加。`carry_forward_balance`は正本がAccess側のため応答から除外。

---

## upload.ps1のapi/backups/混入バグ修正（2026-09-06）

`upload.ps1`がローカルの`api/backups/`（dev DBバックアップ置き場、Git管理外）をデプロイ先へまるごとコピーしてしまう問題を修正（コミット`426929a`）。

## R-108完了・今後の進め方（Dodaikun連絡、2026-09-06）

Access側R-108（ベータFEの同期先をBeaver_betaへ切替）完了・push済み（AccessTategu `27ee041`）。ただし同期自体は`sync_paused`で停止中、実際の同期はP4（同期の載せ替え）実装後。

藤田晴樹さんの決定（2026-09-06）で連携の対象と正本が確定:
- 得意先・伝票（見積/売上）: 双方向＋競合解消
- 案件: Beaverのみで作成・編集（Beaver→Access一方向）
- 請求・入金: 双方向でBeaverでも編集可（優先度低め、後段フェーズ）
- 売掛: 集計値のため同期しない

---

## reset_beta_db.ps1のクォート問題修正・試走成功（2026-09-06）

Dodaikunが`reset_beta_db.ps1`を試走したところステップ[4/5]で失敗（SSH exit=255）。原因はPowerShellの外部プロセス呼び出しで多重クォートがWindowsの引数エスケープ処理で壊れるという既知の落とし穴（コミット`6d58f7b`で修正、PHPコードをローカル一時ファイルに書き出し→scp転送→リモートで実行する方式に変更）。

### 教訓
- 日本語コメントを含むPowerShellスクリプトはBOM無しUTF-8で保存するとWindows PowerShellにShift-JISとして誤読され構文が壊れる（BOM付きUTF-8で保存すること）
- PowerShellから`ssh`等の外部コマンドへ複雑な文字列（特に多重クォート）を引数として渡すと壊れやすい。一時ファイル経由で渡す方式の方が確実

---

## Dodaikun依頼3件 完了（2026-09-06）

frontPC側（Dodaikun）からの追加依頼3件を、藤田晴樹さんの包括承認（「9/9まではDodaikun側の依頼は事前承認」）のもとで実施。

1. `/api/health`のAppID固定文字列を修正 — 完了・デプロイ済み（コミット`7118689`）
2. Beaver_beta DBリセットスクリプト作成 — 完了（`scripts/reset_beta_db.ps1`、コミット`c7e1809`）
3. Beaver_betaへのR-0140反映確認・migration028適用 — 完了

**教訓**: 日本語コメントを含むPowerShellスクリプトをBOM無しUTF-8で保存すると、Windows PowerShellがShift-JISとして誤読し構文が崩れる。BOM付きUTF-8で保存すること。

---

## R-0141 本番サーバー側構築・実機疎通確認 完了（2026-09-06）

frontPC側（Dodaikun）からの依頼を藤田晴樹さんの承認を得て実施。

1. `upload.ps1 -Beta` でBeaver_betaディレクトリを新規作成・コード一式デプロイ
2. 本番の`api/database.sqlite`・`api/config.local.php`をBeaver_beta用に複製
3. 実機疎通確認: JSバンドルへの`VITE_APP_ID`埋め込み確認、401/loginUrl確認、ブラウザでの実機表示確認、本番`/api/health`無傷確認

### 食い違いの発覚と訂正
frontPC側が独立にcurlで裏取りしたところ、`/api/nonexistent`の応答が食い違うと指摘された。調査の結果、報告時の確認は`config.local.php`複製**前**のタイミングで実行したものと判明（`AUTH_DRIVER`未定義で認証ゲートがスキップされていた）。複製後は正しく機能することを確認。

**教訓**: ベータ環境の疎通確認で「認証が必要なはずのエンドポイントが通ってしまう／404になる」場合、`config.local.php`（`AUTH_DRIVER`等）がまだ複製されていない一時的な状態でないか疑うこと。他セッションとの独立した裏取りが確認手順の見落としを検出した好例。

### Access側へ渡す情報
- ベータAPIベースURL: `https://door-fujita.com/contents/Beaver_beta/api/`
- 認証: 本番と同じauth-hub（`df_session`共有、Cookie path=/のため追加登録不要）
- DB再複製手順: 本番`api/database.sqlite`をSSHで`Beaver_beta/api/database.sqlite`へ`cp`（権限666に戻すこと）

---

## R-0140・R-0141 実装完了（2026-09-06）

Agent 2体（worktree隔離・並行実行）に委譲して実装。

### 実装内容
- **R-0140 (1)(2)(4)(5)**: コミット `26d6903`
  - (1) `voucher_lines.quantity` を INTEGER→REAL 化（migration 028）、負数拒否を撤廃
  - (2) `PATCH /customers/{id}/access-link` 新設。`customers.last_synced_at` 列追加（migration 029）。`PUT /customers/{id}` から `access_customer_no` を更新対象外に
  - (4) sales_categories のID突合は一致確認済み
  - (5) 見積番号+10000変換SQLを `api/manual/r0140_5_estimate_no_plus10000.sql` に用意（**未実行**）
  - (3) 基準線の記録はAccess側の合図待ちのため対象外（未着手。→この後2026-09-07にDodaikun A-B-12依頼で具体化・実装、詳細はLATEST参照）
- **R-0141**: コミット `21fecb5`
  - `api/config.php`のBASE_PATH・`frontend/vite.config.ts`のbaseを環境変数から切替可能化
  - Cookie/LocalStorageプレフィックスを`frontend/src/lib/appId.ts`で一元管理
  - `App.tsx`等の`/contents/Beaver`直書き5箇所をAPP_ID参照へ修正（重大な穴だったが発見・修正）
  - `upload.ps1`に`-Beta`スイッチ追加

### 実装体制・検証
- Agent（`general-purpose`、worktree隔離で並行実行、TDD必須）に実装委譲。指揮役が両worktreeの差分を確認しメインリポジトリへ手動コピー・統合、vitest・PHPテスト・`npm run build`・回帰スイートを再実行して裏取り（🔵青）
