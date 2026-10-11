# R-0174: 新しい明細行の労務単価の初期値を会社設定から取る

2026-10-12 藤田晴樹さん決定（dodai-back経由）。Access側の R-0174 とは別番号。

## 背景
新しい伝票の行・行の追加・挿入では `AppSettingsContext` の `defaultLaborRate` を初期値にしているが、この値はブラウザごとの localStorage（初期値0）にあり、晴樹さんのブラウザでは0だった。サーバーの `company_settings.default_labor_rate`（beta は 5000）は行の初期値に使われていない。

## 仕様
1. 新しい伝票の最初の行、行の追加、行の挿入で入れる労務単価の初期値は、サーバーの `company_settings.default_labor_rate`（GET /settings）から取る。Access の値とはそろえない。
2. 設定画面の「既定労務単価」は `company_settings.default_labor_rate` を表示・編集する（PUT /settings）。localStorage の `defaultLaborRate` は使わない。
3. 会社設定が読み込めていないときは 0（今と同じ）。
4. 既存の行の労務単価は変えない。建具台帳から選んだときは台帳の値（今と同じ）。
