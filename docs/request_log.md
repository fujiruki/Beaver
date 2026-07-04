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
