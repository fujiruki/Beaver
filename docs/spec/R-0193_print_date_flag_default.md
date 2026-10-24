# R-0193: 日付印字の既定を「印字する」（print_date_flag=0）にする

- 依頼: 2026-10-24 藤田晴樹さんの決定（dodai-back経由。AccessTategu R-0201）
- 状態: 仕様確定

## 背景

Accessは`print_date_flag=True`で「日付を印字しない」（DBの意味は変えない）。Beaverの既定は1なので、Beaverで作った伝票はAccessで「印字しない」になってしまう。Beaverの画面には入力欄も表示も無く、Beaverの印刷でも使っていない。

## 変更

- `POST /vouchers`で`print_date_flag`の指定が無いときの既定を1から0にする（`vouchers.php`）
- 同期で新しく作るときの既定（`COALESCE(:print_date_flag, 1)`、`sync_helpers.php`）も0にする
- DBの列のDEFAULT 1はそのまま（SQLiteでは表の作り直しが要る。アプリが必ず値を入れるので効かない）
- 伝票の複製は元の値を引き継ぐ（今のまま）
- 画面に出すのは今回はしない。出すときは「日付を印字する」チェック＝`print_date_flag`が0、で揃える
- 過去データは書き換えない（晴樹さん指示）。ただし、Beaverで作ったここ2か月の伝票を0にするデータ修正は、晴樹さんのOKの後に別作業で行う

## 受け入れ条件（テスト）

1. `print_date_flag`なしの`POST /vouchers` → 0
2. `print_date_flag: 1`を指定した`POST /vouchers` → 1
3. 同期の新規作成で`print_date_flag`なし → 0、指定あり → その値
4. 既存の伝票の同期更新で`print_date_flag`なし → 変わらない
