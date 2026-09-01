# R-0133/R-0134: Youkanボタン表示改善・改善要望モーダルの表示位置バグ

## R-0133: 「Youkanで見る」ボタンの表示改善

### 背景

本番フィードバック（/readyoubou、2026-08-31、id=39、案件一覧画面）:

> 「youkanで見るボタンがちゃんと機能して感動！ありがとう。一つ改善希望。ボタンの文言が長いので「Youkan↗」だけにして。そして、編集・削除のボタンと横並びにして。上下方向の余白をできるだけなくしたいので、そこでボタンの列で改行が起こっていると行高さが増えてしまって情報密度が下がってしまっている。」

### 現状

`frontend/src/components/YoukanLinkButton.tsx`（`ProjectDetail.tsx`・`ProjectList.tsx`共用）のボタン文言が`Youkanで見る ↗`（`loading`中は`確認中...`）。`ProjectList.tsx`の`actions`列（`width: 220`）内で`YoukanLinkButton` → 編集ボタン → 削除ボタンの順にインラインで並んでいるが、文言が長いため列内で折り返りが発生している。

### 対応方針

`YoukanLinkButton.tsx`のボタン文言を`Youkanで見る ↗`から`Youkan↗`へ短縮する（`ProjectDetail.tsx`・`ProjectList.tsx`共通コンポーネントのため両画面に反映される。詳細画面側の見た目が想定と異なる場合はその場で判断してよい）。`loading`中の文言はそのまま`確認中...`でよい。

### TDD必須

`ProjectList.youkanLink.test.tsx`等の既存テストで`{ name: /Youkanで見る/ }`のようにボタン名をマッチしている箇所があれば、新しい文言（`Youkan↗`等）に合わせて更新する。ボタン文言が意図通り変更されたことを検証するテストを残す。

### 受け入れ条件

1. `YoukanLinkButton`のボタン文言が短縮されている
2. 案件一覧の`actions`列で「Youkan↗」「編集」「削除」が折り返りなく横一列に収まる（既存の列幅・余白は変更しなくてよい）
3. 既存テスト・回帰スイートが通る

---

## R-0134: 改善要望を送るモーダルの表示位置バグ

### 背景

本番フィードバック（/readyoubou、2026-08-31、id=40、案件一覧画面）:

> 「改善要望を送るモーダルがサイドバーの幅、領域だけに収まるようになっちゃってる。これはモーダルなので表示領域全体の中央でいいんじゃないかな」

### 原因（指揮役が調査済み）

`FeedbackModal`（`frontend/src/components/feedback/FeedbackModal.tsx`）は`AppLayout.tsx`の`<nav>`（サイドバー）内に描画されている。R-0129でサイドバーに付与された`translate-x-0`/`-translate-x-full`（`md:translate-x-0`含め常時どちらか適用）は、値が実質恒等変換（`translateX(0)`）であってもCSS上は`transform`プロパティが存在するとみなされ、**子孫の`position: fixed`要素の containing block をそのtransformを持つ要素（nav）に変えてしまう**。結果、`FeedbackModal`の`fixed inset-0`オーバーレイがviewport全体ではなくnav（サイドバー）の矩形に収まってしまう。

`md:transform-none`をnavに追加するデスクトップ限定の対処では、改善要望ボタンがモバイルでは`navOpen`時（サイドバー展開時、このときも`translate-x-0`でtransformが適用される）にしか押せないため直らない。

### 対応方針

`FeedbackModal`のモーダルオーバーレイ部分（`isOpen`時の`<div className="fixed inset-0 ...">`、および`showCompleted`の完了トースト）を`ReactDOM.createPortal(..., document.body)`で`document.body`直下へ描画する。これによりnavのtransform状態に関係なくviewport全体を基準に表示される。トリガーボタン（「改善要望を送る」）自体はこれまで通りnav内に残してよい。

### TDD必須

モーダルを開いた状態でオーバーレイ（`role="dialog"`）が`document.body`直下（nav要素の外）にレンダリングされることを確認するテストを追加する。

### 受け入れ条件

1. モーダルを開くと、画面全体（viewport）の中央に表示される（サイドバー幅に収まらない）
2. モバイル・デスクトップいずれのビューポートでも同様に画面中央に表示される
3. 既存のフィードバック送信フロー（テキスト入力・画像添付・送信・キャンセル）が引き続き正常動作する
4. 既存テスト・回帰スイートが通る
