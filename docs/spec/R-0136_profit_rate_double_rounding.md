# R-0136: 「原価から売値を設定」ボタンの計算が合っていない（二重丸め）

## 背景

本番フィードバック（/readyoubou、2026-09-01、id=42、伝票新規作成画面）:

> 「原価から売値を設定するボタンの計算があってない。仕様書に詳細があるんじゃないかな？　労務単価＊（工場時間＋現場時間）が製造原価の内の労務費である、そして、売値の本体には、（原価の本体＋原価の労務費）に利益率分のせた金額が設定されるべきなんだ　catalog_systemでもそのように計算している。」

## 原因（指揮役が調査済み）

`frontend/src/components/voucher/ProfitRateBar.tsx`の`applyProfitRate()`（動的モード、`costs.length > 0`の分岐）で、money型区分（本体=MAIN等）の原価分の売値と、time型区分（工場時間・現場時間）から算出した労務費分の売値を、**それぞれ独立に`roundToHundred()`で百円丸めしてから合算**している。

```ts
// money型原価 → 利益率で売値計算
const sellVal = roundToHundred(profitRate >= 1 ? costVal : Math.ceil(costVal / (1 - profitRate)));
newPrices.push({ ..., value: sellVal, ... });

// time型原価 → 労務費を merge_into_price_code の区分に加算
const laborAmt = hours * laborRate;
const laborSell = roundToHundred(profitRate >= 1 ? laborAmt : Math.ceil(laborAmt / (1 - profitRate)));
// mergeCode（本体）へ既存値に加算: existing.value += laborSell;
```

原文の意図（本体の売値＝（原価の本体＋原価の労務費）に利益率をのせて丸める）通りなら、**合算してから一度だけ丸める**必要がある。現行実装は個別に丸めてから足すため結果がずれる。

例（利益率30%、本体原価1230円・労務費340円）:
- 期待値: `roundToHundred(Math.ceil((1230+340) / 0.7))` = `roundToHundred(2243)` = **2200円**
- 現行実装: `roundToHundred(Math.ceil(1230/0.7))` (1800円) + `roundToHundred(Math.ceil(340/0.7))` (500円) = **2300円**

## 対応方針（藤田晴樹さん承認済み・2026-09-01）

mergeCode（本体）へ労務費をmergeする対象の区分は、**税抜原価の合計（money型原価＋労務費）を先に合算してから、利益率をのせて一度だけ丸める**よう修正する。労務費がmergeされないmoney型区分（本体以外のhardware/glass等、labor未加算）は現状通り個別に丸めたままでよい（合算対象がないため今回の不具合は生じない）。

具体的には、money型区分ごとに「原価」と「その区分にmergeされる労務費合計」を先に集計してから、区分単位で`sellVal = roundToHundred(ceil((原価 + merge労務費) / (1-利益率)))`を1回だけ計算する形へ変更する（`existing.value += laborSell`のような丸め後加算をやめる）。

## TDD必須

`frontend/src/components/voucher/__tests__/`（またはvoucherCalc.tsのテストファイル）に、本体原価とmergeされる労務費がある場合の売値計算が「合算後に1回だけ丸める」結果になることを検証するテストを追加する。上記の具体例（本体原価1230円・労務費340円・利益率30%→2200円）を含める。既存のroundToHundred単体テストは変更しない。

## 受け入れ条件

1. money型原価とmergeされた労務費がある区分で、売値が「合算後に1回だけ丸める」計算結果になる
2. 労務費がmergeされないmoney型区分（本体以外）の計算結果は変わらない
3. `line_total`（quantity倍後の合計）も新しい売値を元に正しく計算される
4. 既存テスト・回帰スイートが通る
