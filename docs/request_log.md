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
| 2026-07-06 | R-075: 新規得意先登録の409エラー（B-3/B-4: コード自動採番＋フォーム撤去） | 実装完了（B-3/B-4のみ、B-1/B-2データ監査・本番デプロイは指揮役対応） | 真因はcustomers.codeのUNIQUE制約に空文字が衝突し、例外ハンドラが原因列を確認せずaccess_customer_noの重複と決め打ちしていたこと。B-3: POST時にUI経由の新規作成はクライアント指定codeを無視しnextCustomerCode()で自動採番、PUTからcode除外、classifyUniqueViolationColumn()で409メッセージの列判別を正確化（da641d0赤→1b3c06d緑、test_customers.php T-07〜T-10）。B-4: CustomerFormFields.tsxのcode欄を表示専用化、CustomerInput型からcode除外（e1b4ae3赤→8cf2fce緑）。**採番ルールを晴樹さん承認・Access側裏取り済みの確定版に修正**: 当初案「code/access_customer_noの最大値+1」はAccess側も独立採番（現在812まで）しているため将来衝突すると判明し、**90001〜の予約域連番**（access_customer_noは採番に一切影響しない）に置き換え（64f7adc赤→941fe5e緑）。回帰スイート全体exit 0。発見事項（未対応・報告のみ）: Access同期経路のINSERTでcode=access_customer_noがセットされていない |
