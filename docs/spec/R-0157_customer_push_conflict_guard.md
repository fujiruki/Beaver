# R-0157: Accessからの得意先pushがBeaver側の修正を黙って上書きしないようにする

- 発見: 2026-10-09 dodai-back（AccessTategu側backpc指揮役）の得意先パターン調査
- 方針の了承: 2026-10-09 藤田晴樹さん（dodai-backが直接確認）
- 状態: 仕様確定（2026-10-09 藤田晴樹さん「susumete」）

## 背景

同じ得意先をAccessとBeaverの両方で修正すると、Accessの「Beaverと同期」はpushが先に走る。`POST /customers`（`api/routes/customers.php:301-349`）は`access_customer_no`（見つからなければ`code`）が一致する既存行を、Beaver側の`updated_at`を確かめずに無条件でUPDATEする。Beaver側の修正は黙って消え、競合も出ない。

## Beaver API（POST /customers）の変更

リクエストに省略可能な項目を2つ追加する。

| 項目 | 形式 | 意味 |
|---|---|---|
| `base_synced_at` | JSTの`YYYY-MM-DD HH:MM:SS` | Access側の`tbl得意先M.last_synced_at`（最後にBeaverと同期した時刻） |
| `force` | boolean（既定false） | trueなら競合判定をせず上書きする |

判定:

1. `access_customer_no`（またはcodeのフォールバック）で既存の得意先が見つかり、`base_synced_at`があり、`force`がtrueでなく、`customers.updated_at > base_synced_at` のとき、書き込まずに409を返す
2. 比較はUTCで行う。`base_synced_at`はJSTとして受け取り、UTCに変換する（`GET /customers/sync`の`updated_after`と同じ処理）。秒単位で比べ、同じ時刻は競合にしない
3. `base_synced_at`の形式が不正なら400（`updated_after`と同じ厳密チェック）
4. `base_synced_at`が無い場合（新規、古いクライアント）は今と同じ無条件upsert（後方互換）
5. `force=true`のときは今と同じ上書き。応答も今と同じ（`updated_at`・`last_synced_at`をJSTで返す）

409の本文:

```json
{"error": "customer_conflict", "customer": { /* GET /customers/sync の1件と同じ形。updated_at・last_synced_atはJST */ }}
```

既存の409（新規INSERTのUNIQUE違反、`{"error":"<列名> が既に存在します","column":...}`）は変えない。Accessは`error`が`customer_conflict`かどうかで区別する。

## 偽の409を防ぐための変更

- 繰越残高の編集（`PATCH /customers/{id}/carry-forward`、`api/routes/customers.php:60-64`）は、`updated_at`を進めないようにする。`carry_forward_balance`はAccessと同期する項目ではないため、繰越だけを直したときに次のAccess pushが409にならないようにする。画面では得意先の`updated_at`を表示していない（2026-10-09確認）
- 得意先のaccess-link（`api/routes/customers.php:100-116`）は今のまま（`updated_at`と`last_synced_at`に同じ時刻を入れる）。Accessが応答の時刻を`last_synced_at`に保存する前提

## Access側（dodai-backが実装、参考）

- `customer_upsert`のpayloadに`base_synced_at`を載せる（`last_synced_at`がNULLなら載せない）
- 409・`customer_conflict`を受けたら、キューの再送対象から外し、`tbl競合待ち`に「種別conflict／伝票種別 得意先」として積む。競合解決画面で「Access版を採用」なら`force=true`で送り直し、「Beaver版を採用」なら今の採用処理で取り込む
- 有効にする前に、横断整合検査で「Accessの`last_synced_at`がBeaverの`updated_at`より古い得意先」が0件であることを確かめる

## 対象外

- 伝票のpush（`POST /vouchers/sync`）にも同じ上書きの問題がある。別の要望R-0158として扱う

## 受け入れ条件（テスト）

1. 既存の得意先で`updated_at > base_synced_at`、`force`なし → 409、`error=customer_conflict`、`customer`にBeaverの現在値（JST）、DBは変わらない
2. `updated_at == base_synced_at` → 上書きされ200
3. `updated_at < base_synced_at` → 上書きされ200
4. `base_synced_at`なし → 今と同じく上書き200
5. `force=true`（`updated_at`が新しくても）→ 上書き200
6. `base_synced_at`の形式不正 → 400、DBは変わらない
7. `access_customer_no`で見つからず`code`のフォールバックで見つかった既存行にも、同じ判定が効く
8. 新規作成（既存行なし）は`base_synced_at`があっても201（今と同じ）
9. 既存のUNIQUE違反の409は本文・状態コードとも変わらない
10. `PATCH /customers/{id}/carry-forward`で`updated_at`が変わらない（`carry_forward_balance`は更新される）
11. JSTとUTCの変換: `base_synced_at`がJSTで`updated_at`（UTC）と同じ瞬間を指すとき、競合にならない
