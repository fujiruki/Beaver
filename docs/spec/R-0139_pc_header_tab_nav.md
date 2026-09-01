# R-0139: PC表示時のナビゲーションをサイドバーから上部ヘッダーのタブへ変更＋アイコン追加

## 背景

本番フィードバック（/readyoubou、2026-09-01、id=45、段取りボード画面）:

> 「サイドバーのメニューは上部ヘッダーにタブっぽく表示しようか、PCのときは、左の領域がずっと占領されててもったいない。それと、それぞれのタブタイトルにアイコンを先頭に追加してわかりやすくしたい。」

藤田晴樹さんの確認（2026-09-01）: 今回のreadyoubouで仕様化・実装まで進める。デザイン詳細（タブの見た目・アイコン種類）は指揮役に一任。

## 現状（指揮役が調査済み）

`frontend/src/components/layout/AppLayout.tsx`:
- PC（`md`=768px以上）: 左サイドバー（`<nav>`、幅180px固定、`md:static`）が常時表示され、本文（`<main>`）は残り幅を使う
- モバイル（`md`未満）: ハンバーガーボタン付きの上部固定ヘッダーバー（`md:hidden`）＋開閉式サイドバー（オーバーレイ、R-0129）
- サイドバー内には、上から: ロゴ、`navItems`（9項目: ダッシュボード/得意先/案件/段取り/伝票/建具台帳/請求/アプリ設定/ヘルプ）、ユーザー名＋ログアウトボタン、改善要望ボタン（`FeedbackModal`）、ビルド時刻表示
- `<main>`のパディングは`pt-14 md:pt-6`（R-0131でTailwindクラスに統一済み）

## 対応方針

### スコープ

- **PC（`md`以上）のみ変更**する。モバイル表示（ハンバーガーメニュー＋サイドバーオーバーレイ、R-0129/R-0131で確立済みの挙動）は変更しない
- 新規に依存パッケージを追加しない。既存コードにアイコンライブラリが入っていないため、アイコンは絵文字を使う（`? ヘルプ`など既存の記号プレフィックスと同じ路線）

### レイアウト変更

`AppLayout`のトップレベルを`flex-direction: row`から`flex-direction: column`に変更し、PC時は上に新規ヘッダー、下にメインという縦積み構成にする:

```
<div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', ... }}>
  {/* 新規: PCヘッダー（md以上でflex表示、md未満はhidden） */}
  <header className="hidden md:flex" style={{...}}>
    <span>Beaver</span>
    <nav style={{ display:'flex', gap: 4 }}>
      {navItems.map(タブ（アイコン＋ラベル、アクティブハイライト）)}
    </nav>
    <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
      {ユーザー名・ログアウトボタン・改善要望ボタン・ビルド時刻をコンパクトに配置}
    </div>
  </header>

  {/* 既存: モバイル用ヘッダーバー（変更なし、md:hidden） */}
  <div className="md:hidden" style={{position:'fixed', ...}}>...</div>

  {navOpen && <既存のオーバーレイ md:hidden />}

  <div style={{ display:'flex', flex:1 }}>
    {/* 既存サイドバー: PCでは非表示にする（md:hiddenを追加）、モバイルの開閉式表示は現状維持 */}
    <nav className="fixed inset-y-0 left-0 z-50 md:hidden ...">...</nav>
    <main className="pt-14 md:pt-0" style={{ flex:1, ... }}>
      <Outlet />
    </main>
  </div>
</div>
```

- サイドバー（`<nav>`）に`md:hidden`を追加し、PCでは完全に非表示にする（モバイル専用に限定）
- `<main>`の`md:pt-6`は、PCヘッダーがdocument flow内に来るため不要になり`md:pt-0`へ変更する（`pt-14`はモバイル用のまま維持）
- PCヘッダー内のタブは`navItems`をそのまま流用し、各項目にアイコン（絵文字）を追加する:
  - ダッシュボード: 📊
  - 得意先: 👥
  - 案件: 📁
  - 段取り: 📅
  - 伝票: 🧾
  - 建具台帳: 🚪
  - 請求: 💰
  - アプリ設定: ⚙️
  - ヘルプ: ❓（既存の`? ヘルプ`ラベルの`?`をアイコン化し、ラベル文言は「ヘルプ」に変更）
- アクティブなタブは背景色や下線でハイライトする（既存サイドバーの`isActive`ハイライトと同じ考え方）
- ユーザー名・ログアウト・改善要望ボタン・ビルド時刻は、PCヘッダー右端にコンパクトに配置する（サイドバー下部にあった配置をそのまま持ち込むのではなく、横一列に収まる表示に整理する）

### 既存テストとの整合

以下の既存テストは、DOM構造ではなく表示テキスト・振る舞い（`screen.getByText`/`fireEvent`）で検証しているため、配置場所がサイドバーからPCヘッダーへ変わっても同じ結果になるよう実装すること:
- `AppLayout.auth.test.tsx`（ユーザー名表示・ログアウト導線）
- `AppLayout.buildTime.test.tsx`（ビルド時刻表示）
- `AppLayout.pageTitle.test.tsx`（`document.title`、レイアウト非依存）
- `AppLayout.mobileNav.test.tsx`（ハンバーガーメニューの開閉、モバイル側は変更しないためそのまま通ること）

`AppLayout.mainPadding.test.tsx`は今回の仕様変更で`md:pt-6`→`md:pt-0`に値が変わるため、このテスト自体を新しい値に合わせて更新する（`pt-14`はモバイル用として変更なし）。

## TDD必須

`frontend/src/components/layout/__tests__/`に以下を検証するテストを追加する:
1. PC幅相当（`md:flex`が効く想定のクラス指定）でヘッダー内にナビタブ（アイコン＋ラベル）が表示される
2. アクティブなパスに対応するタブがハイライトされる（`isActive`相当のクラス・スタイル）
3. PCヘッダーが表示される一方で、サイドバー（`<nav>`のモバイル用要素）が`md:hidden`になっている
4. 既存の`AppLayout.mobileNav.test.tsx`・`AppLayout.auth.test.tsx`・`AppLayout.buildTime.test.tsx`・`AppLayout.pageTitle.test.tsx`は無改修のまま通ること

## 実装時に判明した既存バグ（R-0137の真因、あわせて修正）

実装・実ブラウザ検証の過程で、`AppLayout.tsx`のモバイル向けヘッダーバー（`position:fixed, top:0`）とモバイル用サイドバー`<nav>`が、`className`に`md:hidden`を持ちながらインラインstyleに`display: 'flex'`を直接指定していたため、**PC幅（md以上）でもインラインstyleがCSSのレスポンシブ非表示を上書きし、常時表示され続けていた**ことが判明した（実ブラウザでビューポート幅1920pxにて`getComputedStyle`で`display:flex`のままであることを確認）。

このバグにより、モバイルヘッダーバー（`zIndex:30`、画面最上部に幅いっぱいで固定）がPC幅でも表示され続け、新設したPCヘッダーの上に重なって隠す事態が発生した。また、これはPC/デスクトップからの本番フィードバック（R-0137「上部の保存ボタンが隠れる」、`docs/requests.md`で要確認・保留中だった要望）とも症状が一致し、**R-0137の真因である可能性が高い**と判断した。

対応: インラインstyleから`display: 'flex'`を削除し、`className`側に`flex`を追加する形へ修正（`className="flex md:hidden"`）。モバイルヘッダーバー・モバイル用サイドバー`<nav>`の両方に適用した。

## 受け入れ条件

1. PC（md以上）でサイドバーが表示されず、上部ヘッダーに横並びのタブとしてナビゲーションが表示される
2. 各タブの先頭にアイコン（絵文字）が付く
3. 現在表示中の画面に対応するタブがハイライトされる
4. モバイル表示（ハンバーガーメニュー・サイドバーオーバーレイ）は従来通り動作する
5. ユーザー名表示・ログアウト・改善要望ボタン・ビルド時刻表示がPCヘッダー上で引き続き機能する
6. 既存テスト・回帰スイートが通る（`AppLayout.mainPadding.test.tsx`は新しいpadding値に更新する）
