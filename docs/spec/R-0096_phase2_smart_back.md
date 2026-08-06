# R-0096 Phase2: useSmartBack共通フックの導入

## 背景
R-0080フィードバック（id=12、2026-08-06）で発覚した実バグ:

> 案件を開いて、もういちど案件一覧に戻るとソートが消える

Fableの設計提案（`docs/wiki/knowledge`、R-0096節）で既に指摘されていた問題そのもの。`ProjectDetail.tsx`の「← 戻る」ボタン（153行目付近）が`navigate('/projects')`に固定されており、一覧側がURLクエリに保持しているソート・検索・ページ状態（R-0091/R-0096 Phase1で対応済み）を無視して素の一覧へ遷移してしまう。同じパターンが他の詳細/編集画面にも存在する。

Phase1（一覧画面のURL状態保持）は完了済み。本Phase2は、藤田晴樹さんが既に承認した設計方針「履歴優先＋フォールバック」を実装する。

## 設計（Fable提案そのまま）

```
useSmartBack(fallbackPath):
  アプリ内履歴が積まれていれば navigate(-1)   ← 一覧のURL同期により状態込みで復元される
  履歴が空（直リンク・リロード直後等）なら navigate(fallbackPath)  ← 現行の固定先をそのまま流用
```

判定方法: React Routerの`location.key`が`'default'`（＝このタブでこのページ以前に遷移していない、直リンク/リロード直後の状態）であればフォールバック、それ以外は`navigate(-1)`を使う。

## 実装内容

`frontend/src/hooks/useSmartBack.ts`（新規）:
```ts
import { useLocation, useNavigate } from 'react-router-dom';

export function useSmartBack(fallbackPath: string) {
  const navigate = useNavigate();
  const location = useLocation();
  return () => {
    if (location.key && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  };
}
```

以下の「← 戻る」ボタン（および同等の「戻る」「閉じる」導線）を、`useSmartBack(既存の固定遷移先)`に置き換える:
- `frontend/src/pages/ProjectDetail.tsx`（`navigate('/projects')`、153行目・364行目のキャンセルボタンも含む）
- `frontend/src/pages/CustomerDetail.tsx`
- `frontend/src/pages/TateguItemDetail.tsx`
- `frontend/src/pages/InvoiceDetail.tsx`
- `frontend/src/pages/CarryForwardEdit.tsx`
- `frontend/src/pages/VoucherEdit.tsx`（「閉じる」「← 案件に戻る」の2箇所。既に`navigate(-1)`を使っている箇所があるが、これも`useSmartBack`に統一し、フォールバック先（案件詳細 or 伝票一覧）を明示する）

**保存後の遷移**（フォーム送信成功後に`navigate(固定先)`している箇所）は今回のスコープ外（Phase2は「← 戻る」「キャンセル」「閉じる」のような、能動的に戻る操作のみが対象）。保存後の遷移先の見直しは別要望として扱う。

## TDD必須
- `useSmartBack`フック自体の単体テスト（`location.key`が`'default'`のときフォールバック、それ以外のとき`navigate(-1)`が呼ばれること）
- 対象画面のうち主要なもの（ProjectDetail、CustomerDetail）で、履歴ありの状態で「← 戻る」を押すと`navigate(-1)`が呼ばれることを検証するテストを追加
- 既存テストが壊れないこと

## 受け入れ条件
1. 案件一覧でソート/検索/ページを変更→案件を開く→「← 戻る」を押すと、変更後の一覧状態（ソート・検索・ページ）が復元される
2. 得意先一覧・建具台帳一覧・請求書一覧でも同様の挙動になる
3. 直リンクや別タブから直接詳細画面を開いた場合（履歴が無い場合）は、従来通り一覧のトップに戻る（エラーにならない）
4. `npm run build`が通ること、既存の回帰スイートが壊れないこと
