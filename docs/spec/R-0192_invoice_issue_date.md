# R-0192: 請求書の発行日を Access の売掛発行日にする

- 依頼: 2026-10-24 藤田晴樹さんの決定（dodai-back経由。AccessTategu R-0204）
- 状態: 仕様確定

## 背景

`invoices.invoice_date`には、`POST /invoices/sync`で新しく作るときにBeaverが受け取った日（`date('Y-m-d')`）が入る。晴樹さんの定義では「請求書を発行した日」＝Accessの`tbl売掛.売掛発行日`。

## 変更

- `POST /invoices/sync`の本文に省略可能な`invoice_date`（`YYYY-MM-DD`、Accessの売掛発行日）を足す
- あれば新規作成でも既存の更新でも`invoice_date`に入れる。無ければ今までどおり（新規は受け取った日、更新は変えない）
- 形式が不正なら何も書かずに400 `{"error": "Invalid invoice_date format"}`
- Access側から送る変更はAccessTategu側で行う

## 受け入れ条件（テスト）

1. `invoice_date`付きの新規 → その日付で保存
2. `invoice_date`なしの新規 → 受け取った日
3. 既存の更新で`invoice_date`付き → 書き換わる、なし → 変わらない
4. 形式不正 → 400、DBは変わらない
