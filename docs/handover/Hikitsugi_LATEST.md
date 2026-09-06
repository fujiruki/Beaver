# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-09-07（セッションクリア前の最終引き継ぎ）

過去の引き継ぎ（日付別）は同ディレクトリ `docs/handover/YYYYMMDD_Hikitsugi.md` に保管。2026-08-31以前の記録・アーキテクチャ概要・設計ドキュメント一覧はこのファイルの末尾セクション、または各日付別ファイルを参照。

---

## 次回セッション開始時にまず確認すること

### 1. 状態は綺麗（未push無し）
`git log`最新は`2efcc9c`、pushまで完了済み。未コミットは前回セッションから継続の`.claude/settings.json`・`CLAUDE.md`（内容未確認のまま放置、他セッション/エージェントによる変更の可能性、触らない）と、Git管理外の`api/backups/`・`api/uploads/`のみ。新規に何か壊れている状態ではない。

### 2. 【要フォロー】番頭AIのBANTO_API_TOKEN反映を確認する
2026-09-06、`curl -v`実行でBANTO_API_TOKENが会話ログに露出する事故が発生し、本番・Beaver_beta両方でローテーション済み（詳細は下の節）。新トークンの値は藤田晴樹さんに会話内で提示し、`C:\claude-workspace\.env`の`BEAVER_API_TOKEN=`行への反映を依頼した。**反映されたかどうか未確認のまま今回のセッションを終える。** 次回、番頭AIがBeaver APIを正常に呼べているか（エラーが出ていないか）確認すること。手順は`docs/wiki/knowledge/banto_ai_beaver_integration.md`の「トークンを更新（ローテーション）する時の反映手順」節を参照。

### 3. R-0143は全完了、Dodaikun（frontpc）待機中
AccessTategu連携契約R-0143のbackpc側タスク（A-B-01〜09）はすべて完了・Beaver_beta実機確認済み・本番無傷確認済み（詳細は下の節）。Access側（frontpc、セッション名"Dodaikun"）はA-F-06・A-F-07の設計確認中で、Beaver側への追加依頼はその確認後にのみ来る想定。**次回セッション開始時、Dodaikunから新規メッセージが届いていないか確認すること**（`ListAgents`で`bridge:session_01YH8GrJ86LfsMhTMLHQf6DC`宛のやり取りを探す、または新規cross-session-messageが来ていれば自動的に見える）。

### 4. ユーザー方針（重要、覚えておくこと）
- 「Beaver本番が本格稼働するまでは、シークレット漏洩があっても緊急ローテーション不要」という方針（2026-09-06、プロジェクトメモリに記録済み: `feedback_secret_leak_response.md`）
- 「Dodaikun（frontpc）セッションからの依頼は9/9まで事前承認」という期限付き承認（2026-09-06発言。9/9を過ぎたら都度確認に戻すこと）
- 通常はCodexへ委譲する独立実装タスクも、今回のセッションでは「トークンが余りそう」との理由でSonnet（Agent委譲含む）で完結させるよう指示された（2026-09-06、一時的な方針。次回セッションでは通常のCodex分担ルールに戻ってよいか確認するとよい）

### 5. 【要確認】本番SQLiteバージョンとmigration 031/032の部分UNIQUEインデックスの整合性
本節末尾「アーキテクチャ概要」に記載の通り、**本番SQLiteは3.7.17と古く、部分インデックス（`WHERE`句付き`CREATE INDEX`、SQLite 3.8.0+機能）に非対応**という既知の制約がある。しかしR-0143 A-B-04で追加した`api/migrations/031_invoices_access_fields.sql`・`032_payments_access_fields.sql`は`CREATE UNIQUE INDEX ... WHERE access_receivable_id IS NOT NULL`のような部分インデックスを使っている（Beaver_betaでは正常動作を確認済み、Beaver_betaのSQLiteバージョンが新しいためと思われる）。**本番へこれらのmigrationを適用する前に、本番のSQLiteバージョンを確認し、部分インデックス構文が使えるか検証すること。** 使えない場合はmigration 031/032の書き換えが必要（例: 通常のUNIQUE制約にする、またはアプリケーション側でのユニーク性チェックに変更する等）。まだ本番デプロイのタイミングではない（R-0143はBeaver_betaのみ、本番デプロイはDodaikun側の合図待ち）ため今回は対応していないが、本番適用前に必ず確認すること。

---

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

### 次にやること
- A-B-06（同期バッジ・ロック表示・`sync-state`・`/sync/status`・`/sync/heartbeat`）に着手予定
- R-0143全体でA-B-01〜05・07〜09が完了。残るはA-B-06のみ

---

---

## R-0143 A-B-03 price訂正 完了（2026-09-06）

Dodaikun指摘のprice仕様訂正を反映（コミット`d32925e`）。誤って追加していた単一`price`キーを削除、既存の`price_body`/`price_hardware`/`price_glass`/`line_total`/`tax_category`/`memo`/`updated_at`（+`line_no`/`item_name`/`quantity`で計10列）で往復一致することを`test_vouchers_sync_lines.php`で検証し直した。POST側（`insertSyncedLines`）はもともとこれら全列を正しく受信済みと確認（修正不要）。

Beaver_betaで実機確認: `price`キーが応答から消え、10列すべて正しく含まれることを確認済み。本番`/api/health`→200で無事。

### Dodaikunからの優先順位指示（2026-09-06）
A-B-04（migration031/032、invoices/payments sync）→A-B-06（バッジ・sync-state等）→A-B-03price訂正、の順で進めるよう指示があった（A-B-03は既に着手済みだったためそのまま完了させ、A-B-04も並行で着手中）。

### 次にやること
- A-B-04（`POST /invoices/sync`・`POST /payments/sync`）はAgentで実装中
- A-B-04完了後、A-B-06（同期バッジ・ロック表示・`sync-state`・`/sync/status`・`/sync/heartbeat`）に着手

---

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

### 次にやること
- **A-B-03のpriceマッピング訂正**（Dodaikun指摘、緊急ではない）: `GET/POST /vouchers/sync`の`lines[]`から誤って追加した単一`price`キーを削除し、既存の`price_body`/`price_hardware`/`price_glass`/`line_total`/`tax_category`/`memo`/`updated_at`の10列で往復一致することを`test_vouchers_sync_lines.php`で検証し直す
- A-B-04（migration 031/032、`POST /invoices/sync`・`POST /payments/sync`）はA-B-02完了により着手可能
- A-B-06（同期バッジ・ロック表示・sync-state・/sync/status・/sync/heartbeat）もA-B-02完了により着手可能

---

---

## R-0143 A-B-03 完了（2026-09-06）

`GET/POST /vouchers/sync`に明細`lines[]`を追加（コミット`9fa585b`）。`GET`応答に`price`（=`line_total`）キー追加、`POST`側の明細同期を自動判定方式に変更（`lines_mode=replace`明示時は常に全置換、未指定時は`edited_in_beaver=1`の行が無ければ自動全置換・あれば保護）。

**要確認事項**: `price`を`line_total`（明細行合計金額）にマッピングしたが、Access側が単価的な値を期待している可能性もあり、Dodaikun側に確認が必要（実装Agentからの申し送り）。

### 実機確認（Beaver_beta、PHP curl経由。日本語混じりJSONはcurlコマンドのコマンドライン引数だとWindows環境でエンコーディング崩れが起きるため、PHPスクリプト経由でリクエストした）
```
POST（lines同梱） → voucher_id=5810作成
GET → line_no=1, item_name="TestItemA", quantity=2, price=12000(=line_total), updated_at="2026-09-06 18:23:10" が往復一致
```

### 次にやること
- A-B-05（請求・入金編集封印）はまだAgentで実装中。完了後、Beaver_betaデプロイ・実機確認・Dodaikunへの報告を行う
- Dodaikunへ`price`マッピングの確認を依頼すること

---

---

## R-0143 A-B-02 完了（2026-09-06）

migration 030（`vouchers.access_billed_flag`/`access_billing_date`/`access_receivable_id`）新設、`POST /vouchers/sync`でAccess側の請求済み情報を受信、`assertVoucherEditable`を拡張（コミット`f5e2018`）。

### 副次的に修正した既存の欠落・バグ
- `DELETE /vouchers/{id}`・`DELETE /vouchers/{id}/lines/{lineId}`にロックチェック（`assertVoucherEditable`呼び出し）が一切無かった欠落を追加
- `DELETE /invoices/{id}`・`POST /history/{id}/restore`（`restoreInvoiceDelete`）が対象伝票の`status`を無条件で書き換えていたバグを修正（`access_billed_flag=1`ならAccess管理下として触れないよう保護）

### 統合時のトラブル（教訓）
worktree統合作業中、Bashツールの作業ディレクトリがworktree内に取り残されたまま`bash .claude/regression-suite.sh`を実行してしまい、誤ってworktree側のvite.config.tsを参照してERR_MODULE_NOT_FOUNDになった（メインリポジトリのコード自体には問題なし）。`cd`コマンドの効果がBashツール呼び出しをまたいで確実に持続するとは限らないため、**worktree統合後は`pwd`で明示的にカレントディレクトリを確認してから回帰スイートを実行すること**。

### 実機確認（Beaver_betaのみ、本番未配置）
```
$ php -r '...PRAGMA table_info(vouchers)...'（Beaver_beta）
access_billed_flag=INTEGER / access_billing_date=DATE / access_receivable_id=INTEGER

$ curl -X POST ".../Beaver_beta/api/vouchers/sync" -H "Authorization: Bearer <SYNC token>" -d '{"access_voucher_id":99001,...,"billed_flag":true,"billing_date":"2026-09-01"}'
→ 200、voucher_id=5809で作成

$ curl -X PUT ".../Beaver_beta/api/vouchers/5809" -H "Authorization: Bearer <BANTO token>" -d '{"total_amount":9999}'
{"error":"locked_by_access","billing_date":"2026-09-01"} HTTP:409
```
仕様通りロックが機能。本番`/api/health`→200で無事。

`reset_beta_db.ps1`の`$betaOnlyMigrations`に`030_vouchers_access_billed_flag.sql`を追加済み（コミット`dd6e605`）、試走で`[1/5]〜[5/5]`成功確認済み。

### 次にやること
- **A-B-03**（`lines[]`）と**A-B-05**（請求・入金編集封印）を並列でAgent実装委譲する予定（ユーザーの「並行で進められることはどんどん」指示による）。両方ともvouchers.php/invoices.php等でA-B-02と重複するファイルを触るため、A-B-02完了後の今なら安全に並列化できる
- A-B-04（migration 031/032）はA-B-02完了により着手可能になった

---

---

## ⚠️ セキュリティインシデント: BANTO_API_TOKENの会話ログ露出とローテーション（2026-09-06）

### 何が起きたか
R-0143 A-B-09の実機確認中、`POST /customers`（通常認証が必要なエンドポイント）を叩くために`curl -v`を実行したところ、`Authorization: Bearer <値>`ヘッダーの実際の値（`BANTO_API_TOKEN`、R-0110番頭AI用の固定トークン）がverboseログに出力され、指揮役のツール実行結果としてこのセッションの会話に露出した。確認したところ**本番Beaverと Beaver_betaで同一の値**だった。

### 対応（藤田晴樹さんの承認を得て実施）
1. 新しいランダムトークン（32バイト、hex）を生成
2. 本番・Beaver_beta両方の`config.local.php`をバックアップ（`config.local.php.bak_pre_banto_rotate_20260906`）してからロー テーション（`define('BANTO_API_TOKEN', ...)`を新しい値に置換）
3. 新トークンで本番・Beaver_beta両方の認証が通ることを確認（`POST /customers`・`GET /customers`）
4. 新トークンの値は、`docs/wiki/knowledge/banto_ai_beaver_integration.md`の運用ルール（「トークンの値は本ページに書かない。藤田晴樹さんから別途安全な経路で受け取ること」）に従い、**指揮役から番頭AIへ直接は伝えず**、藤田晴樹さんに会話内で提示し、番頭AI側への反映は藤田晴樹さんに依頼した
5. リモート・ローカルの一時ファイル（トークン抽出・置換用スクリプト、トークン値を含む一時ファイル）はすべて削除済み

### 次にやること（重要）
- **藤田晴樹さんが番頭AI（BantoAI）側の設定に新しいBANTO_API_TOKENを反映する必要がある**（まだ未実施の可能性が高い、次回セッションで確認すること）。反映されるまで番頭AIはBeaver APIへアクセスできない
- 旧トークンは既に無効化済み（config.local.php書き換え済みのため、旧値では認証できない）

### 教訓
- SSH越しに秘密情報を扱うコマンドで`-v`（verbose）オプションは絶対に使わない。Authorizationヘッダーの値がそのまま出力される
- 今後、トークンを使った実機確認をする際は、値を変数に入れてもコマンド自体の詳細ログ出力（`-v`、`set -x`等）を有効にしない
- 本番とBeaver_betaで同一の秘密トークンを使い回す設計だと、片方の事故が両方に波及する。今後、環境ごとに別トークンにする設計も検討の余地がある（今回は同一のまま両方ローテーションして対応）

---

## R-0143 A-B-09 完了（2026-09-06）

push系応答に`last_synced_at`を追加（コミット`e6dfef8`）。対象5経路（`syncVoucherUpsert`×2エンドポイント・`syncVoucherShipped`・`syncProjectCustomer`・`POST /customers`）すべて対応。`test_push_responses_last_synced_at.php`6件全PASS、回帰スイート🔵青。Beaver_betaへデプロイ済み。

### 実機確認（BANTO_API_TOKENで認証、英数字のみのテストデータで確認）
```
$ curl -X POST ".../Beaver_beta/api/customers" -H "Authorization: Bearer <token>" -d '{"access_customer_no":"90099","name":"TestCustomer90099"}'
{"id":829,...,"access_customer_no":"90099","last_synced_at":"2026-09-06 08:21:10"} HTTP:201
```
`last_synced_at`が正しく含まれることを確認。

**注意**: 日本語を含むJSONボディをWindows環境のcurlで送信すると文字コードの問題で正しく送信されないことが判明（`name`が空文字・`access_customer_no`がnullになる現象を確認）。実機確認時は英数字のみのテストデータを使うか、別の方法（PHPスクリプト経由等）でJSONを送ること。

R-0143契約書の状態表もA-B-09をdoneに更新すること（次回セッションで未実施なら対応）。

### 次にやること（R-0143続き）
- A-B-02（請求済みロック）→A-B-05（請求・入金編集封印）→A-B-03（lines[]）の順で逐次実装（vouchers.php/invoices.php等で重複するため並列不可）

---

---

## reset_beta_db.ps1のトークン対応・試走成功（2026-09-06）

Dodaikunの指摘（A-B-08でBeaver_betaが`SYNC_TOKEN_REQUIRED=true`になったため、`reset_beta_db.ps1`の[5/5]が認証で落ちる）を受けて対応（コミット`23be01e`）。

### 対応内容
- ローカル秘密ファイル`scripts/.sync_token.local`（`.gitignore`済み）があればBeaver_beta側のリクエストにのみ`Authorization: Bearer`を付与、無ければ従来どおり無トークンで実行（後方互換）
- トークンの値はリポジトリに一切書き込んでいない。指揮役がBeaver_beta側`config.local.php`からSSH経由でトークン値を抽出し（PHPの標準出力をファイルへリダイレクトし会話ログに出さない）、`scripts/.sync_token.local`へ保存済み

### 試走結果 — [1/5]〜[5/5]すべて成功
```
[1/5] バックアップ完了
[2/5] 複製完了
[3/5] サイズ一致確認OK
[4/5] migration028・034転送・適用・型確認OK（quantity=REAL）
[5/5] レコード一致確認OK（トークン付きで認証通過、id=1）
```
再確認: Beaver_betaの`quantity=REAL`・`deleted_at=DATETIME`とも維持、本番`/api/health`→200で無事。

---

---

## R-0143 Phase A着手: A-B-07・A-B-08 完了（2026-09-06）

Dodaikunから連携契約R-0143（正本はAccessTategu側`docs/Dodaikun_Beaver連携設計.md`）を受領。`docs/spec/R-0143_dodaikun_sync_contract.md`に写し、`docs/SPEC.md`索引にも追加（R-0142の索引漏れも合わせて追加）。ユーザー指示により今回は実装をCodexではなくAgent（Sonnet）に委譲して進めた。

### A-B-07: GET /projects/sync に deleted_at 追加 — done（コミット`21f7c3f`）
migration 034で`projects.deleted_at`列を新設。`DELETE /projects/{id}`（キャンセル扱い、hard=1以外）でセット。Beaver_betaに適用済み（`PRAGMA table_info`でDATETIME型確認済み）、`scripts/reset_beta_db.ps1`の`$betaOnlyMigrations`に追加済み。

### A-B-08: 同期APIの認証 — done（コミット`cd981d7`）
`authGateIsExempt()`を部分一致（`/sync`を含む任意パス）から完全一致リストに変更、`SYNC_API_TOKEN`＋`SYNC_TOKEN_REQUIRED`（既定false）を新設。Beaver_betaで`SYNC_TOKEN_REQUIRED=true`にして実機確認:
```
トークン無し/vouchers/sync → 401
正しいトークン/vouchers/sync → 200（実データ）
/sync/status（未実装ルート） → 401（df_session無し）
偽装パス/vouchers/synchronize → 401（guarded化）
```
SYNC_API_TOKENの値はBeaver_beta側`config.local.php`にのみ保存（会話ログ・Dodaikunへの報告には含めていない）。バックアップ: `config.local.php.bak_pre_sync_token`（Beaver_beta上）。

副次確認: `/aggregation-categories/sync`が完全一致化でguarded扱いに変わったが、これはフロントエンド（ログイン済みユーザー）専用の内部エンドポイントのため実害なしと確認済み。

### 実装体制・検証
- 両タスクともAgent（worktree隔離、並行実行、TDD必須）に実装委譲。指揮役がメインリポジトリで統合・`bash .claude/regression-suite.sh`（vitest含む）を再実行し🔵青を確認してから別々にコミット
- Agent worktree内では`frontend/node_modules`不在によりvitestが見かけ上失敗することが続いている（既知の環境要因、統合後のメインでは問題なし）

### 次にやること
- **A-B-09（新規、Dodaikunから追加依頼）**: push系応答（`POST /vouchers/sync`・`POST /projects/{id}/vouchers/sync`・`PATCH /projects/{id}/vouchers/{no}/shipped`・`PATCH /projects/{id}/customer`・`POST /customers`）に`last_synced_at`を必ず含める。A-B-08の次、A-B-02の前に着手（Access側A-F-09対応のため優先度高）
- 続けてA-B-02（請求済みロック）→A-B-05（請求・入金編集封印）→A-B-03（lines[]）。いずれもvouchers.php/invoices.php等で重複するため逐次実装（並列不可と判断）
- R-0143 §7の状態表を都度`done`に更新すること

---

---

## A-B-01追補: customers/sync応答に4列追加（2026-09-06）

Dodaikun側の合格確認後、Access側`ApplyBeaverCustomer`が読んでいる`gender`・`mobile`・`fax`・`is_active`が応答に無いと既定値で上書きしてしまう問題への追加対応（コミット`8c4f31b`）。`GET /customers/sync`のSELECT文に4列追加、`carry_forward_balance`は引き続き除外。テスト2件追加（`test_customers_sync.php`、全12ケースPASS）、回帰スイート🔵青。

Beaver_betaへデプロイし実機確認:
```
$ curl ".../Beaver_beta/api/customers/sync?limit=1"
{...,"gender":null,...,"mobile":null,"fax":null,...,"is_active":0,...}
```
4列とも含まれ、`carry_forward_balance`は含まれないことを確認。本番は無事（`/api/health`→200）。

### 次にやること
- Dodaikunの再確認待ち
- 設計書レビュー反映後、R-0143契約（A-B-02〜07）を受領予定。それまで大きな実装は待機

---

---

## A-B-01: GET /customers/sync 新設・Beaver_betaへデプロイ完了（2026-09-06）

Dodaikun側の連携設計書ドラフトから先行して渡された、依存なしタスク。Access側`SyncCustomersFromBeaver`が呼んでいたが存在しなかったエンドポイントを新設（コミット`20de0a2`）。

### 実装
`GET /customers/sync`を`GET /vouchers/sync`と同じ設計パターン（keysetページング、+1件取得でnext_cursor判定）で`api/routes/customers.php`に追加。
- 応答: `{synced_at, customers, next_cursor, next_cursor_at}`
- `carry_forward_balance`は正本がAccess側のため応答から除外（SELECT文自体に含めない）
- 依頼元が期待していた`tax_type`・`trade_type`列は`customers`テーブルに実在しないため応答から省略（Dodaikunへ申し送り済み）。`honorific`→`honorific_type`、`address`→`address1`/`address2`としてそのまま返す
- `next_cursor_at`は「次ページ先頭になるはずのレコード（limit+1件目）」の`updated_at`をJST変換して返す設計

### 検証
Agent（worktree、TDD）に実装委譲、新規テスト`api/tests/test_customers_sync.php`（10ケース全PASS）。指揮役がメインリポジトリで`bash .claude/regression-suite.sh`（vitest含む全体）を再実行し🔵青を確認（Agent側worktreeではnode_modules不在で見かけ上vitestが失敗していたが、統合後のメインでは問題なし）。

### デプロイ・実機確認（Beaver_betaのみ、本番は未配置）
```
$ curl "https://door-fujita.com/contents/Beaver_beta/api/customers/sync?limit=2"
{"synced_at":"2026-09-06T15:29:21+09:00","customers":[...2件...],"next_cursor":2,"next_cursor_at":"2026-06-16 19:21:51"}
```
`carry_forward_balance`・`tax_type`・`trade_type`いずれも応答に含まれないことを実データで確認。本番Beaverの同エンドポイントは意図通り旧仕様（全件配列）のまま、`/api/health`も200で無傷。

### 次にやること
- Dodaikunが本エンドポイントをcurlで再確認する予定（先方確認待ち）
- 残りの連携タスク（migration 030〜032、請求済みロック、明細lines、同期バッジUI等）はDodaikun側の連携設計書確定後にR-0143契約として受領予定。設計書ができるまで大きな実装は待機

---

---

## upload.ps1のapi/backups/混入バグ修正（2026-09-06）

前節で発見した「`upload.ps1`がローカルの`api/backups/`（dev DBバックアップ置き場、Git管理外）をデプロイ先へまるごとコピーしてしまう」問題を修正（コミット`426929a`）。`Copy-Item "api\*" -Recurse`の直後に`Remove-Item "$stagingDir\api\backups" -Recurse -Force`を追加。本番Beaver側のcron自動バックアップ置き場（サーバー上の`api/backups/`）はデプロイコマンド側で`api`ディレクトリごと保護される仕組みのため無関係、影響なし。

Beaver_betaに紛れ込んでいた3ファイル（`database_20260714_164504_pre_migration_repair.sqlite`等、ローカルのapi/backups/と一致確認済み）はSSHで削除済み。修正後の`upload.ps1 -Beta`で再デプロイし、backupsに新規混入が無いこと・`/api/health`・`projects/sync`とも正常・本番無事を実データで確認済み。

## R-108完了・今後の進め方（Dodaikun連絡、2026-09-06）

Access側R-108（ベータFEの同期先をBeaver_betaへ切替）完了・push済み（AccessTategu `27ee041`）。ただし同期自体は`sync_paused`で停止中、実際の同期はP4（同期の載せ替え）実装後。

藤田晴樹さんの決定（2026-09-06）で連携の対象と正本が確定:
- 得意先・伝票（見積/売上）: 双方向＋競合解消
- 案件: Beaverのみで作成・編集（Beaver→Access一方向）
- 請求・入金: 双方向でBeaverでも編集可（優先度低め、後段フェーズ）
- 売掛: 集計値のため同期しない

Dodaikun側で連携設計書を作成中。完成後、Beaver側の契約部分をR-01xxとして受け取り、frontpc/backpcで並行実装に入る予定。**設計書ができるまで大きな実装は待機**。

### 次にやること
- Dodaikunからの連携設計書（R-01xx）待ち
- R-0140(3)基準線記録・(5)見積番号+10000変換の本番実行はAccess側合図待ち（変更なし）
- 本番BeaverへのR-0140デプロイは設計書で順序を決めてから（変更なし）

---

---

## reset_beta_db.ps1のクォート問題修正・試走成功（2026-09-06）

Dodaikunが`reset_beta_db.ps1`を試走したところステップ[4/5]で失敗（SSH exit=255）。原因はPowerShellの`& ssh @sshOpts $target $Command`のような外部プロセス呼び出しで、`php -r '...'`のような多重クォート（シングルクォート+ダブルクォート）がWindowsの引数エスケープ処理で壊れるという既知の落とし穴だった。

### 修正内容（コミット`6d58f7b`）
migration適用・型確認の両方を「PHPコードをローカル一時ファイルに書き出し→scp転送→リモートで`php <ファイルパス>`実行」方式に変更（Dodaikun提案どおり）。ヒアドキュメント内のPHP変数（`$pdo`等）はバッククォートでエスケープしPowerShell変数展開との衝突を回避。

### 再試走結果 — [1/5]〜[5/5]すべて成功
```
[1/5] バックアップ完了
[2/5] 複製完了
[3/5] サイズ一致確認OK (本番=8159232 / beta=8159232)
[4/5] migration028転送・適用・型確認OK: voucher_lines.quantity = REAL
[5/5] レコード一致確認OK (id=1)
```
実データで再確認: Beaver_beta`quantity=REAL`、本番`quantity=INTEGER`（無傷）、`migrations_tmp`一時ディレクトリは削除済み。

### 副次的に発見した軽微な問題（次回対応候補）
`upload.ps1`の`Copy-Item "$PSScriptRoot\api\*" "$stagingDir\api\" -Recurse -Force`が`api/backups/`ディレクトリごとコピーしてしまうため、ローカルのdev DBバックアップファイル（`database_20260906_0335_pre_r0140_migrations.sqlite`等）がBeaver_betaの`api/backups/`に紛れ込んでいた。機能的な実害はない（ディスク容量のみ）が、`upload.ps1`のstaging処理で`api/backups/`を除外するとよい。今回は対応せず記録のみ。

### 教訓（reset_beta_db.ps1のBOM問題と合わせて）
- 日本語コメントを含むPowerShellスクリプトはBOM無しUTF-8で保存するとWindows PowerShellにShift-JISとして誤読され構文が壊れる（BOM付きUTF-8で保存すること）
- PowerShellから`ssh`等の外部コマンドへ複雑な文字列（特に多重クォート）を引数として渡すと壊れやすい。一時ファイル経由で渡す方式の方が確実

---

---

## Dodaikun依頼3件 完了（2026-09-06）

frontPC側（Dodaikun）からの追加依頼3件を、藤田晴樹さんの包括承認（「9/9まではDodaikun側の依頼は事前承認」）のもとで実施。

### 1. `/api/health`のAppID固定文字列を修正 — 完了・デプロイ済み
`api/index.php`の`'app' => 'Beaver'`を`'app' => APP_ID`に修正（コミット`7118689`）。Agent実装→回帰スイート🔵青→`upload.ps1 -Beta`で再デプロイ→実機確認済み:
- `Beaver_beta` → `{"status":"ok","app":"Beaver_beta"}`
- 本番 → `{"status":"ok","app":"Beaver"}`（無傷）
- DBはデプロイ後も維持されていることを`projects/sync`で確認

### 2. Beaver_beta DBリセットスクリプト作成 — 完了（試走は未実施）
`scripts/reset_beta_db.ps1`を新規作成（コミット`c7e1809`）。本番DBをBeaver_betaへ複製し、Beaver_beta専用の先行migration（`$betaOnlyMigrations`配列で管理、現在`028_voucher_lines_quantity_real.sql`のみ）を自動再適用する。作成のみで試走は未実施（実行前に藤田晴樹さんへ確認する）。

**教訓**: 日本語コメントを含むPowerShellスクリプトをBOM無しUTF-8で保存すると、Windows PowerShellがShift-JISとして誤読し構文が崩れる（今回`[System.Management.Automation.Language.Parser]::ParseFile`での構文チェックで発覚。エラーメッセージも文字化けする）。BOM付きUTF-8で保存すること。既存の`upload.ps1`もBOM無しだが偶然壊れていないだけの可能性があり、次に触る際は要注意。

### 3. Beaver_betaへのR-0140反映確認 — 完了
- (2) `PATCH /customers/{id}/access-link`: Beaver_betaで動作確認済み（未認証で409、実ロジック到達）。**本番BeaverにはまだR-0140が未デプロイ**であることも判明（本番同エンドポイントは405）
- (1) quantity負数拒否撤廃: コードは反映済みだが、**DBスキーマ（migration028）はBeaver_beta・本番とも未適用**だったことが判明
- (5) 見積番号+10000変換SQL: `api/manual/`に同梱確認済み
- 副次発見: `customers.last_synced_at`列は本番DBに（R-0140実装以前から）既に存在していた

### 追加対応: migration028をBeaver_beta DBへ適用 — 完了
Dodaikunからの追加依頼。Beaver_beta側DBをバックアップ後（`backups/database_beta_pre_reset_...`相当の命名は使わず`database_20260906_pre_r0140_migration028.sqlite`）、`api/migrations/028_voucher_lines_quantity_real.sql`をSSH経由でBeaver_beta DBにのみ適用（藤田晴樹さんに`!`直接実行を依頼）。適用後・本番とも確認:
- Beaver_beta: `voucher_lines.quantity type=REAL`
- 本番: `voucher_lines.quantity type=INTEGER`（無傷）

リモートホームディレクトリに置いた一時ファイル（`apply_migration.php`等）は作業後に削除済み。

### 次にやること
- R-108（Access側のベータ同期先切替）はAccess側R-116完了待ちで保留中。Dodaikunから連絡があり次第対応
- `reset_beta_db.ps1`の試走は藤田晴樹さんの実行可否確認後
- 本番BeaverへのR-0140デプロイ・migration028適用は別途判断（現時点ではBeaver_beta先行のみ）

---

---

## R-0141 本番サーバー側構築・実機疎通確認 完了（2026-09-06）

frontPC側（Access連携の相手、セッション"Dodaikun"）からの依頼を藤田晴樹さんの承認を得て実施。「スコープ外」としていた本番サーバー側の残作業を完了した。

### 実施内容
1. `upload.ps1 -Beta` でBeaver_betaディレクトリを新規作成・コード一式デプロイ（既存の本番Beaverには一切触れず、新規ディレクトリのみへの書き込み）
2. 本番の`api/database.sqlite`・`api/config.local.php`をBeaver_beta用に複製（SSH `cp`、コピー元は読み取りのみ。auto mode classifierにブロックされたため藤田晴樹さんに`!`直接実行を依頼）
3. 実機疎通確認（実行コマンド・実データ）:
   - `curl https://door-fujita.com/contents/Beaver_beta/api/nonexistent` → （config.local.php複製**前**の一時的状態で）`{"error":"Not found","path":"/nonexistent"}`。※これはBASE_PATH剥がしの証拠として不適切だった。下記「食い違いの発覚と訂正」参照
   - Beaver_betaのJSバンドル（`assets/index-*.js`）に文字列`"Beaver_beta"`が実際に埋め込まれていることを確認（`VITE_APP_ID`のビルド時埋め込みが機能）
   - `curl https://door-fujita.com/contents/Beaver_beta/api/projects` → 401 `unauthenticated`、`loginUrl`が`redirect=%2Fcontents%2FBeaver_beta%2Fapi%2Fprojects`（Beaver_beta用に正しく生成）
   - ブラウザ（Chrome自動化）で`https://door-fujita.com/contents/Beaver_beta/`にアクセス→社内共通ログインCookie（`df_session`、path=/）が効いて未ログイン操作なしでダッシュボードが表示され、本番複製データ（進行中12件・未受注26件等、本番と同規模）が見えることを確認
   - 本番Beaver（`/api/health`）は作業前後で200のまま無傷なことを複数回確認
4. ファイルサイズ照合でDB（8159232バイト）・config.local.php（889バイト）とも複製元と一致することを確認

### 食い違いの発覚と訂正（frontPC側"Dodaikun"との裏取りで発覚）
frontPC側が独立にcurlで裏取りしたところ、`/api/nonexistent`がCookie無しで401（`unauthenticated`）を返し、報告した404と食い違うと指摘された。調査の結果、**報告時の404確認はconfig.local.phpをBeaver_betaへ複製する前のタイミングで実行したもの**と判明: `upload.ps1`は`config.local.php`を配置対象から除外する仕様のため、複製前は`AUTH_DRIVER`が未定義（`none`相当）になり、`api/index.php`の認証ゲート条件`AUTH_DRIVER !== 'none' && ...`が成立せず認証チェック自体がスキップされて404まで到達していた。config.local.php複製後は正しく認証ゲートが機能し、未認証パスは一律401になる（frontPC側の確認が正）。

BASE_PATH剥がし自体の証拠は、認証除外パス（`authGateIsExempt()`の`/sync`ルール）で再取得した:
```
curl -s "https://door-fujita.com/contents/Beaver_beta/api/projects/sync?limit=1"
→ 200、{"projects":[{"id":1,"name":"大野様邸",...}],...}（本番Beaverの同エンドポイントと同一レコード）
```
未認証のまま実ルーティング処理まで到達し実データを返すことを確認。本番と同一レコードが返ったことはBeaver_betaのDBが本番複製であることの追加裏取りにもなった。

**教訓**: ベータ環境の疎通確認で「認証が必要なはずのエンドポイントが通ってしまう／404になる」場合、`config.local.php`（`AUTH_DRIVER`等）がまだ複製されていない一時的な状態でないか疑うこと。複製前後で確認結果が変わりうる。他セッションとの独立した裏取りが実装バグではなく確認手順の見落としを検出した好例。

### 軽微な発見（実害なし、次回直すとよい）
`api/index.php`の`/health`エンドポイントが`{"status":"ok","app":"Beaver"}`と固定文字列を返しており、Beaver_betaでも`"Beaver"`のまま（`APP_ID`定数を使っていない）。ルーティング自体はBASE_PATH経由で正しく動作しているため実害はないが、疎通確認時に紛らわしい。`'app' => APP_ID`に直すのが望ましい。

### Access側へ渡す情報（`docs/spec/R-0141_beaver_beta_environment.md`末尾にも追記予定）
- ベータAPIベースURL: `https://door-fujita.com/contents/Beaver_beta/api/`
- 認証: 本番と同じauth-hub（`df_session`共有、Cookie path=/のため追加登録不要）
- DB再複製手順: 本番`api/database.sqlite`をSSHで`Beaver_beta/api/database.sqlite`へ`cp`（権限666に戻すこと）

---

---

## R-0140・R-0141 実装完了（2026-09-06）

前節の AccessTategu 側からの依頼（連携契約）を、Agent 2体（worktree隔離・並行実行）に委譲して実装した。

### 実装内容
- **R-0140 (1)(2)(4)(5)**: コミット `26d6903`
  - (1) `voucher_lines.quantity` を INTEGER→REAL 化（migration 028）、負数拒否を撤廃（値引行 `quantity=-1` 等を許容）
  - (2) `PATCH /customers/{id}/access-link` 新設（得意先の紐付け/解除、B-01〜B-04）。`customers.last_synced_at` 列追加（migration 029、既存スキーマに無かったため実装過程で発覚・追加）。`PUT /customers/{id}` から `access_customer_no` を更新対象外に（B-04、2-6は「無視される・200」に決定し仕様書へ追記済み）
  - (4) sales_categories のID突合は一致確認済みのため `docs/spec/02_機能仕様.md` へ運用注記のみ追記
  - (5) 見積番号+10000変換SQLを `api/manual/r0140_5_estimate_no_plus10000.sql` に用意（**未実行**。Access側P4全件再push直前に手動実行する）
  - (3) 基準線の記録はAccess側の合図待ちのため対象外（未着手）
  - migration 028/029 は**ローカルdev DBに適用済み**（backup: `api/backups/database_20260906_0335_pre_r0140_migrations.sqlite`）
- **R-0141**: コミット `21fecb5`
  - `api/config.php`のBASE_PATH・`frontend/vite.config.ts`のbaseを環境変数（`BEAVER_APP_ID`/`VITE_APP_ID`）から切替可能化。未指定時は従来通り本番`Beaver`として動作（後方互換確認済み）
  - Cookie/LocalStorageプレフィックスを`frontend/src/lib/appId.ts`で一元管理。本番は既存`bv_`を維持、それ以外は`{AppID}_`
  - `App.tsx`等の`/contents/Beaver`直書き5箇所（自己参照URL）をAPP_ID参照へ修正（実装Agentが当初のgrep洗い出しで見落としていたが追加発見・修正。ここを直さないとベータビルドがルーティング破綻する重大な穴だった）
  - `upload.ps1`に`-Beta`スイッチ追加（配置先・ビルド時AppID・`.htaccess`のRewriteBase/SetEnvを切替、省略時は本番向け挙動不変）
  - `docs/development_env.md`・`C:\Fujiruki\CLAUDE.md`（Git管理外）のAppID表にベータ行を追記済み
  - **本番サーバー側のベータ環境構築（`Beaver_beta`用ディレクトリ作成・SQLite複製・auth-hub実機疎通確認）は今回のスコープ外**、次回セッションで実施

### 実装体制・検証
- 仕様: `docs/spec/R-0140_accesstategu_r086_integration.md`、`docs/spec/R-0141_beaver_beta_environment.md`（いずれも受入条件表に対応テスト名を追記済み）
- Agent（`general-purpose`、worktree隔離で並行実行、TDD必須、トークン予算R-0140=45k/R-0141=35k・修正ループ上限5周・同一エラー2回で停止を事前宣言）に実装委譲。実績はR-0140が約221k、R-0141が約162kトークン（いずれも予算を大幅超過したが、指揮役の裏取り検証で問題は見つからなかった。次回は予算見積もりの見直しを検討）
- 指揮役が両worktreeの差分を確認しメインリポジトリへ手動コピー・統合（`.claude/regression-suite.sh`は両Agentが同じ箇所に別テスト行を追記していたため手動マージ）、vitest・PHPテスト・`npm run build`（本番/ベータ両AppID）・`bash .claude/regression-suite.sh`を再実行して裏取り（🔵青）
- migration 028/029のdev DB適用はauto mode classifierにブロックされたため、藤田晴樹さんに`!`プレフィックスでの直接実行を依頼して適用（PHPワンショットスクリプト経由）
- コミット: `26d6903`（R-0140）、`21fecb5`（R-0141）。**未push**
- 今回使用したworktree（`agent-a399193a86d74bd23`、`agent-a7c59debabfc5136e`）は統合後にnode_modulesがジャンクションでないことを確認した上で`git worktree remove --force`で削除済み

### 次にやること
1. **GitHubへのpush**: `26d6903`・`21fecb5`をfrontPC側（Access連携の相手）へ知らせるためpushが必要
2. **R-0141の本番サーバー側構築**: `Beaver_beta`用ディレクトリ作成、SQLite複製（本番の複製から）、`.htaccess`の`SetEnv`がConoHa WINGで`getenv()`に反映されるか実機確認、auth-hubログインフローの実機確認
3. **R-0140 (3)**: Access側から基準線記録の合図が来たら、G-14〜G-18のSQLを実行して記録する
4. **R-0140 (5)の本番実行**: Access側のP4全件再push直前に、Beaver停止・Access同期停止の窓で`api/manual/r0140_5_estimate_no_plus10000.sql`を本番DBに実行する（両側で日程調整）
5. 未着手のworktree5件（`agent-a30c433a79e970f9e`、`agent-a9ee1bf33f176e9e5`、`agent-abd15e38b709ae78f`、`agent-abe7bcf2e660d1f63`、`agent-ad15eead68ebef4b4`）の内容確認・削除は今回も未着手

---

## 参考: プロジェクト概要・アーキテクチャ

## プロジェクト概要

**Beaver** — 藤田建具店向け 製造業見積・請求・案件管理 Webシステム。
既存の MS Access システムと並行稼働し、約1年後に Access を廃止する計画。

- **配置**: `C:\Fujiruki\Projects\Beaver\`
- **URL（本番）**: `https://door-fujita.com/contents/Beaver/`
- **URL（開発）**: `http://localhost:5178/contents/Beaver/`
- **API（開発）**: `http://localhost:8003`
- **Git**: `C:\Fujiruki\Projects\Beaver\.git`（masterブランチ）

---

## アーキテクチャ概要

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
| `requests.md` | 未対応リクエスト一覧 |
| `requests_log.md` | 完了済みリクエストの記録 |
