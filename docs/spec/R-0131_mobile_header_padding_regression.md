# R-0131: 【緊急】スマホ表示で上部のボタン・行がヘッダーに隠れる（R-0129リグレッション）

## 背景

本番フィードバック（/readyoubou、2026-08-31）:

> id=37（14:53、画像添付）: 「上部の保存ボタンとその行が隠れてる。ボタンも押せなくて不便だから直して」
> id=38（14:54）: 「さっき送った上部が隠れてる問題、他のページでも同様だ。なおして」

R-0129（本日デプロイ）のリグレッション。スマホでページ上部のボタン・行が固定ヘッダーの下に隠れ、押せなくなっている。

## 原因（指揮役がローカル環境で再現・特定済み）

`frontend/src/components/layout/AppLayout.tsx`の`<main>`要素:

```tsx
<main className="pt-14 md:pt-0" style={{ flex: 1, minWidth: 0, padding: 24, background: '#f8fafc' }}>
```

インラインstyleの`padding: 24`（ショートハンド、`padding-top`も含む）が、CSS詳細度でTailwindクラス`pt-14`/`md:pt-0`を常に上書きする（インラインstyleはクラスセレクタより優先度が高い）。結果、モバイルでも`padding-top`が24pxのまま（意図した56px）。固定ヘッダーバー（ハンバーガー行）は実測53px。差し引き約29px分、ページ先頭のボタン・行がヘッダーの下に隠れる。

`AppLayout`の`<main>`は全ルート共通のため、**R-0129で変更した全ページ（ダッシュボード・案件一覧・得意先一覧に限らず、案件編集・伝票編集等すべて）に影響する**。ローカル環境でChrome DevTools Protocolのモバイルエミュレーション（390×844）を使い、案件一覧の「＋新規登録」ボタン・案件編集の「戻る」「保存」ボタンで実際に隠れることを確認済み。

## 対応方針

`AppLayout.tsx`の`<main>`インラインstyleから`padding: 24`（ショートハンド）を除去し、`paddingLeft: 24, paddingRight: 24, paddingBottom: 24`のみインラインで残す。`padding-top`はTailwindクラスのみで制御する:

```tsx
<main className="pt-14 md:pt-6" style={{ flex: 1, minWidth: 0, paddingLeft: 24, paddingRight: 24, paddingBottom: 24, background: '#f8fafc' }}>
```

- `pt-14` = 56px（モバイル、ヘッダー53px＋余白確保）
- `md:pt-6` = 24px（デスクトップ、既存の見た目を維持。`md:pt-0`ではなく`md:pt-6`にする点に注意——`md:pt-0`のままだと今回の修正でインラインstyleの上書きが外れた結果、デスクトップの上余白が消えてしまう）

## TDD必須

- `AppLayout.tsx`のレンダリングテストで、`<main>`要素のインラインstyleに`paddingTop`が含まれないこと（Tailwindクラスに委譲されていること）を確認する
- `<main>`のclassNameに`pt-14`と`md:pt-6`の両方が含まれることを確認する

## 受け入れ条件

1. `<main>`のインラインstyleに`padding`（ショートハンド）または`paddingTop`が含まれない
2. `<main>`のclassNameが`pt-14 md:pt-6`を含む
3. 既存のテスト・ビルド・回帰スイートが通る
4. デプロイ後、ローカルまたは本番でモバイルエミュレーション（Chrome DevTools Protocol等）を使い、案件一覧の「＋新規登録」ボタン・案件編集の「戻る」「保存」ボタンがヘッダーに隠れず完全に見えることを目視確認する
