# R-0158: Accessからの伝票pushがBeaver側の修正を黙って上書きしないようにする

- 発見: 2026-10-09 R-0157（得意先）の確認中に指揮役が発見
- API案: 2026-10-10 dodai-back（AccessTategu側backpc指揮役）と合意。晴樹さんの了承と、void済み伝票の扱いの判断はdodai-backが直接確認して伝達
- 状態: 仕様確定

## 背景

Accessの伝票push（`POST /vouchers/sync`、`POST /projects/{id}/vouchers/sync`。どちらも`syncVoucherUpsert`、1リクエスト1伝票）は、`INSERT … ON CONFLICT(access_voucher_id) DO UPDATE`でBeaverの`updated_at`を確かめずにヘッダーと明細を上書きする。Beaverで直した内容が黙って消える。

## 変更（R-0157と同じ方式）

リクエストに省略可能な項目を2つ追加する。

| 項目 | 形式 | 意味 |
|---|---|---|
| `base_synced_at` | JSTの`YYYY-MM-DD HH:MM:SS` | Access側の`vouchers.last_synced_at` |
| `force` | JSONの`true`のみ有効（既定false） | trueなら競合判定をせずAccess版で置き換える |

判定:

1. `base_synced_at`が空でなく形式不正なら400（既存行を探す前に検査、R-0157と同じ）
2. `access_voucher_id`で既存の伝票が見つかり、`base_synced_at`があり、`force`がtrueでなく、`vouchers.updated_at > base_synced_at`（UTCにそろえて秒単位）なら、何も書かずに409:

```json
{"error": "voucher_conflict", "voucher": { /* GET /vouchers/sync の1件と同じ形。updated_at・last_synced_atはJST */, "void_reason": "（status=voidのとき、record_historyの最新のvoid理由。無ければnull）" }}
```

3. それ以外（新規、`base_synced_at`なし、`force=true`、`updated_at <= base`）は今と同じ処理と応答
4. `base_synced_at`なしの既存伝票は、A-X-02までは従来どおり上書きを許す。A-X-02後に400へ切り替えるのは別作業（dodai-backの合図で行う）

## Beaverで取消（void）済みの伝票

藤田晴樹さんの判断（2026-10-10、dodai-back経由）: 競合解決画面の「Access版を採用」で取消を戻せる。R-0154の「取消は戻せない（一方通行）」より優先する。

- forceなしのpushは、voidで`updated_at`が進んでいるので通常どおり409 `voucher_conflict`（`voucher.status`は`void`、`void_reason`付き）
- `force=true`で、既存の伝票が`void`、送られてきた`status`が`void`以外なら、Access版で置き換えて取消を解除する。そのとき`record_history`に`entity=vouchers`、`action=unvoid`で、解除前後の伝票と理由「Accessの競合解決で『Access版を採用』（force）により取消を解除」を記録する
- 送られてきた`status`も`void`なら、今と同じ処理（履歴は残さない）

## 追加（2026-10-10、dodai-backとの確認で決定）

- 既存の伝票が`void`で、送られてきた`status`が`void`以外のときは、`force`の有無にかかわらず取消を解除し、`record_history`に`action=unvoid`を残す（forceなしの通常のpushで、`updated_at <= base_synced_at`のため競合にならずに取消が戻る場合も含む）。理由の文言は、forceありは「Accessの競合解決で『Access版を採用』（force）により取消を解除」、forceなしは「Accessからの同期で取消を解除」
- きっかけ: B5の確認中、force以外の経路で取消が戻ると履歴が残らないと分かった。dodai-backの判断「取消を戻したことが記録に残らない経路は、無いほうが安全」

追加の受け入れ条件:

13. void済みの伝票に、forceなし・`base_synced_at`が`updated_at`以上（競合にならない）で`status=draft`のpush → 取消が解除され、`record_history`に`action=unvoid`（理由「Accessからの同期で取消を解除」）が1件残る
14. void済みの伝票に、`base_synced_at`なしで`status=draft`のpush → 同じく`unvoid`が1件残る

## 対象外

- `syncVoucherUpdate`（PUT経路）: Accessは使っていない（dodai-back確認、Access側はPOSTに統一）
- `PUT /vouchers/{vno}/shipped`（出荷フラグ）

## 受け入れ条件（テスト）

1. 既存伝票で`updated_at > base_synced_at`、forceなし → 409 `voucher_conflict`、`voucher`にBeaverの現在値（JST）、ヘッダーも明細も変わらない
2. `updated_at == base_synced_at` → 上書きされ200
3. `updated_at < base_synced_at` → 上書きされ200
4. `base_synced_at`なし → 今と同じく上書き200
5. `force=true`（`updated_at`が新しくても）→ ヘッダー・明細ともAccess版で置き換えられ200
6. `base_synced_at`の形式不正 → 400、DBは変わらない
7. 新規伝票（`access_voucher_id`が未登録）は`base_synced_at`があっても今と同じく作成
8. Beaverでvoid（理由付きの履歴あり）の伝票にforceなしでpush → 409、`voucher.status=void`、`void_reason`に理由
9. void済みの伝票に`force=true`で`status=draft`のpush → 取消が解除されAccess版になる、`record_history`に`action=unvoid`が1件残る
10. void済みの伝票に`force=true`で`status=void`のpush → 200、`unvoid`の履歴は残らない
11. `POST /projects/{id}/vouchers/sync`経路でも1と5が同じように動く
12. 既存の伝票同期テスト（R-0151の明細置き換え・access_line_idなど）が通る
