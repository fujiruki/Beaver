# R-0240 値引きの行を利益から引く

対象: `frontend/src/lib/voucherCalc.ts` の `calcProfitSummary`・`calcProfitSummaryDynamic`（使う側: `components/voucher/TotalSummary.tsx`、`lib/voucherMarkdown.ts`）

## 今の計算
- 伝票の合計（`calcVoucherTotal`）は値引きの行の `line_total` を差し引いている。
- 利益のまとめ（`calcProfitSummary*`）は通常の行だけで計算し、値引きを引いていない。利益率の分母は値引き後の税抜合計なので、分子と分母が食い違う（R-0230 見本: 売上 370,000、利益 103,500、利益率 28.0%）。

## 決まり
1. 値引きの額＝値引きの行の `line_total` の合計（`calcVoucherTotal` と同じ向き・同じ数え方）。
2. **利益（grossProfit）** と **粗利（grossMargin）** の両方から、値引きの額を引く。
3. 利益率・粗利率・時間あたり粗利・日割り粗利は、引いたあとの値から今の式で出す（分母はそのまま）。
4. 行ごとの利益（明細の各行の利益、`calcLineProfitSummary`）は変えない。値引きは伝票全体の値引きとして扱う。
5. 小計の行は、今どおり計算に入れない。
6. サーバー（PHP）は利益を計算していないので変えない。

## 受け入れ条件
- 通常の行 2 行（売値 230,000・原価 158,500／売値 160,000・原価 128,000）と値引き 20,000 の伝票（税抜）で、利益 83,500、利益率 83,500 ÷ 370,000。
- 値引きの行が無い伝票は、今と同じ値。
- 「AI宛にコピー」の Markdown の利益も、同じ値になる。
