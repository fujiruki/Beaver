# R-0096 Phase2b: 保存・削除成功後の遷移もuseSmartBack化

## 背景
藤田晴樹さんより2026-08-06に発覚: 「案件一覧でソートして、案件を開いて編集して保存ボタンで戻ったらソートが消える」。

R-0096 Phase2（`useSmartBack`導入）は「← 戻る」「キャンセル」「閉じる」ボタンのみを対象とし、フォーム保存・削除成功後の遷移（`onSubmit`内の`navigate(固定パス)`）は意図的にスコープ外としていた。これが判断ミスで、同じ「一覧のURL状態を無視して固定遷移する」バグが保存成功後にも残っていた。

指揮役によるレビューで、同じパターンが以下8箇所に残っていることを確認済み:

1. `frontend/src/pages/ProjectDetail.tsx:110` — 保存成功後 `navigate('/projects')`
2. `frontend/src/pages/ProjectDetail.tsx:146` — 完全削除成功後 `navigate('/projects')`
3. `frontend/src/pages/CustomerDetail.tsx:48` — 保存成功後 `navigate('/customers')`
4. `frontend/src/pages/TateguItemDetail.tsx:131` — 保存成功後 `navigate('/tategu')`
5. `frontend/src/pages/CarryForwardEdit.tsx:24` — 保存成功後 `navigate('/customers/${id}')`
6. `frontend/src/pages/VoucherEdit.tsx:248` — 保存成功後（既存伝票） `navigate('/vouchers')`
7. `frontend/src/pages/VoucherEdit.tsx:512` — 編集モードの「キャンセル」ボタン `navigate('/vouchers')`（同ファイルの「閉じる」ボタン・読み取り専用モードの「← 案件に戻る」は既に`useSmartBack`化済み、この2箇所だけ未対応）
8. `frontend/src/pages/InvoiceDetail.tsx:64` — 新規作成成功後 `navigate('/invoices')`
9. `frontend/src/pages/InvoiceDetail.tsx:81` — 削除成功後 `navigate('/invoices', { state: { toast: {...} } })`（トースト表示用のstateを引き継いでいる点に注意）

## 修正方針

各画面は既に（またはこの修正で新規に）`useSmartBack(フォールバック先)`のインスタンスを持っているはず。1〜6・8は単純に`navigate(固定パス)`を`goBack()`（そのフックの戻り値）に置き換える。

9（InvoiceDetail削除、トーストstate付き）は注意が必要:
- `useSmartBack`フック自体に、フォールバック時（履歴が無い場合）に渡す`state`をオプション引数で受け取れるよう拡張する（例: `useSmartBack(fallbackPath, fallbackState?)`、内部の`navigate(fallbackPath, { state: fallbackState })`に反映）
- 履歴がある場合（`navigate(-1)`相当）はstateを新たに付与できない（React Routerの制約）ため、その場合はトーストが表示されなくてもやむを得ない。フォールバック時だけでもトーストが出れば十分実用的、という前提で進めてよい

## TDD必須
既存のsmartBack関連テスト（`ProjectDetail.smartBack.test.tsx`等）を参考に、各画面で「保存/削除成功後、履歴があれば一覧のクエリ状態を保ったまま戻ること」を検証するテストを追加する。既存テストは壊さない・削除しないこと。

## 検証
- `cd frontend && npx vitest run` で全PASSを確認
- `cd frontend && npm run build` で exit 0を確認
- `bash .claude/regression-suite.sh` で exit 0を確認

## 受け入れ条件
1. 案件一覧でソート→案件を開いて編集→保存、で一覧に戻るとソート状態が復元される
2. 得意先・建具台帳・伝票・請求書についても同様（保存・完全削除・新規作成後の遷移で、一覧のURL状態を壊さない）
3. 請求書削除後のトースト表示は、フォールバック遷移時には引き続き機能する
