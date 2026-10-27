# R-0200: 製品台帳（伝票から作る・直す／名前を製品台帳に／Accessと同期）

- 依頼: 2026-10-27 藤田晴樹さん（このセッションで直接）。原文は `docs/requests.md` の R-0200
- 状態: (A) 仕様確定、(B) デザインA/Bの選択待ち、(C) Beaver側は仕様確定
- Access側: AccessTategu R-0211（`docs/R-0211_製品台帳同期_仕様案.md`、晴樹さんの答えは 6259017）
- 本番の台帳の事実（10/27）: 5,607件はすべて3/17の一括取り込みで、Beaverで作った・直した台帳は無い。子の表は0件、明細の`tategu_item_id`も0件

## (A) 名前を「製品台帳」に

- 晴樹さんの答え（R-0211 Q8）: 帳票名や「建具複製」も含め、**画面に出る「建具」をすべて「製品」に**。表・列・API・ファイル名は変えない
- 例: 建具台帳→製品台帳、建具№→製品№、建具名→製品名、建具図→製品図、建具から選択→製品台帳から選択
- 変えないもの: データの中身（売上種別「1地元建具」、得意先名、明細の品名など）。コードの識別子（`tategu_*`、`TateguSelector`）
- 用語集に「製品台帳（表は tategu_items。旧称 建具台帳）」を足す

## (B) 伝票の明細から製品台帳を作る・直す

- デザイン案 `docs/design/R-0200_product_ledger_from_voucher.md`・`_mock.html`。晴樹さんのA/Bの選択待ち。選ばれたらここに書く
- 決まっていること: 保存したら、その伝票のその明細だけ原価に反映する。ほかの伝票の明細は変えない

## (C) Accessと両方向で同期する

晴樹さんの答え: 両方向・承認なし。両方で同じ台帳を直したときだけ、Accessの承認画面で選ぶ。

### 対応付けと番号

- 製品№を振るのはAccessだけ。Beaverは`code`を採番しない（`POST /tategu-items`の`MAX(code)+1`をやめ、`code`空で保存する。`code`は`UNIQUE`だがNULLは複数可）
- `code`が空の台帳は、画面で製品№の代わりに「採番待ち」と出す
- 番号の見え方は5桁（`00878`）。Accessから来た番号は5桁ゼロ埋めで入れる。比べるときは数値で比べる
- `PATCH /tategu-items/{id}/access-link`（`code`）: Accessが採番した番号を受け取る。すでに別の`code`があれば409

### 同期する項目

| Beaver | Access | 扱い |
|:--|:--|:--|
| `code` | 建具№ | 上のとおり |
| `name` | 建具名 | 同期 |
| `description` | 備考 | 同期（3/17の取り込みと同じ。晴樹さんの言う「説明」は画面に出ている備考。Accessの説明の列は全件空なので同期しない） |
| `status` | 使用不可 | `archived`⇔使用不可 |
| `building_image_path` | 建具図 | 画像そのものを同期（下の「製品図」） |
| `tategu_item_cost_lines` | 本体・金物・硝子 | `category_code` MAIN/HARDWARE/GLASS。台帳ごとに全件入れ替え。`sort_order`はAccessのID順 |
| `tategu_item_labor_lines` | 労務費 | Accessの1行を`FACTORY_TIME`・`SITE_TIME`の2行に（0時間の側は作らない）。Beaver→Accessはdodai-back側でまとめる |
| `cost_*`・`cost_breakdown` | 合計 | 同期しない。各側で明細から計算する |
| `base_catalog_item_id`ほか | なし | Beaverだけ。Accessから来たときは触らない |

Accessだけに置くもの: 説明・金物1・金物2・硝子・仕上・KeyWord・木材設定・木材明細。

### Beaverの画面で変えること

- 単価は円未満を入れられない（画面は整数だけ。APIも小数の`unit_cost`は400）
- `source='wood_calc'`の行（Accessの木材原価計算の結果）は、Beaverで直せない・消せない。画面は読み取りだけ、APIは明細の入れ替えでも`wood_calc`の行を残す
- 追加工程（`tategu_item_additions`）は画面から外す。すべての台帳が同期の対象なので、使える台帳は無くなる（catalog-systemからの引用は R-0213 で別に考える）
- ［削除］は今どおり`archived`にする（物理削除しない）

### API（同期トークンで通す。既存の伝票同期と同じ扱い）

| 窓口 | 内容 |
|:--|:--|
| `GET /tategu-items/sync?since=&limit=&offset=` | `updated_at`が`since`より新しい台帳を、明細行・労務行・`drawing_sha256`込みで返す |
| `POST /tategu-items/sync` | Accessで作った台帳を作る。`code`必須。同じ`code`があれば作らずその台帳を返す（再送に備える） |
| `PUT /tategu-items/{id}/sync` | Accessで直した台帳を入れる。`base_synced_at`より`updated_at`が新しければ何も書かず409 `product_conflict`（伝票のR-0158と同じ） |
| `POST /tategu-items/sync/bulk` | 初回の全件用。最大500件ずつ。`code`で上書き・追加 |
| `PATCH /tategu-items/{id}/access-link` | 上の「対応付けと番号」 |
| `GET/POST/DELETE /tategu-items/{id}/drawing` | 製品図（下） |

- 応答には、書いたあとのBeaverの`updated_at`を入れる（Accessはこれを`last_synced_at`にする）
- `GET /sync/changes`に台帳の件数を足す
- 伝票の同期: 明細に`tategu_item_id`と`tategu_code`を足す。Accessから`tategu_code`が来たら`code`で引いて`tategu_item_id`に入れる。引けなければその伝票は書かず409 `product_missing`（Accessは台帳を先に送ってから再送する）。キーが無ければ今の値を残す
- 同期の順はAccessが決める（得意先→案件→製品台帳→伝票）

### 製品図（晴樹さんの答え: Beaverにも上げる）

Beaver側の案。dodai-backに渡し、Access側をこれに合わせてもらう。

- 1台帳に1枚。置き場は`api/uploads/tategu/{id}/`。直接は開けない（`.htaccess`で`Require all denied`）、`GET /tategu-items/{id}/drawing`でだけ渡す（ログインか同期トークンが要る）
- `building_image_path`には`uploads/tategu/{id}/`からのファイル名を入れる。新しく`drawing_sha256`（TEXT）を足す（migration）
- `POST /tategu-items/{id}/drawing`: multipart、項目名`file`（PHPはPUTのmultipartを受けないためPOST）。受けるのはJPEG・PNGだけ（拡張子でなく中身で判定）、10MBまで。Accessの建具図はほとんどWMF（1,237件中1,186件）で、ブラウザで出せないため、AccessがPNGに変えてから送る。置き換えたら古いファイルは消す。`updated_at`と`drawing_sha256`を変える
- `DELETE /tategu-items/{id}/drawing`: 製品図を外す。`updated_at`を変え、`drawing_sha256`をNULLにする
- 同期: `drawing_sha256`はBeaverに置いたファイルのハッシュ。Accessは送った・受け取ったときのハッシュを覚えておき、違うときだけ画像を取りに来る（Beaverから来たPNG・JPEGはAccessの建具図フォルダに置く）。製品図だけ変えたときも台帳1件の変更として扱う（競合の単位も台帳1件）
- 初回: 古い建具図（D:を指す1,237件）は送らない（晴樹さん「いらない」、10/27）。製品図の同期は、これから付ける図だけが対象

### 初回

- Accessを正として、`code`＝建具№で上書き・追加する（R-0211 Q7）。Beaverに守るべき変更は無い（上の本番の事実）
- Beaverにだけある番号（Accessで消したもの）は一覧に出して晴樹さんに見てもらう
- 本番DBの書き換えなので、退避→dry-run→実行→件数とintegrityの確認。実行の前に晴樹さんに確認する

### 製品図の大きさ（dodai-backがfrontPCで測った、10/27）

- 最大2.41MB、平均49.7KB。10MBを超えるものは無い。台帳から指されているファイルは682種類（wmf 765件・jpg 72件）
- 同じ図を複数の台帳が使っているが、Beaverは台帳ごとに1枚ずつ持つ（重なっても合計で数十MB程度）
- 実物はNAS（L:）のコピーだけで、Accessのパス（D:\建具システム2002\建具図\）は開けない。晴樹さんの答えで古い図は使わない
