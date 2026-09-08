# 引き継ぎ資料アーカイブ — Beaver（2026-09-08分）

`Hikitsugi_LATEST.md`から切り出した2026-09-08の詳細記録。AccessTategu連携R-0143 / A-X-01（Dodaikun⇔Beaverベータ切替）の実施内容。

---

## A-X-01（Dodaikun⇔Beaverベータ切替）全記録

AccessTategu連携契約R-0143のbackpc側タスク（A-B-01〜12）はすべて完了・commit+push済み（`22dfe58`）。2026-09-08、Dodaikunから合図が届き、A-X-01（設計書`docs/Dodaikun_Beaver連携設計.md`§10-5、AccessTategu側リポジトリ）に着手：

- **手順1（完了）**: SSHで本番`Beaver/api/database.sqlite`をBeaver_betaへ再複製→基準線記録（総数823・access_customer_no空23・code>=90001が22・同名19グループ/45行、前回暫定値と完全一致）、Dodaikunへ報告済み
- **手順2（Dodaikun側完了）**: ImportBeaverSnapshot→RunMatching（run_id=10）。結果T1=800/T2=2/T4=24/T5=17/T6=4、pending/hold 0。T6（重複4組: Access53/662/764/791、keep⇔dup id）の事前情報を受領し、Beaver_betaで内容照合済み（一致確認）
- **手順3（ApplyRun実行→事故発生→復旧）**: DodaikunがApplyRun実行（applied=814/failed=6）。失敗6件はBeaver側`api/auth_gate.php`に`POST /customers`の同期トークン免除が無かったため401（新規タスクA-B-13としてDodaikunが起票）。
  - **A-B-13対応**: Codexへ実装委譲→`authGateIsExempt()`に`POST /customers`免除を追加（GETは対象外のまま維持）、テスト追加（8/8 PASS、回帰56/0 PASS）、commit `0e5001b`、Beaver_betaへデプロイしcurlで201確認済み
  - **⚠️事故（お詫び済み）**: A-B-13デプロイ時に`upload.ps1 -Beta -KeepLocalDB`を実行したところ、**`-KeepLocalDB`は名前と逆の意味（ローカルdev DBでリモートを上書きするフラグ）**であることに気づかず、Beaver_betaのDBが一時的にローカル開発用DB（得意先3件のみ）で上書きされる事故が発生。Dodaikunの手順3 ApplyRun結果がBeaver_beta側から失われた（本番Beaverは無傷）。本番から再cloneして基準線状態（823件）まで復旧済み、Dodaikunへ経緯を報告しApplyRunの再実行を依頼済み。詳細: プロジェクトメモリ`feedback_upload_ps1_keeplocaldb_gotcha.md`
  - この作業中、SYNC_API_TOKENの値をsedコマンドのミスで一度ターミナル出力に露出させてしまった（`feedback_secret_leak_response.md`の方針により緊急ローテーションは不要と判断、記録のみ）
- **手順3再実行（完了）**: DodaikunがApplyRunを最初からやり直し、applied=824/failed=0で緑に。V-01/03/04/05/07/08/09/10全て期待値
- **A-B-10（完了）**: 重複得意先統合スクリプトをBeaver_betaで本実行（dry-run→本実行）。4組（keep50←dup1、652←824、754←796、781←814）のFK付け替え・論理削除。FK孤児0件確認済み
- **Beaver側V照合（完了）**: V-02=0、V-04=0行、V-05=0、V-06相当=824、総数828、code>=90001=0。全て期待値通り
- **手順4（完了）**: `api/manual/r0140_5_estimate_no_plus10000.sql`をBeaver_betaで実行。estimate 13件（2003-2080→12003-12080）、sales 7件（0-2080→10000-12080）で正しく変換
- **手順6（Dodaikun側完了）**: sync_paused削除（1→0）
- **手順5 RunFullPush（Dodaikun側で実行→大量エラー）**: 対象5,890件を送信した結果、failed_retryable 5,878件（HTTP 500）・failed_permanent 12件（400×8/401×4）・sent 30件という大規模障害が発生。原因を3つ特定:
  1. **500（5,878件）**: migration 030/031/032/034/035（`vouchers.access_billed_flag`等）が本番・Beaver_beta両方に一度も適用されていなかった（`applied.txt`に「未適用」のまま放置。今回の一連の事故とは無関係の、以前からの適用漏れ）。藤田晴樹さんの許可を本セッションで直接確認の上、PHP PDO経由（CLIのsqlite3は3.7.17で部分インデックス入りスキーマを読めなくなるため使用不可、`malformed database schema`エラーで実際に遭遇）で適用。PRAGMA table_infoで全列存在・customers件数不変(828)を確認、`applied.txt`更新（commit `85cfd30`）
  2. **401（4件）**: `POST /projects/{id}/vouchers/sync`が`auth_gate.php`の同期トークン免除リストに無かった（A-B-08当時の設計漏れ）。同種の見落とし2件（`PATCH /projects/{id}/vouchers/{no}/shipped`・`PATCH /projects/{id}/customer`）も発見し、まとめてA-B-14として対応。Codexへ委譲→`test_auth_gate_unit.php`の既存アサーション更新含め全テストPASS→commit `6340795`→Beaver_betaへデプロイ・token無し401確認済み
  3. **400（8件、うち4件は`access_voucher_id`必須エラー）**: `sync_helpers.php`の`readJsonBody()`がjson_decode失敗を握り潰し空配列を返す実装のため、Access側の不正なUTF-8バイト（単独サロゲート、Access側でR-131として修正）を含むペイロードが「フィールド無し」扱いになっていた。Beaver側の改善（decode失敗を明示的にログ・エラー返却）はA-B-15として依頼済み・**未着手**（急ぎではない）
- **A-B-16（完了）**: 藤田晴樹さんの業務判断（相殺・返金伝票対応）として本セッションで直接確認の上、`sync_helpers.php`の`total_amount < 0`拒否バリデーションを2箇所削除（`is_numeric`チェックは維持）。Codexへ委譲、回帰56/0 PASS、commit `e773614`、Beaver_betaへデプロイ済み
- **全件再送（完了）**: migration適用・A-B-14・A-B-16の反映後、sent 5,918件（対象5,888件＋既存分）、pending/failed 0件で完走
- **手順6相当の照合（完了）**: access_voucher_id重複0件・customer_id NULL 0件・vouchers総数11,665件（うちaccess_voucher_id設定済み5,889件）
- **1件差異の調査（完了）**: Access側5,888件とBeaver_beta 5,889件で1件差異。Access側現行IDリスト（レンジ圧縮形式）を受領しローカルPHPスクリプトで突合。孤児1件（access_voucher_id=4613、id=5792、voucher_no=S04594、2026-07-14作成の古いdraft状態sales伝票、今回の作業とは無関係）を特定。未送信は0件で完全一致
- **孤児（access_voucher_id=4613）削除（完了）**: 藤田晴樹さん承認、バックアップ後に削除。削除後、access_voucher_id設定済み件数が5,888件でAccess側と完全一致
- **手順7実行→新たな問題2件**: 藤田晴樹さんがベータFEで「Beaverと同期」実行 →
  1. **【完了】** Beaver_betaの`access_voucher_id IS NULL`のvouchers（当初Dodaikunは「1,000件、2002〜2015年」と報告したが、実クエリでは5,776件で乖離。`created_at`が2026-03-17 20:04台（UTC）に集中する5,772件が単発seed/インポート処理の痕跡と特定、残る4件（id=5805-5808、project_id付きの最近のdraft伝票、edited_in_beaver=1）は除外対象と確定。藤田晴樹さんの最終承認を得て安全チェック付きスクリプトで削除実行。vouchers総数5,892件、access_voucher_id NULL残数4件（想定通り）
  2. **【低優先・対応不要】** A-B-10で無効化した重複customer 4件（DUP-始まりのcode）が、`GET /customers/sync`に`is_active`除外フィルタが無いため「新規」としてAccess側に誤同期された。原因はコードで確認済み、Dodaikun側でtbl競合待ちから破棄済み。恒久対応は`docs/requests.md`の32番に記録（急ぎではない）
- **A-B-11（完了）**: 手順7の伝票プルが毎回失敗する別バグ。`GET /vouchers/sync`・`GET /projects/sync`が`next_cursor`はあるのに`next_cursor_at`を返しておらず（`limit+1`件目を`array_slice`で切り捨てる前に取得し忘れ）、Access側の安全策に引っかかっていた。Codexへ委譲、56/0 PASS、commit `0c7224a`、Beaver_betaへデプロイ・curlで確認済み
- **タイムゾーン変換漏れ修正（完了）**: A-B-11後の手順7再実行で得意先beaver_newerが523件超誤って積まれる問題。DodaikunがAccess側実データで裏取り（得意先№812・№755の具体例、9時間のズレ）、`customerAccessLink()`・POST customer upsert（update/insert両分岐）・`syncVoucherAccessLink()`の4箇所が生UTC値のまま返していたと特定。Codexへ委譲（**途中Codexタスクが1時間以上ハングする事故発生、`codex-companion.mjs status`で異常検知→`TaskStop`→`--fresh`で再投入し2分で完了。詳細: プロジェクトメモリ`feedback_codex_hang_diagnosis.md`**）、56/0 PASS、commit `5549c56`、Beaver_betaへデプロイ済み
- **⚠️派生の緊急回帰（完了）**: タイムゾーン修正直後、`POST /customers`が500エラーに。`utcToJst()`が定義されている`sync_helpers.php`が`GET /customers/sync`分岐内でのみrequireされており、POST等の他ルートで未定義関数エラーになっていたため。`require_once`を常時ロード群へ移動して修正（commit `2ea3f68`）、4テストファイル全PASS確認、再デプロイ・DB件数変化なし確認。`test_push_responses_last_synced_at.php`の1ケースも旧仕様（生UTC一致）からJST変換一致へ更新（commit `dcdea26`）

## その他の対応（A-X-01と並行、2026-09-08）

- **R-0093修正**: バックログのPHPテスト一時SQLiteファイル名の並行実行競合をCodexへ委譲・修正（`test_sync.php`の`test_migration_012`ケースのみ固定名が残っていた）。commit `6d93a3f`、`docs/requests.md`も解決済みに更新（commit `e66f361`）
- **`/hikitsugi`スキル新規作成**: `C:\Users\fjtsu\.claude\commands\hikitsugi.md`（Beaver固有ではなく汎用スキル）。セッションの引き継ぎ資料を更新し、次セッション冒頭に貼り付ける短いプロンプトを出力する
- **AccessTateguビルド進捗GUI**: Dodaikunからの依頼でPowerShell+Windows Forms GUIを実装（Codexへ委譲）。Beaver側の対応は完了、Dodaikun側で実機確認・コミット済み（`142cd4e`→`302fa76`）
