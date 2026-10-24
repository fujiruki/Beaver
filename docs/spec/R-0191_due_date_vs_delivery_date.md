# R-0191: 伝票の「納期」と「納品日」を分ける

- 依頼: 2026-10-24 藤田晴樹さんの決定（dodai-back経由。AccessTategu R-0203、ADR-007、docs/spec/07_用語集.md）
- 状態: 仕様確定（既存データ1件の扱いのみ晴樹さんに確認中）

## 言葉（晴樹さんの定義）

- 納期: お客様から指定された、またはこちらが指定した、この日までに納品する日
- 納品日: 実際に納品した日、または納品予定日

## 今の問題

伝票画面の見出し「納期」は`vouchers.delivery_date`を入力している。この列は同期でAccessの納品日になり、Accessは納品日を売上の消費税率の基準日・請求日の計算・売上日とずれたときの赤表示に使っている。

## 変更

1. `vouchers`に納期の列`due_date`（DATE、NULL可）を足す（migration）
2. 伝票画面: 見出し「納期」の入力欄は`due_date`。`delivery_date`は見出しを「納品日」にして別の入力欄で出す（見積・売上とも）
3. `GET/POST/PUT /vouchers`で`due_date`を読み書きする。自動保存・楽観ロックは他の見出し項目と同じ扱い
4. 同期（`/vouchers/sync`の送受信）では`due_date`を送らず受け取らない（Accessで納期を持つかは別途決める）
5. 案件（projects）の「納期」（projects.delivery_date）・「納品日」（projects.end_date）は変えない
6. 既存データは変えない。Beaverで作った伝票で`delivery_date`が入っているのはE02046（2026-12-31）の1件だけで、`due_date`へ移すかは晴樹さんの返事を待つ（データ修正は別作業）

## 受け入れ条件（テスト）

1. 伝票画面に「納期」と「納品日」の2つの入力欄がある
2. 「納期」に入れて保存すると`due_date`が保存され、`delivery_date`は変わらない
3. 「納品日」に入れて保存すると`delivery_date`が保存される
4. `GET /vouchers/{id}`が`due_date`を返す
5. 同期の受信（`POST /vouchers/sync`）で`due_date`を送っても無視され、`GET /vouchers/sync`の応答に`due_date`は含まれない
