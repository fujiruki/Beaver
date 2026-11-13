# R-0268: 製品台帳の木材原価（部位と明細）／Access と同じ表で同期／TateDS とリンク

- 状態: 仕様化済み（Access と合意。TateDS への依頼は未送付）
- 設計判断: `docs/adr/ADR-0001-木材原価をAccessと同じ表で同期する.md`
- 調査: `docs/wiki/knowledge/R-0268_access_wood_cost_survey.md`、`docs/wiki/knowledge/R-0268_design_studio_material_list.md`
- R-0200 の「木材設定・木材明細は Access だけ」「wood_calc の行は Beaver で直せない」を置き換える

## 晴樹さんの決定（2026-11-13）

- 木材の表は Access と Beaver でほぼ同じ形にし、両方向で同期する。建具データ（TateDS）も同期する
- 「反映」ボタンはなくし、入力したら自動で原価に入れる
- 立米単価は部位ごとに1つ。TateDS で樹種が混ざる建具は、樹種ごとに部位を分ける（框まわり＝ひのき、腰板＝杉）。ガラスは木材に入れない
- Access にも「TateDS で開く」を作る

## 表（Access と1対1）

### wood_species ⇔ tbl木材樹種M

| Beaver | Access | 備考 |
|:--|:--|:--|
| id / access_id | ID | |
| name | 樹種名 | |
| unit_price_man | 立米単価万円 | 単位は万円のまま（Access と同じ） |
| disabled | 使用不可 | |
| sort_order | 表示順 | |
| tateds_species_key | （足す） | TateDS の樹種（hinoki / sugi など）との対応。空なら対応なし |

### tategu_wood_sets ⇔ tbl建具台帳_木材設定（部位）

| Beaver | Access | 備考 |
|:--|:--|:--|
| id / access_id | ID | |
| tategu_item_id | 建具№ | |
| part_name | 部位名 | |
| species_id | 樹種名→（足す）樹種ID | Access は名前の写し。ID を足して名前は表示用に残す |
| unit_price_man | 立米単価万円 | 樹種の単価から入り、手で変えられる |
| length_allowance_mm | （足す） | 既定 100。今の固定値 |
| sort_order | （足す） | |
| tateds_design_id | （足す） | TateDS の建具 ID（UUID） |
| tateds_revision | （足す） | TateDS の版（更新日時） |
| tateds_design_json | （足す、長いテキスト） | 建具データの控え。TateDS で開くときに渡す |
| tateds_imported_lines | （足す、長いテキスト） | 取り込んだときの明細の控え。今の明細と違えば「手で直した」印を出す |

### tategu_wood_lines ⇔ tbl建具台帳_木材明細（明細）

| Beaver | Access | 備考 |
|:--|:--|:--|
| id / access_id | ID | |
| wood_set_id | 木材設定ID | Access には設定ID空の行が21行ある（入力途中）。初回の扱いは要決定 |
| usage | 項目名 | |
| mitsuke_mm / mikomi_mm / length_mm | 見付mm / 見込みmm / 長さmm | |
| qty | 数 | |
| margin_mm | 余裕mm | |
| species_id | 樹種ID | 計算には使わない（部位の単価を使う）。Access と形をそろえるために残す |
| tateds_part_key | （足す） | TateDS の部材のキー（縦框など） |
| sort_order | （足す） | |

### 原価の行とのつながり

- 部位1つにつき `tategu_item_cost_lines` の `source='wood_calc'` の行が1つ（`wood_set_id` を足す）。名前は「部位名　樹種名　立米◯万円」、数量1、単価＝金額＝計算した合計
- 原価の行は部位から作るもので、直接は直せない（今と同じ）。部位を消したら原価の行も消す

## 計算（Access の `Ut_木材計算.bas` と同じ）

- 材積(m³) = (見付+余裕)×(見込み+余裕)×(長さ+length_allowance_mm) ÷ 10^9
- 合計(円) = Σ(材積×数) × unit_price_man × 10000
- 丸め: 要確認（Access は通貨型の変換だけ。Beaver の単価は整数のみ）

## 同期

- 製品台帳1件の子として、台帳の同期（`GET /tategu-items/sync`・`PUT /tategu-items/{id}/sync`）に部位と明細を入れる。競合の単位は台帳1件（R-0200 と同じ）。部位・明細を直したら台帳の `updated_at` を進める
- 樹種表は別の表として同期する

## 画面

- 製品台帳の画面に「木材」の欄。部位ごとの枠（部位名・樹種・立米単価・合計）に明細の表。末尾の空の行で行が増える（R-0200 と同じ操作感）。入力したら自動保存し、原価の行も更新
- ［＋ 部位を追加］、ひな形（框戸・格子・枠）。数0の行は保存時に外す
- 貼り付け（Excel・TateDS）はその部位の中だけに効く
- 立米単価が樹種の単価と違うときは横に薄く樹種の単価を出す
- 計算の前提（材積の式）を枠の下に出す

## TateDS とのつなぎ方

- TateDS の「材料リストをコピー」→ Beaver・Access の木材の欄で貼り付け → 樹種ごとに部位を作ってリンク。同じ建具をもう一度貼り付けたら、建具 ID と部材のキーで部位と明細を入れ替える（手で直した印があれば確認）
- 「TateDS で開く」（Beaver・Access 共通）: 建具データをクリップボードに入れて TateDS を開く。TateDS で「貼り付けて開く」
- 「TateDS で作る」: TateDS を開くだけ

## 未決（アドバイザの検討で埋める）

- 丸め、既存データ（共有された木材設定・設定ID空の明細）の初回の扱い、競合の承認画面、TateDS の建具データの大きさと WAF、複製

## アドバイザの検討で決めたこと（2026-11-13、晴樹さんの確認待ちの点は「質問」に）

詳細と根拠: `docs/wiki/knowledge/R-0268_review_sync.md`（同期）、`docs/wiki/knowledge/R-0268_review_ux.md`（操作・TateDS）

### 同期の作り（上の「表」「同期」を次のとおり直す）

1. **部位は `uid` で突き合わせる**。部位を作った側が UUID を振り、Access・Beaver とも `uid` 列で対応付ける（オートナンバーの ID は各側の内部用）。台帳の子の全件入れ替えでも、部位は uid で残す・足す・消すを決める。明細はどこからも指されないので、部位ごとの全件入れ替えでよい
2. **wood_calc の原価行は `wood_set_uid` で部位を指す**。Access の同期（`Df_製品台帳同期.bas`）も送る
3. **部位に合計 `amount`（円、整数）を持ち、同期で運ぶ**。受け取った側は計算し直さない。計算するのは人が明細・単価を直したときだけ。丸めは両側とも四捨五入。Access の寸法の列は単精度から倍精度に変える。1円差で更新が往復するのを防ぐ
4. **原価行の数量は人が決める値**（枚数）。部位から作り直すときも数量は触らない。単価＝部位の amount、金額＝単価×数量。TateDS から取り込んだときだけ建具の枚数を初期値にする
5. **建具データ（JSON）は台帳に1つ、別の口で運ぶ**（製品図と同じ形）。`PUT/GET /tategu-items/{id}/design`（multipart）。台帳の同期の JSON には `design_sha256` だけ載せる。thumbnail は除いて送る。Access は Recordset で書く（SQL に埋め込まない）。理由: WAF の403、Access の SQL 文の長さの上限、JSON のエスケープの遅さ
6. **製品台帳の書き込みに楽観ロック**（`expected_updated_at`、違えば409 `stale_product`）。台帳の access-link は updated_at を進めない（R-0264 と同じ）
7. **`wood_sets` のキーが無い台帳の PUT では木材に触らない**。入れ替えの順: Beaver（受け取れるようにするだけ）→ Access（木材を送る・受け取る）→ Beaver の画面で編集できるようにする
8. **樹種表は Access → Beaver の片方向**。部位には樹種名と単価を写す。樹種表を直しても各台帳には波及しない
9. 承認画面（Access）: 比べる表に部位ごとの1行の要約（部位名・樹種・単価・合計・明細の行数）を足す。「Beaver 版を採用」では部位も入れ替える
10. 取り込みの取りこぼし対策: GET の応答に読んだ時刻を入れて次の since にする。ページ送りは keyset（前のページの最後の台帳より後ろ）

### 複製

- Beaver の引用（R-0250 `ledgerClone`）・Access の製品複製とも、部位と明細を新しい uid で写し、wood_calc の行は部位から作り直す（今の Beaver は wood_calc を manual にして写すので二重になる。Access は設定を共有する）

### 画面

- 木材の欄は材料費の明細のすぐ下。wood_calc の原価行に「木材で直す」のリンク（木材の欄へ移る）
- 木材の表の Enter は右のセルへ進む（フォームを送信しない）。末尾の空の行と Tab は R-0262・R-0266 と同じ
- ひな形の行は「候補の行」として薄く出し、数を入れたら本当の行になる（数0の行を途中で消さない）
- TateDS から貼り付けたら、変更の一覧を見せてから入れ替える。「手で直した」の印は明細だけ比べる

### TateDS に要る作業（TateDS の担当へ頼む）

1. 建具ごとの UUID と版
2. 「材料リストをコピー」（JSON に format と version を入れる。樹種・部材のキー・ほぞ込みの仕上がり長さ・枚数）
3. 鏡板・腰板など木のパネルを木取り表に出す（板厚、無ければ既定15mm）
4. 「貼り付けて開く」

- Beaver・Access とも、知らない format・version の貼り付けは書かずに止める。Access の今の TSV 貼り付けに JSON が来たら止める
- 長さは TateDS のほぞ込みの仕上がり長さを入れ、余裕と +100mm は Beaver・Access 側で足す

### 初回（Access の既存データ）

- 木材設定を複製で共有している製品は、Access 側で製品ごとに設定を分けてから送る
- 計算し直すと今の金額と合わない19行: 対照表を晴樹さんに見せる。扱いは質問3
- 設定ID が空の明細21行（6製品、入力途中）: 扱いは質問4

### 晴樹さんの答え（2026-11-13、質問1〜4）

1. 保存: 木材を入力したらその場で原価の表と合計に反映する。DB への保存はいつもの［保存］で1回（部位・明細・原価行を1つのトランザクションで）。キャンセルすれば木材も元に戻る。変更があるときはモーダルの背景クリックで閉じない
2. 原価行の数量は手で直せる（枚数）。単価＝部位の amount（1枚分）、金額＝単価×数量。TateDS から取り込んだときは建具の枚数を初期値にする
3. 合わない19行は今の金額のまま。部位に「明細から計算すると ¥◯◯」と差を出し、その部位を直したときに計算値へ切り替える。初回の前に対照表を晴樹さんに見せる
4. 未反映の21行（6製品）は製品ごとに部位「（未反映）」を作って入れる。単価0で原価行は作らない

### 既定にしたこと（晴樹さんが違うと言えば直す）

- TateDS の樹種は ひのき→ひのき、杉→杉。ナラ・ケヤキ・ウォルナットは使われたら樹種表に足す
- 木材の明細の印刷は今回作らない
- TateDS から入れる長さは「ほぞ込みの仕上がり長さ」。余裕と +100mm は Beaver・Access 側で足す
- ひな形は Access のテンプレート（12項目）を框戸として1つ。格子・枠は使ってから足す

## Access（dodai-back）の返事を受けて決めたこと（2026-11-13）

方針（同じ形の表で両方向）と入れ替えの順は合意。Access 側は migration 060・木材の計算と画面・製品台帳の同期・複製・フォームの patch を受け持ち、ADR-012・F-22・F-27 を書き直す。

- **丸め**: 部位の amount = 十進で小数第6位に丸めてから四捨五入（Access は `Int(Round(CDec(x),6)+0.5)`、Access の ADR-010 と同じ順）。Beaver も同じ順にする（PHP は `round($x, 6)` のあと `floor(+0.5)`、境目の値 2677.5・220.5 をテストに入れる）。原価行の金額は今どおり 単価×数量 の端数処理（Access の `Hasuu(単価×数量,1)`）
- **建具データの列**: 製品台帳（tategu_items ⇔ tbl建具台帳）に `tateds_design_json`（MEMO）と `design_sha256` を持つ。部位の `tateds_design_json` はやめ、部位には建具 ID と版だけ
- **同期の JSON の並び**: Beaver は台帳の JSON で `wood_sets` を `cost_lines`・`labor_lines` より後ろに置く（Access の TopLevelJson が台帳の id・updated_at を取り違えないため）。Access も `wood_sets` で切るよう直す
- **wood_sets のキーが無いときは木材を消さない**: Beaver・Access の両方
- **Access の修正日**: Access は明細の入力・行の削除・テンプレート・貼り付けでも修正日を進めるよう直し、木材の画面を開いている台帳は取り込みを飛ばす
- **Access の既存のバグ**（Access 側で直す）: 木材の反映が本体金額＝単価で数量を掛けていない。貼り付けが設定ID 0 で入り既存の部位の明細が見えなくなる。複製にトランザクションが無い
- **承認画面**: フォームは変えず、差の文の先頭に【木材】で部位ごとの要約を出す
- **クリップボード（Access）**: 長い JSON は SetClipboardData（CF_UNICODETEXT）で書く
- **「（未反映）」の部位**: Access 側に開く入口を足す

### 既存データの数（Access で確かめた値に直す）

- 複製で共有されている木材設定: 9個
- 計算し直すと合わない行: 19行（四捨五入で数えた場合。今の Access の丸めでは18行。5686 は丸めだけの差）
- 本体数量が1でない木材の原価行: 14行（2・3 のほか、4 が1行、0 が7行）
- 金額が 単価×数量 になっていない行: 2行（5671・5673）
- 初回の前に晴樹さんに見せる対照表には、共有9個・数量≠1 の14行・金額≠単価×数量の2行も載せる

## 窓口の形（Access と Beaver の取り決め、2026-11-13）

既存の製品台帳の同期（R-0200）に足すだけ。今の Access がこれまでどおり送っても動きが変わらないようにする。

### 1. 製品台帳の JSON に足すもの

対象: `GET /tategu-items/sync` の各台帳、`POST /tategu-items/sync`、`POST /tategu-items/sync/bulk` の各 item、`PUT /tategu-items/{id}/sync`、409 `product_conflict` の `product`。

- 台帳の列に `design_sha256`（文字列 or null）を足す。台帳の列なので `cost_lines` より前に出る
- `wood_sets`（配列）を **`labor_lines` より後ろ**に置く
- `cost_lines` の行に `wood_set_uid`（文字列 or null）を足す。`source = "wood_calc"` の行だけが値を持つ

```json
{
  "id": 812, "code": "05637", "name": "片引格子戸", "description": null, "status": "active",
  "building_image_path": null, "drawing_sha256": null, "design_sha256": null,
  "updated_at": "2026-11-13 10:20:00",
  "cost_lines": [
    {"category_code": "MAIN", "name": "本体　杉　立米60万円", "quantity": 2, "unit_cost": 11084, "amount": 22168,
     "source": "wood_calc", "wood_set_uid": "6f1c2a9e-3b4d-4c1a-9f0e-2d7b8a1c5e33", "sort_order": 0}
  ],
  "labor_lines": [],
  "wood_sets": [
    {
      "uid": "6f1c2a9e-3b4d-4c1a-9f0e-2d7b8a1c5e33",
      "part_name": "本体",
      "species_access_id": 2, "species_name": "杉",
      "unit_price_man": 60, "length_allowance_mm": 100, "amount": 11084, "sort_order": 0,
      "tateds_design_id": null, "tateds_revision": null, "tateds_imported_lines": null,
      "lines": [
        {"usage": "框", "mitsuke_mm": 45, "mikomi_mm": 30, "length_mm": 1800, "qty": 2, "margin_mm": 3,
         "tateds_part_key": null, "sort_order": 0}
      ]
    }
  ]
}
```

| キー | 型 | 決まり |
|:--|:--|:--|
| `uid` | 文字列（UUID、36文字） | 部位を作った側が振る。全台帳で一意。小文字で比べる |
| `part_name` | 文字列 | 空可（「（未反映）」の部位は `（未反映）`） |
| `species_access_id` | 整数 or null | Access の tbl木材樹種M の ID |
| `species_name` | 文字列 | 名前の写し（表示用） |
| `unit_price_man` | 数値 | 立米単価（万円） |
| `length_allowance_mm` | 数値 | 既定 100 |
| `amount` | 整数 | 部位の合計（1枚分、円）。受け取った側は計算し直さない |
| `sort_order` | 整数 | |
| `tateds_design_id` / `tateds_revision` | 文字列 or null | |
| `tateds_imported_lines` | 文字列 or null | 取り込んだときの明細の控え（JSON を文字列で） |
| `lines[].usage` | 文字列 | 項目名 |
| `lines[].mitsuke_mm` / `mikomi_mm` / `length_mm` / `margin_mm` | 数値 | |
| `lines[].qty` | 数値 | |
| `lines[].tateds_part_key` | 文字列 or null | |
| `lines[].sort_order` | 整数 | |

### 2. 受け取ったときの動き（Beaver。Access も同じ考え方で）

- **`wood_sets` のキーが無い**: 部位・明細に触らない（今の Access が送ってきた場合）
- **`wood_sets` がある**: その台帳の部位を `uid` で突き合わせる。来た部位は足すか書き換え、来なかった部位は明細ごと消す。明細は部位ごとに全件入れ替え。`[]` なら部位をすべて消す
- `uid` が別の台帳の部位としてすでにある: 何も書かず 409 `wood_set_uid_conflict`
- `cost_lines` は今どおり全件入れ替え（`wood_calc` の行も来たとおりに入れる）。`wood_set_uid` が、同じ JSON の `wood_sets` にも Beaver の既存の部位にも無い: 何も書かず 400 `wood_set_missing`。`wood_set_uid` が null の `wood_calc` 行は今までの行として受ける
- 書いたら台帳の `updated_at` を進める（今と同じ）
- 部位の `amount` は来た値をそのまま入れる。原価行の金額も来た値（Access が `Hasuu(単価×数量,1)` で出したもの）

### 3. 建具データ（TateDS）の口

製品図（`/tategu-items/{id}/drawing`）と同じ形。

- `POST /tategu-items/{id}/design`: multipart、項目名 `file`、中身は UTF-8 の JSON 文字列（解析しない。JSON として読めるかだけ確かめる）。5MB まで。`tateds_design_json` と `design_sha256`（中身の sha256、小文字16進）を書き、`updated_at` を進める。応答は台帳の JSON
- `GET /tategu-items/{id}/design`: 中身をそのまま返す（`Content-Type: application/json; charset=utf-8`）。無ければ 404 `design_not_found`
- `DELETE /tategu-items/{id}/design`: 外す。`design_sha256` を null に、`updated_at` を進める
- Access は送った・受け取ったときの `design_sha256` を覚えておき、違うときだけ取りに来る

### 4. 樹種表（Access → Beaver の片方向）

- `PUT /wood-species/sync`: `{"items": [{"access_id": 2, "name": "杉", "unit_price_man": 60, "disabled": false, "sort_order": 2, "tateds_species_key": "sugi"}]}`。`access_id` で足すか書き換える。来なかった樹種は `disabled` にする（消さない）。応答は全件
- `GET /wood-species`: 画面用（ログインまたは同期トークン）

### 5. 取りこぼし対策（足すだけ）

- `GET /tategu-items/sync` の応答に `read_at`（読んだ時刻、JST）を足す。次の `since` に使ってよい
- `after_id` を受ける: `since` と組みで「`updated_at > since`、または `updated_at = since` かつ `id > after_id`」。`offset` も今どおり使える

### 6. 段階

1. **Beaver 第1段階**: 上の 1〜5 を受け取れるようにする。画面は今のまま（wood_calc の行は読み取りだけ）
2. **Access**: migration 060、バグの直し、送る・受け取る、承認画面、複製、TateDS で開く
3. **Beaver 第2段階**: 製品台帳の画面の木材の欄、楽観ロック（409 `stale_product`）、台帳の access-link で updated_at を進めない、複製（ledgerClone）
