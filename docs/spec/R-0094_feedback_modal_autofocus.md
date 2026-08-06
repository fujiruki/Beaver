# R-0094: フィードバックモーダルのオートフォーカス

## 背景
R-0080フィードバック（id=11、2026-08-05 07:32）より。

> 改善要望を送るモーダルを開いたときに、入力欄にフォーカスがあたった状態にしてほしい。すぐに入力し始められるから。

なお同じ要望に含まれる「Ctrl+Vで画像を貼り付けたら添付される」機能は、R-0082で既に実装・本番デプロイ済み（`frontend/src/components/feedback/FeedbackModal.tsx`の`onPaste={handleTextareaPaste}`）。今回は動作確認のみ行い、追加実装は行わない。

## 対象
`frontend/src/components/feedback/FeedbackModal.tsx`

## 仕様
モーダルを開いた（`isOpen`が`true`になった）直後に、`<textarea>`へ自動的にフォーカスを当てる（`useRef`+`useEffect`、または`autoFocus`相当の実装。モーダルの表示アニメーション等は無いため単純な`ref.current?.focus()`でよい）。

## 受け入れ条件
1. 「改善要望を送る」ボタンでモーダルを開くと、本文入力欄に自動でフォーカスが当たっていること
2. 既存のテストが壊れないこと。オートフォーカスの挙動をテストに追加すること
