# R-0108: 納期等の日付を期限接近度で強調表示

## 背景
R-0080フィードバック（id=21、2026-08-07 07:25、藤田晴樹より）原文:

> 納期とかの日付のプロパティについて、期限切れ、3日以内、一週間以内、ニ週間以内、1ヶ月以内　それ以外　とか区別しやすいような、条件付き強調してほしいと思っている。伝票日付とかは一ヶ月以内だけでも少し目立つと良いのかな。どんなプロパティをどんな強調方法にするのが良いかは議論して。フォント色とか背景色とか　見づらいのだけはなしにして。

実装前に指揮役から具体案を提示し、藤田晴樹さんに3点確認済み（2026-08-07）:
1. 強調方法: **文字色のみ・赤系グラデーション**（背景バッジやボーダー線ではなく、密な一覧表で視認性を保つため）
2. 適用範囲: **案件一覧の納期 + 伝票一覧の伝票日付（簡易版）** の両方を今回まとめて対応
3. 期限切れには**⚠アイコンも追加**

## 対象
- 新規: `frontend/src/lib/dateHighlight.ts`（強調ロジックの共通ユーティリティ、純粋関数）
- `frontend/src/pages/ProjectList.tsx`（納期列）
- `frontend/src/pages/VoucherList.tsx`（伝票日付列）

## 仕様

### 1. 共通ユーティリティ（`frontend/src/lib/dateHighlight.ts`）

#### 納期用（未来日付・期限の緊急度）
```ts
export type DeadlineTier = 'overdue' | 'within3d' | 'within1w' | 'within2w' | 'within1m' | 'normal';

export function getDeadlineTier(dateStr: string | null | undefined, now: Date): DeadlineTier
export function deadlineTierClassName(tier: DeadlineTier): string
export function deadlineTierIcon(tier: DeadlineTier): string  // 'overdue'のときのみ '⚠ '、それ以外は ''
```

- `dateStr`が`null`/`undefined`/空文字/パース不能な場合は`'normal'`を返す（強調なし、現状の「—」表示は変更しない）
- 日付は時刻を切り捨てた「日単位」で比較する（`now`もその日の0時に正規化してから差分日数を計算し、時刻要因で境界がブレないようにする）
- 差分日数`diffDays = 対象日 − 今日`（日数、対象日が今日より前ならマイナス）を使い、**先に判定した条件を優先する順序**で分類する:
  1. `diffDays < 0` → `overdue`（期限切れ）
  2. `diffDays <= 3` → `within3d`（3日以内、今日を含む）
  3. `diffDays <= 7` → `within1w`（1週間以内）
  4. `diffDays <= 14` → `within2w`（2週間以内）
  5. `diffDays <= 30` → `within1m`（1ヶ月以内）
  6. それ以外 → `normal`
- `deadlineTierClassName`が返すTailwindクラス（既存コードのTailwindユーティリティクラス利用パターンに合わせる）:
  - `overdue`: `'text-red-700 font-bold'`
  - `within3d`: `'text-orange-600 font-semibold'`
  - `within1w`: `'text-amber-600'`
  - `within2w`: `'text-yellow-700'`
  - `within1m`: `'text-slate-600 font-medium'`
  - `normal`: `''`（現状のまま、特別なクラスなし）
- `deadlineTierIcon('overdue')`は`'⚠ '`（末尾に半角スペース、日付テキストの前に表示するため）、それ以外の tier は`''`

#### 伝票日付用（過去日付・直近性、簡易版）
```ts
export function isRecentVoucherDate(dateStr: string | null | undefined, now: Date): boolean
```
- 対象日が「今日以前」かつ「今日から30日以内」なら`true`（直近1ヶ月以内に発行された伝票）
- `dateStr`が無効/未設定なら`false`
- 未来日付（あり得ないはずだが防御的に）は`false`

### 2. `ProjectList.tsx`（納期列）
納期列の`render`を、`getDeadlineTier`の結果に応じたクラス名・アイコンを適用する形に変更する:
```tsx
{
  key: 'delivery_date',
  label: '納期',
  sortable: true,
  render: p => {
    const tier = getDeadlineTier(p.delivery_date, new Date());
    return (
      <span className={deadlineTierClassName(tier)}>
        {deadlineTierIcon(tier)}{p.delivery_date ?? '—'}
      </span>
    );
  },
},
```
（既存の`render: p => p.delivery_date ?? '—'`を置き換える。列自体の`align`等の既存プロパティは変更しない）

### 3. `VoucherList.tsx`（伝票日付列）
伝票日付列（列キー名は実装時にVoucherList.tsxの既存列定義を確認して特定する。おそらく`voucher_date`または類似のキー）の`render`に、`isRecentVoucherDate`が`true`のときだけ`text-blue-600 font-medium`クラスを適用する（納期の「緊急度＝赤系」とは意味が異なる「直近性＝青系」の配色にすることで、誤って"危険"と誤解されないようにする）。

## TDD必須
`frontend/src/lib/__tests__/dateHighlight.test.ts`（新規）に以下を検証するテストを追加する:
- `getDeadlineTier`: 各境界値（ちょうど期限日=diffDays 0、3日後、4日後、7日後、8日後、14日後、15日後、30日後、31日後、過去日=期限切れ）で正しいtierが返ること
- `getDeadlineTier`: `null`/`undefined`/空文字/不正な文字列で`'normal'`が返ること
- `deadlineTierClassName`/`deadlineTierIcon`: 各tierで期待するクラス名・アイコンが返ること
- `isRecentVoucherDate`: 30日前・31日前・当日・未来日・無効値の境界値テスト

`ProjectList.tsx`/`VoucherList.tsx`の既存テストが壊れないこと（既存の`render`関数の出力形式が変わる＝文字列から`<span>`要素に変わるため、既存テストがテキスト内容で検証している場合は引き続き通ることを確認する。DOM構造への依存が強いテストがあれば、必要最小限の調整を許容する）。

## 受け入れ条件
1. 案件一覧の納期列が、期限切れ（⚠付き濃い赤・太字）→3日以内（赤橙）→1週間以内（橙）→2週間以内（黄褐色）→1ヶ月以内（わずかに強調）→それ以外（通常）の順で視覚的に区別できる
2. 伝票一覧の伝票日付列で、直近1ヶ月以内の伝票が青系の文字色でわずかに強調される
3. 既存のソート・列幅・その他の一覧機能に影響がない
4. 既存テスト・回帰スイートが通る
