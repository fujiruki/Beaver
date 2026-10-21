# R-0190: 摘要・明細の備考・品名・取付場所を255文字までにする

- 依頼: 2026-10-21 dodai-back（藤田晴樹さん了承。AccessTategu R-0195、migration 048）
- 状態: 仕様確定

## 背景

Beaverで作った見積E03988の明細の備考（48〜65文字）が、Accessの承認でAccessの`voucher_lines.memo`（TEXT(16)）に16文字で切り詰められた。Access側は4項目とも255文字に広げる。Beaver側には上限が無い（SQLiteのTEXT、画面・APIとも制限なし）ので、255文字の上限を付けてAccessで切れないようにする。

## 対象と上限

| 項目 | 列 | 上限 |
|---|---|---|
| 摘要 | `vouchers.description` | 255文字 |
| 明細の備考 | `voucher_lines.memo` | 255文字 |
| 品名（取付建具） | `voucher_lines.item_name` | 255文字 |
| 取付場所 | `voucher_lines.location_name` | 255文字 |

文字数は`mb_strlen`（UTF-8の文字数）で数える。

## 変更

- 画面: 伝票画面の4つの入力欄に`maxLength={255}`を付ける（超えて入力できない）
- API: 伝票と明細を保存するBeaverの経路（`POST/PUT /vouchers`、明細の追加・更新・一括保存など、4項目を受け取るすべての経路）と、Accessからの同期（`POST /vouchers/sync`・`POST /projects/{id}/vouchers/sync`）で、4項目のどれかが255文字を超えたら何も書かずに400 `{"error": "text_too_long", "field": "<列名>", "max": 255}`
- DBの列やmigrationは変えない（既存データの最大は備考65文字で、255を超えるものは無い）

## 反映

Beaver_betaまで進め、本番はAccessのmigration 048と一緒にdodai-backの合図で入れる。

## 受け入れ条件（テスト）

1. 4つの入力欄に`maxLength=255`が付いている
2. 255文字ちょうどは保存できる（4項目それぞれ、Beaverの保存経路と同期の両方）
3. 256文字なら400 `text_too_long`（`field`と`max`付き）、DBは変わらない
4. 日本語（全角）でも文字数で数える（255文字の全角は通る）
5. 既存のテストが通る
