# リクエスト履歴

| 日付 | 内容 | 対応状況 | 反映先 |
|---|---|---|---|
| 2026-03-21 | 仕様書駆動開発への移行 | 完了 | spec/01〜06 |
| 2026-03-21 | Phase 7: AccessTategu連携 | 未着手 | requests.md |
| 2026-03-21 | TateguDesignStudioとの連携 | 未着手 | requests.md |
| 2026-07-02 | R-067: 得意先詳細画面で保存ボタンが機能しない（バグ） | 完了 | `<input type="email">`のネイティブHTML5バリデーションが不正な値でsubmitを黙ってブロックしていたのが原因。`CustomerDetail.tsx`の`<form>`に`noValidate`追加（コミット2c55c60, b8354b3） |
| 2026-07-04 | R-068: 得意先検索のIMEインクリメンタルサーチ問題（バグ） | 完了 | 真因は検索文字列変更のたびにisLoading早期リターンで画面全体が再マウントされinputが破棄されること。placeholderData: keepPreviousData + onCompositionStart/Endガードで修正（コミット a6af90c赤→5b44a8e緑）。指揮役が vitest 36/36・build exit 0 を再実行確認 |
| 2026-07-04 | R-069: 新規案件登録「＋新規得意先」ダイアログ改善 | 完了 | CustomerFormFields.tsx を抽出し CustomerDetail と NewCustomerModal で共有、全項目入力可能に（e693c2e赤→8239dcb緑）。改善点2（登録後の即時反映）は既存実装で充足と確認し回帰テストで固定（3123145）。同罪画面2件はR-070として切り出し |
| 2026-07-04 | R-070: 案件一覧・建具台帳一覧の検索でもIMEフォーカス喪失（R-068同罪画面） | 完了 | R-068確定パターン（placeholderData: keepPreviousData + onCompositionStart/Endガード）をProjectList/TateguItemListへ横展開（eaa8d70赤→e6e6c86緑）。指揮役が vitest 40/40・build exit 0 を再実行確認 |
| 2026-07-06 | R-071: 案件の保存ボタンが機能しない | 完了 | 真因はnoValidateでなくprojectsテーブルの4カラム欠落（order_date等、実装当初からスキーマ定義漏れ）。migration 020追加＋PHPテストで赤緑固定（19f9a02赤→1218189緑）。本番は4列既存で充足と確認 |
| 2026-07-06 | デプロイ列車（Beaver側） | 完了 | migration 018/019をprod適用（019はSQLiteのADD COLUMN制約でDEFAULT句なしに修正）、6/24以降の全コード（税計算修正・R-060 Stage2 API・R-067〜071）を本番反映。updated_atは全INSERT経路で明示セットに統一（d02c389）。事前バックアップ database_20260706_pre_train.sqlite |
| 2026-07-06 | R-073: 案件のステータス変更が保存されない（P00008） | 完了 | 真因はProjectDetailフォームのnoValidate欠落（R-067と同一パターンの取りこぼし）。不正な日付値を持つ案件のみネイティブHTML5検証がsubmitを黙殺。noValidate付与＋属性回帰テスト（55136c9赤→1c9068e緑）、本番デプロイ済み。指揮役が直接修正（担当エージェント利用枠上限のため、1語修正の例外対応） |
| 2026-07-06 | R-074: API応答にnginxコンテンツキャッシュ抑止ヘッダーを付与（バグ） | 完了 | R-073続報。真因はnoValidateではなくConoHaのnginxがAPIのGET応答をコンテンツキャッシュしていたこと（DB更新は成功していたが古いJSONが返り続けた、ブラウザ側キャッシュではないためCtrl+F5でも回避不可）。`api/index.php`の共通応答処理に`Cache-Control: no-store, no-cache, must-revalidate`+`Pragma: no-cache`を追加し全APIエンドポイントで一律抑止。ローカルcurlでヘッダー付与を確認、回帰スイートexit 0（静的アセットは対象外・触れず） |
| 2026-07-06 | R-075: 新規得意先登録の409エラー（B-3/B-4: コード自動採番＋フォーム撤去） | コード側は完全完了（B-1/B-2データ監査・本番デプロイは指揮役対応） | 真因はcustomers.codeのUNIQUE制約に空文字が衝突し、例外ハンドラが原因列を確認せずaccess_customer_noの重複と決め打ちしていたこと。B-3: POST時にUI経由の新規作成はクライアント指定codeを無視しnextCustomerCode()で自動採番、PUTからcode除外、classifyUniqueViolationColumn()で409メッセージの列判別を正確化（da641d0赤→1b3c06d緑、test_customers.php T-07〜T-10）。B-4: CustomerFormFields.tsxのcode欄を表示専用化、CustomerInput型からcode除外（e1b4ae3赤→8cf2fce緑）。**採番ルールを晴樹さん承認・Access側裏取り済みの確定版に修正**: 当初案「code/access_customer_noの最大値+1」はAccess側も独立採番（現在812まで）しているため将来衝突すると判明し、**90001〜の予約域連番**（access_customer_noは採番に一切影響しない）に置き換え（64f7adc赤→941fe5e緑）。**追加対応: Access同期経路（access_customer_noあり分岐）のcode自動整合**: 新規sync時はcode=access_customer_noで統一、code空の既存得意先への再syncではcodeを埋める、既に整合済みのcodeは上書きしない（B-2データ保護）。sync_helpers.phpにはcustomersへのINSERT/UPDATEは無く変更対象はcustomers.phpのみ（55092f2赤→cfef567緑、T-11〜T-13）。回帰スイート全体exit 0。 |
| 2026-07-07 | R-075 B-2: 本番得意先データの整合修正 | 完了 | 監査結果: 806件中800件は既にcode=access_customer_noで一致・値の競合0件。修正6行のみ: 門田組の重複統合（案件1件をid=50へ付替え・id=1論理無効化）、code空5件に90001〜90005採番（晴樹さん承認・本人実行）。バックアップ database_20260706_pre_r075.sqlite。コード側（自動採番・コード欄撤去・同期整合）も同日デプロイ済み |
| 2026-08-05 | R-0080: 改善要望を伝えるフィードバックフォーム（画像複数添付） | 完了 | Beaver内どの画面からも開ける「改善要望を送る」ボタン→本文＋画像最大5枚を送信、`feedback`/`feedback_images`テーブルに保存。開発側（Claude）が`GET /admin/feedback`（`X-Admin-Token`認証）で本番データを直接読みに行く運用。実装・検証後、本番デプロイ（migration 022, コミット e479c1d/9b63baf）。詳細仕様: `docs/spec/R-0080_feedback_form.md` |
| 2026-08-05 | R-0080実運用中に発覚: 不正UTF-8で`GET /admin/feedback`応答が沈黙するバグ | 完了 | `json_encode`が1行でも不正UTF-8を含むと`false`を返し、HTTPステータス200/201のままレスポンスボディが空になる不具合。`JSON_INVALID_UTF8_SUBSTITUTE`付与＋POST側`mb_check_encoding`での入力検証で修正（コミット9b63baf、本番デプロイ済み） |
| 2026-08-05 | R-0081: フィードバックモーダルの文字コントラスト修正 | 仕様化済み | R-0080本番リリース直後に届いた実フィードバックより。入力欄・タイトル・キャンセルボタンの文字色が薄すぎる問題を修正。詳細仕様: `docs/spec/R-0081_R-0082_feedback_modal_improvements.md` |
| 2026-08-05 | R-0082: フィードバックモーダルにクリップボード画像貼り付け機能を追加 | 仕様化済み | 同上フィードバックより。「画像を追加」の隣に貼り付けボタンを追加。詳細仕様: `docs/spec/R-0081_R-0082_feedback_modal_improvements.md` |
| 2026-08-05 | R-0083: 検索の複数プロパティ対応 Phase1（得意先 + ComboSelect共通化） | 完了 | 同上フィードバックより。ComboSelectのEnter選択修正（全利用箇所に波及）＋得意先検索対象を読み・電話番号・住所・備考へ拡張。他画面への横展開はPhase2としてバックログ（R-0084）へ。実装・検証後、本番デプロイ済み（コミット1278e8c）。詳細仕様: `docs/spec/R-0083_search_multi_property.md` |
| 2026-08-05 | R-0081/R-0082 本番デプロイ | 完了 | コミット11e6b34。本番デプロイ・疎通確認済み |
| 2026-08-05 | R-0085: 案件ステータスのマスタ化（設定画面から追加・編集・並び替え可能に） | 完了 | R-0080フィードバック（id=4）より。案件一覧のステータスソートを工程順にし、「キャンセル」を含むステータス名を`sales_categories`と同パターンのマスタテーブル化して設定画面から管理可能にする。副次的に`projects.php`内の`'cancelled'`（英語・未使用の先行実装）が実際の日本語ステータス値と不整合だった表示バグも解消。本番デプロイ済み（コミット1b7e943、migration 023）。詳細仕様: `docs/spec/R-0085_project_status_master.md` |
| 2026-08-05 | R-0086/R-0087/R-0088: 案件一覧・案件編集画面の改善 | 完了 | R-0080フィードバック（id=5,6,7）より。案件一覧に納期列追加、案件編集画面に得意先の住所・電話（tel:リンク）・メール（mailto:リンク）・備考の非編集プレビューと「得意先を編集」ボタン、タイトル横の保存ボタン、案件コード欄を狭く案件名欄を広くするレイアウト調整。本番デプロイ済み（コミットe4c130f）。詳細仕様: `docs/spec/R-0086_R-0087_R-0088_project_screens.md` |
| 2026-08-05 | R-0089: 案件編集画面のステータスをステッパーUIに | 仕様化済み | R-0080フィードバック（id=8）より。横一列の●＋線のステッパーに変更。詳細仕様: `docs/spec/R-0089_status_stepper.md` |
| 2026-08-05 | R-0090: 検索のひらがな/カタカナ正規化＋空白区切りAND検索 | 仕様化済み | R-0080フィードバック（id=9）より。`buildMultiColumnSearchClause`をトークンAND＋かな正規化対応に拡張。詳細仕様: `docs/spec/R-0090_search_kana_and.md` |
| 2026-08-05 | R-0091/R-0092: 案件一覧の検索拡張・状態のURL保持・複合ソート | 仕様化済み | R-0080フィードバック（id=10）より。得意先名も検索対象に、ページ/ソート/検索語をURLへ保持、DataTableへオプトインのShift+クリック複合ソートを追加（他画面は後方互換）。詳細仕様: `docs/spec/R-0091_R-0092_project_list_search_sort.md` |
