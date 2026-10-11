# R-0171: 売値の内訳（本体・金物・ガラス）を同期で正しく送受信する

## 背景
画面の明細保存は売値の内訳を `voucher_line_prices`（MAIN / HARDWARE / GLASS ほか）にだけ書き、旧形式の列 `voucher_lines.price_body / price_hardware / price_glass` を更新しない。`GET /vouchers/sync` は旧形式の列だけを返すため、Beaver で入れた売値の内訳が Access に0で届く（E03981 で発見）。逆向き（Access → Beaver の `lines_mode=replace`）は旧形式の列だけを更新するので、内訳テーブルを持つ行では Access で直した売値が Beaver の画面に出ない。

## 仕様
1. **送る側（GET /vouchers/sync）**: 各明細の `price_body / price_hardware / price_glass` は、その行に `voucher_line_prices` が1件以上あれば MAIN / HARDWARE / GLASS の値（該当コードが無ければ0）を返す。1件も無ければ旧形式の列を返す（画面の表示 `fallbackPrices` と同じ考え方）。
2. **画面保存（明細の prices を保存するとき）**: `voucher_line_prices` を保存したら、旧形式の列 `price_body / price_hardware / price_glass` も MAIN / HARDWARE / GLASS の値で揃える（該当コードが無ければ0）。
3. **受け取る側（upsertSyncedLines の UPDATE 経路）**: 一致した既存行に `voucher_line_prices` が1件以上あれば、MAIN / HARDWARE / GLASS の3コードを受け取った値で上書きする（行が無いコードは値が0でなければ追加する）。それ以外のコードの行は触らない。内訳テーブルが無い行は従来どおり旧形式の列だけ（画面は `fallbackPrices` で表示される）。
4. 原価（cost_*、工場時間・現場時間・労務単価、`voucher_line_costs`）は今回は同期しない（晴樹さんの判断待ち）。
5. `line_total` と伝票合計の扱いは変えない。
6. updated_at の扱いは既存の同期経路と同じ（受け取り経路では進めない）。

## テスト
- 画面経由で prices（MAIN 35700, HARDWARE 2900）を保存した行が、/vouchers/sync で price_body 35700・price_hardware 2900・price_glass 0 になる。旧形式の列も揃う。
- 内訳テーブルが無い行は旧形式の列の値を返す。
- replace で price_body 等を受け取ると、内訳テーブルを持つ行の MAIN/HARDWARE/GLASS が更新され、他コードの行は残る。GET /vouchers/{id} の prices に反映される。
