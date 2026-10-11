# R-0173: 明細の取付場所・原価・時間・労務単価を Access と双方向で同期する

2026-10-11 藤田晴樹さん決定（dodai-back経由）。Access側は R-0174（予定）。R-0171（売値の内訳）と同じ考え方で原価側を揃える。

## キー名と対応（/vouchers/sync の明細、lines_mode=replace の明細で共通）

| キー | Beaver の保存先 | 内訳コード（voucher_line_costs.category_code） |
|:--|:--|:--|
| location_name | voucher_lines.location_name | — |
| cost_body | 内訳 MAIN／旧列 cost_body | MAIN（money） |
| cost_hardware | 内訳 HARDWARE／旧列 cost_hardware | HARDWARE（money） |
| cost_glass | 内訳 GLASS／旧列 cost_glass | GLASS（money） |
| cost_factory_hours | 内訳 FACTORY_TIME／旧列 cost_factory_hours | FACTORY_TIME（time） |
| cost_site_hours | 内訳 SITE_TIME／旧列 cost_site_hours | SITE_TIME（time） |
| cost_labor_rate | voucher_lines.cost_labor_rate（列のみ。内訳テーブルには入れない） | — |

## 仕様
1. **送る側（GET /vouchers/sync）**: 上の7キーを明細に足す。原価5キーは、その行に `voucher_line_costs` が1件以上あれば該当コードの値（無ければ0）、1件も無ければ旧列の値を返す。location_name と cost_labor_rate は列の値（location_name は NULL 可）。
2. **画面保存（明細の costs を保存するとき）**: `voucher_line_costs` を保存したら、旧列 cost_body / cost_hardware / cost_glass / cost_factory_hours / cost_site_hours も該当コードの値で揃える（該当コードが無ければ0）。空の costs のときは旧列を変えない（R-0171 の prices と同じ）。
3. **受け取る側（upsertSyncedLines、lines_mode=replace）**:
   - **キーが payload に無いときは、その項目を変えない**（古い Access からの push で原価が消えないように）。
   - UPDATE 経路: キーがある項目だけ旧列を更新する。原価5キーは、行に `voucher_line_costs` が1件以上あれば該当コードの行を受け取った値で上書きし、行が無いコードは値が0でなければ追加する（category_name・measure_type・sort_order は aggregation_category_master に合わせる）。他コードの行は触らない。
   - INSERT 経路（新規行）: キーがある項目を旧列に入れる（無いキーは既定値）。内訳テーブルは作らない（画面は旧列から表示される）。
4. price_* の「キーが無ければ0」は今回変えない（R-0151/R-0171 の既存動作）。
5. line_total・伝票合計・updated_at の扱いは既存の同期経路と同じ。

## テスト
- 画面経由で costs（MAIN/HARDWARE/GLASS/FACTORY_TIME/SITE_TIME）と cost_labor_rate、location_name を保存した行が、/vouchers/sync で7キーとも正しく返る。旧列も揃う。
- 内訳テーブルが無い行は旧列の値を返す。
- replace で7キーを受け取ると、内訳を持つ行の該当コードと旧列が更新され、他コードは残る。
- replace でキーが無いときは、原価・時間・労務単価・取付場所が変わらない。

## 改訂（2026-10-11 藤田晴樹さん判断）
画面から空の costs を保存したとき（内訳を全部消したとき）は、旧列も0にする。内訳0件の行は旧列で表示されるため、旧列を残すと消したはずの値が画面に戻り、Access にも送られてしまうため。
