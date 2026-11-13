# R-0268: 建具デザインスタジオ（TateDS）への依頼

Beaver の製品台帳（と Access）に TateDS の材料リストを流し込み、その建具を開けるようにするため、TateDS 側に次をお願いしたい。Beaver の仕様は `docs/spec/R-0268_wood_cost.md`、判断は `docs/adr/ADR-0001-木材原価をAccessと同じ表で同期する.md`、TateDS の今の作りの調査は `docs/wiki/knowledge/R-0268_design_studio_material_list.md`、細かい提案は `docs/wiki/knowledge/R-0268_review_ux.md`。

TateDS は外にも売っている製品なので、ボタンの名前や形式は Beaver 専用にせず「材料リストを書き出す」のような一般的なものにする。

1. **建具ごとの UUID と版**: 今の Dexie の数値 id は端末ごとなので、どの端末でも同じになる UUID を建具に持たせる。版は更新日時でよい
2. **「材料リストをコピー」**: クリップボードに JSON を入れる。`format`（例 `tateds.materials`）と `version` を必ず入れる。中身は 建具の UUID・版・名前・枚数、部材ごとに 部材キー（縦框など）・樹種・見付・見込み・**ほぞ込みの仕上がり長さ**・本数（1枚あたり）、それと建具データ（thumbnail は除く）。余裕や +100mm は Beaver・Access 側で足すので入れない
3. **木のパネル（鏡板・腰板）を木取り表に出す**: 今は面積で計算され depth=0 で外れる。板厚の項目を持たせ、無ければ既定 15mm
4. **「貼り付けて開く」**: Beaver・Access がクリップボードに入れた建具データ（上の JSON）を貼り付けて、その建具を開く。同じ UUID の建具が端末にあれば、版を比べて上書きか別に開くかを聞く

樹種が混ざる建具（框まわり＝ひのき、腰板＝杉）は、Beaver 側で樹種ごとに部位を分けて取り込むので、TateDS 側は部材ごとに樹種を出してくれればよい。
