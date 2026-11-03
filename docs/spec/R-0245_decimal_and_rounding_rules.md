# R-0245 小数の時間・数量の扱いと円の丸め方（Beaver と Access の共通の決まり）

dodai-back と合わせた（Access 側の根拠: qry伝票サブ.sql:27-34、qry売上別利益計算.sql:4-9、Dodaikun_VoucherOps.bas:585、共通.bas:175-218）。Access・Beaver のお金と集計の流れ全体は、dodai-back が Codex にレビューを頼んでいる。結果で決まりが変われば、この仕様を直す。

## 決まり
| 何 | 持ち方 | 丸め |
|---|---|---|
| 工場時間・現場時間・数量 | 小数のまま持つ（Beaver は REAL、Access は時間 CURRENCY 小数4桁・数量 DOUBLE）。入力は小数第2位までを目安 | 丸めない。同期も受けたまま |
| 明細の売値（line_total＝数量×売値の単価の合計） | 円 | **円未満を切り捨て**（Access の Hasuu(…,1)。数量端数計算＝切り捨て） |
| 消費税 | 円 | 切り捨て（今のまま。Beaver `calcVoucherTotal` の Math.floor） |
| 労務費・材料費・製造原価・粗利・利益・日割り粗利 | 小数のまま | 行でも伝票の合計でも丸めない。画面と帳票に出すときだけ円に四捨五入（Beaver Math.round、Access ¥#,##0） |
| 時間の表示 | — | Beaver は小数第2位まで、Access は小数第1位まで表示（値は丸めない） |

## Beaver で直すこと
- `frontend/src/components/voucher/LineItemRow.tsx` 110 行の `setValue(lines.N.line_total, unitPrice * quantity)` を、円未満切り捨てにする。浮動小数点の誤差で 1 円下がらないよう、切り捨ての前に小数第6位で丸める（例 100 × 0.29 ＝ 28.999999999999996 → 29）。
- 値引きの行の金額（手で入れる）と、原価から売値を出す計算（`calcPriceFromProfit` の切り上げ）は変えない。

## 受け入れ条件
- 単価 1,000・数量 1.5 → 1,500。単価 333・数量 1.5 → 499（499.5 を切り捨て）。単価 100・数量 0.29 → 29。
- 整数の数量では今と同じ値。
