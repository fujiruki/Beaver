# R-0238 伝票の明細の上下移動を保存し、行の順番を Access と両方向で同期する

## 確かめた原因
- `voucher_lines` に `UNIQUE(voucher_id, line_no)` がある。
- 画面の▲▼（`handleMoveUp`/`handleMoveDown`）は、動かした2行の `line_no` を `PUT /vouchers/{id}/lines/{lineId}` で1行ずつ書き換える。1行目を書いた時点で番号が重なり、制約で失敗する。画面の並びは変わって見えるが、開き直すと元に戻る。
- 未公開の R-0235（行を挿入、d43a1df）も、行を作ったあと番号を1行ずつ書き換えるので同じく失敗する。R-0235 はこの直しが入るまで本番に入れない。
- Access → Beaver の取り込み（`sync_helpers.php` 840 行付近）は、番号をいったん負の値へ逃がしてから入れ直しており、順番の入れ替えは受けられる。

## 決まり
1. **並べ替えの窓口を足す**：`PUT /vouchers/{id}/line-order`、本文 `{ line_ids: [行IDを上から順に], expected_updated_at }`。伝票の書き込み（`beginVoucherWrite`・`assertVoucherEditable`）を通し、1つのトランザクションで、全行の `line_no` をいったん負の値にしてから 1 から振り直す。`line_ids` がその伝票の行と過不足なく一致しなければ 400。
2. 番号が変わった行は `updated_at` を進め、`edited_in_beaver = 1` を立てる（ほかの欄を直したときと同じ。Access がこの行を上書きせず、Beaver の変更として受け取るため）。
3. **画面**：▲▼ と「行を挿入」（R-0235）は、並べ替えたあと、この窓口に全行の順番を1回だけ送る。1行ずつの `line_no` の PUT はやめる。行を挿入は、行を作る POST のあとにこの窓口を呼ぶ。
4. **Beaver → Access**：伝票の同期の返り値には、すでに各行の `line_no` と `updated_at` が入っている。Access がそれで行の順番を取り込むかは dodai-back が確かめ、足りなければ Access 側で直す。
5. **Access → Beaver**：今の取り込みで順番が入れ替わることを、テストで確かめる。

## 受け入れ条件
- 3行の伝票で2行目を▲ → `line-order` が `[2行目, 1行目, 3行目]` で1回呼ばれ、DB の `line_no` が 1・2・3 で入れ替わる（PHP のテストで、UNIQUE 制約のある本物の SQLite に対して確かめる）。
- 行を挿入 → POST のあと `line-order` が1回呼ばれ、新しい行が選んだ行の上に保存される。
- `line_ids` が足りない・ほかの伝票の行を含む → 400、DB は変わらない。
- 読み取り専用・Access で請求済みの伝票では、今の書き込みと同じく断る。
- 並べ替えた行は同期の返り値で `line_no` と `updated_at` が新しくなっている。
- Access からの取り込みで、2行の `line_no` を入れ替えた伝票が、そのとおりに並ぶ。

## 追記（2026-11-02、dodai-back の同期項目の棚卸し AccessTategu 65f385f より）

- 伝票の同期の返り値の明細（`sync_helpers.php` 128〜133 行の SELECT）に `line_type` が無い。Access は送っているが、Beaver で作った値引の行を Access が取り込むと「通常」になり、合計が値引額の2倍ずれる。
- 返り値の明細に `l.line_type` を足す。受け取りは今のまま。
- 受け入れ条件: 値引の行を持つ伝票の同期の返り値で、その行の `line_type` が `discount`。
- Access の▲▼は送信のキューに積んでおらず、並べ替えだけでは Beaver に届かない（Access 側で直す）。行の順番だけが違う伝票も、Access では承認画面を通る。
