# R-0268 建具デザインスタジオから木材の材料リストを出せるか（調査）

調査日: 2026-11-13 / 対象: `C:\Fujiruki\Projects\TateguDesignStudio`（以下 TDS）/ 読み取りのみ、コード変更なし

## 結論

- 材料リスト（木取り表）を作る機能はある。ただし出力は「部材名・寸法・本数」までで、樹種は列に出ない。
- 樹種は建具データに入っている（部材グループごと）。木取り表の行と結びつければ「用途・樹種・寸法・本数」のリストは作れる。結びつける処理は未実装。
- 建具の ID は連番の数値だけで、端末ローカルのため製品との紐付けには弱い。版番号はなく、更新日時（ミリ秒）のみ。
- 外部に出す口は、ブラウザからのファイル出力（JSON・CSV・DXF・JWW）だけ。サーバー側の API はない。
- docs に Beaver 連携は「将来」として一行ある。Access の記述は無い。

## 1. データモデル

保存先は v1 では各利用者のブラウザ内 IndexedDB（Dexie、DB 名は `tds_` 接頭辞）。サーバーには建具データを持たない（`api/` は要望フォームの受信と `uploads/` のみ）。

- `Project`: `id`（自動採番の数値）, `title`, `isArchived`, `updatedAt`（ms）
- `StoredDoor`（`frontend/src/services/StorageService.ts`）: `id`（自動採番の数値）, `projectId`, `tag`（"D-01" 等の識別番号、利用者が付ける）, `name`, `structureType`（frame / flush）, `dimensions`, `textureSpecs`, `hardware`, `panelMaterials`, `count`（建具の数量）, `updatedAt`、ほか `doorStyle` `apertures` `edgeStrip` `frame`（建具枠）など
- `DoorDimensions`（mm）: `width` `height` `depth`（見込み）, `stileWidth`（縦框幅）, `topRailWidth` `bottomRailWidth` `middleRailWidth` `middleRailCount`, `tsukaWidth` `tsukaCount`, `kumikoVertWidth/Count` `kumikoHorizWidth/Count`、`estimationOverrides`（部材名をキーにした木取り余裕・ホゾ・単価・寸法の上書き）
- 樹種: `DoorTextureSpecs`（`frontend/src/domain/DoorSpecs.ts`）の `stile / topRail / bottomRail / middleRail / tsuka / kumiko / panel / glass` それぞれが `MaterialTexture` を持ち、その中の `woodSpecies`（hinoki / sugi / nara / keyaki / walnut の 5 種のみ、任意項目）で樹種を指定する。`PanelMaterial`（区画ごと）にも `woodSpecies` がある。樹種は見た目（木目描画）のための指定で、単価や積算には使われていない。
- バックアップは `ExportService`（`tds_export_YYYY-MM-DD.json`）。`{version:'1.0', exportedAt, projects[], doors[], catalog[]}`。

## 2. 材料リスト（木取り表）

あり。`frontend/src/domain/KidoriService.ts`（`buildKidoriRows` と `toKidoriCsv`）。エディタの「木取り」ボタン（`EditorScreen.tsx` の `handleExportKidori`）から、建具 1 枚ごとに CSV を保存する。計算本体は `EstimationService.ts` の `calculateCost`。

現在の CSV の列: 部材名 / 幅(mm) / 奥行(mm) / 長さ(mm) / 本数 / ほぞ長さ(mm) / 取り幅 / 取り奥行 / 取り長さ / 備考（`幅x奥行x長さ(+ほぞ×2)`）。

出ている部材名（用途）: 縦框、上桟、下桟、中桟、束、組子 タテ、組子 ヨコ。木取り寸法の式は「取り幅=幅+余裕5、取り厚=見込み+余裕3、取り長=長さ+ほぞ×2+余裕50」（既定値）。

`calculateCost` の内部にはあって CSV に出ていないもの:
- 材積 `volumeM3`（歩留まり損失 10% 込み）、単価 `unitPrice`（立米 80 万円で全部材共通）、金額 `cost`
- フラッシュ戸の縁材（`オーデ材(hinoki|other)`）。ただし「木取り」ボタンはフラッシュ用の引数を渡していないため、現状は CSV に載らない
- パネル、ガラス、額などは面積計算で `depth=0`。木取り CSV からは除外される（木材ではない扱い）

未実装・欠けているもの:
- 樹種の列（`textureSpecs` から部材名への対応付けが要る。縦框→stile、上桟→topRail、下桟→bottomRail、中桟→middleRail、束→tsuka、組子→kumiko）
- 建具の枚数（`count`）を掛けた合計。1 枚分の本数のみ
- プロジェクト全体の一括木取り表（仕様 `02_機能仕様.md` に記載はあるが未実装）、PDF・A4 印刷
- 建具枠（`frame`）の木取り
- 注意: 仕様書の機能表は木取り表を「未実装」としているが、コードには CSV 出力が実装済み。仕様書が古い。

データモデルから材料リストを作ることは可能。部材名・寸法・本数は `calculateCost` の結果から、樹種は `textureSpecs` から引ける。

## 3. 一意な ID と版

- 建具 ID: `StoredDoor.id` は Dexie の自動採番（1, 2, 3…）。端末ごとのローカル採番で、別の端末や別の利用者の間では衝突する。`tag` も利用者が自由に付ける名前で一意の保証がない。`CatalogItem.id`（ギャラリー）は文字列だが、それは保存済みテンプレート用。
- 版: 版番号はない。`updatedAt`（ms の UNIX 時刻）が建具・プロジェクトにあり、保存のたびに更新される（`saveDoor`）。「設計を直したか」は `updatedAt` の比較で分かる。内容の同一性を見る用の hash も無い。
- 操作履歴 `UndoHistoryEntry` はセッション内のみ。

Beaver 側で「この製品はこの設計から来た」を保つには、TDS が出力時に UUID（建具ごとの `designId`）を付け、`updatedAt` を `designRevision`（または内容の hash）として添える必要がある。現状の数値 `id` はそのままでは使えない。

## 4. 外部に出す口

すべてブラウザ上でのファイル保存。サーバー API・Webhook・連携用のエンドポイントは無い。

| 口 | 形式 | 範囲 |
|---|---|---|
| 一括バックアップ（`ExportService`） | JSON | プロジェクト・建具・ギャラリー全部 |
| 木取り表 | CSV（BOM 付き、UTF-8） | 建具 1 枚 |
| DXF / JWW | JWCAD 向け図面 | 建具 1 枚 |
| PNG | 画像 | 建具 1 枚 |
| 共有ギャラリー（`SharedGalleryService`） | サーバー API | テンプレート（ギャラリー）のみ、建具設計の連携用ではない |

## 5. docs の Beaver / Access 連携の記述

- `docs/spec/01_概要.md`: 将来機能に「Beaver連携（見積→受注）」、エコシステム図 `TateguDesignStudio → Beaver → Youkan → DotLog`（設計・積算 → 見積・売上 → タスク管理 → 作業記録）、「各アプリは独立動作可能。連携はオプション」。具体的な項目・形式は何も決まっていない。
- `02_機能仕様.md`: 木取り表の出力項目として「部材名、木取り寸法（幅×厚み×長さ）、数量、材積、単価・金額」、形式は CSV / PDF / A4 印刷、プロジェクト一括。
- handover（`docs/handover/Hikitsugi_LATEST.md`）、`backlog.md`、`CLAUDE.md` に Beaver の記述なし。
- Access（Microsoft Access）の記述は TDS の docs には見つからなかった。

## Beaver の受け口に要る項目の提案

受け口は「製品台帳の木材明細」1 行 = 下の 1 行。建具 1 件に対して複数行。

建具（ヘッダ）:
- `designId`（UUID。TDS 側で採番、製品とのリンク）, `designRevision`（`updatedAt` か内容 hash）, `designName`, `tag`, `quantity`（建具の枚数）, `exportedAt`, `source`（"TateguDesignStudio" とアプリの版）

木材明細（行）:
- `purpose`（用途／部材名: 縦框・上桟・下桟・中桟・束・組子 タテ・組子 ヨコ・建具枠・縁材）
- `species`（樹種。TDS の 5 種のコード hinoki / sugi / nara / keyaki / walnut と、未指定を許す。表示名は Beaver 側のマスタで対応）
- `finishedWidthMm` `finishedThicknessMm` `finishedLengthMm`（仕上がり寸法）
- `cutWidthMm` `cutThicknessMm` `cutLengthMm`（木取り寸法。余裕・ほぞ込み）
- `pieces`（1 枚あたりの本数）と、建具枚数を掛けた `totalPieces`（どちらを正とするかを決めておく）
- `volumeM3`（材積、歩留まり込みか別かを明記）, `unitPricePerM3`, `amount`（TDS の値は参考値。単価は Beaver 側が持つのが自然で、無くても受けられるように任意項目）
- `note`

運用上の決めごと:
- 取り込みは `designId` をキーに「置き換え」にする（`designRevision` が同じなら無視、違えば明細を入れ替え）。
- TDS に必要な改修（Beaver 側の要望とは別）: 建具への UUID と版の付与、木取り表の樹種列・枚数・材積の追加、JSON での出力、必要なら送信の口（今はサーバーが無いので、まず JSON ファイルを Beaver で読み込む方式が現実的）。
- 樹種は見た目の指定で、積算に使われていない。単価を樹種別にするなら TDS 側のデータ追加が要る。
