# R-0159: GET /projects/sync の updated_at をJSTで返す

- 報告: 2026-10-10 dodai-back（AccessTategu側backpc指揮役。Access側の番号はR-0162、晴樹さん了承済みと伝達）
- 状態: 仕様確定（不具合修正）

## 症状と原因

Accessで「Beaverと同期」を押すたびに、案件pullで同じ案件（Beaver_betaのid 2・8）が「更新」として返ってくる。

`api/routes/projects.php`の`GET /projects/sync`は、`updated_after`をJSTとして受け取りUTCに変換して比べる。一方、応答では`deleted_at`と`next_cursor_at`だけを`utcToJst`でJSTにし、各行の`updated_at`はUTCのまま返している。Accessは返ってきた`updated_at`（UTC）を次回の`updated_after`（JSTとして解釈される）に使うため、境界が9時間前にずれる。

## 修正

- 応答の各行の`updated_at`を`utcToJst`でJSTに変換して返す（`GET /vouchers/sync`・`GET /customers/sync`と同じ）
- `updated_after`の解釈、`deleted_at`・`next_cursor_at`の変換、並び順・ページングは変えない

## 受け入れ条件（テスト）

1. 応答の各行の`updated_at`がJST（DBのUTC値＋9時間）で返る
2. 応答の`updated_at`をそのまま`updated_after`に渡して再度呼ぶと、その行は返らない（境界のずれがない）
3. `deleted_at`・`next_cursor_at`は今と同じくJSTで返る
4. 既存のprojects/syncのテストが通る
