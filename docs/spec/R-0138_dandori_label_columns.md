# R-0138: 段取りボードの案件名・得意先名を2列表示＋列幅ドラッグ調整＋幅記憶

## 背景

本番フィードバック（/readyoubou、2026-09-01、id=46、段取りボード画面）:

> 「この案件名のところをニ列にして、
> 案件名,得意先名
> どちらも左寄せにして。はみだす分は見えなくて良い　これも幅をドラッグ調整できるようにして、その幅の設定はブラウザニ保存されてほしい」

## 現状（指揮役が調査済み）

`frontend/src/components/dandori/GanttScroll.tsx`の`BarRow`が、ガント行の左端ラベル部分（`.label-col`）に案件名`.name`と得意先名`.cust`を横並び（`flex-direction: row`, `gap: 8px`）で表示している。`.label-col`全体の幅は`LABEL_WIDTH = 240`（定数）で固定。

`frontend/src/components/dandori/dandoriBoard.css`:
```css
.dandori-board .row .label-col { flex-direction: row; align-items: center; gap: 8px; white-space: nowrap; overflow: hidden; }
.dandori-board .row .name { font-weight: 700; font-size: calc(14px * var(--scale)); line-height: 1.1; }
.dandori-board .row .cust { font-size: calc(11px * var(--scale)); color: var(--muted); }
```

案件名が長いと得意先名が押し出されて見えなくなったり、両方合わせて`.label-col`幅を超えると`overflow:hidden`で強制的に切れて読めなくなる（添付画像で確認済み）。見出し行（`.axis .label-col`）は「案件」という単一ラベルのみ。

## 対応方針（藤田晴樹さん承認済み・2026-09-01）

- 「２列」＝案件名と得意先名を、明確に区切られた別々の列として表示する
- 列幅は2つの状態を持つ:
  1. `nameColWidth`: 案件名列の幅
  2. `labelTotalWidth`: ラベル全体（案件名列＋得意先名列）の幅。既存の`LABEL_WIDTH`定数をこの可変値に置き換える
  - 得意先名列の幅は `labelTotalWidth - nameColWidth` で自動算出する（独立した状態は持たない）
- ドラッグハンドルを2箇所に設置する:
  1. 案件名列と得意先名列の境界（ドラッグで`nameColWidth`を変更）
  2. ラベル全体とガントチャート本体の境界（ドラッグで`labelTotalWidth`を変更）
  - 見出し行（`.axis .label-col`）にのみハンドルを表示する（各行に重複表示しない。既存の一覧画面の列幅ドラッグ`DataTable.tsx`の`bv-datatable-resize-handle`と同じ考え方）
- 両列とも左寄せ（`text-align: left`）、`white-space: nowrap; overflow: hidden`ではみ出す分を隠す（省略記号は付けない、要望通り「見えなくて良い」の解釈でシンプルに切る）
- 見出し行のラベルも「案件」から「案件名」「得意先」の2つに分ける
- 幅設定はlocalStorageに保存し、次回アクセス時に復元する。キーは既存の`DataTable`の命名規則（`bv_table_widths_*`）に倣い `bv_dandori_label_widths`（JSON: `{ name: number, total: number }`）を新設する
- 最小幅: `nameColWidth`・得意先名列幅とも60px（下回るドラッグは無効化する）。`labelTotalWidth`の最小値は「`nameColWidth`の最小60px + 得意先名列の最小60px = 120px」

## TDD必須

`frontend/src/components/dandori/__tests__/`に以下を検証するテストを追加する:
1. 案件名・得意先名が別々のDOM要素（列）として左寄せで表示される
2. `nameColWidth`・`labelTotalWidth`のドラッグ操作で幅が変わり、`localStorage`の`bv_dandori_label_widths`に保存される
3. 保存済みの`bv_dandori_label_widths`がある状態でマウントすると、その幅が復元される
4. 幅が最小値を下回るドラッグでは、最小値でクランプされる

既存の`estimateLabelWidth`・バー内ラベル表示（`bar-label-outside`等）のロジックは変更しない。

## 受け入れ条件

1. 段取りボードのガント行で、案件名列・得意先名列が明確に区切られ、両方左寄せで表示される
2. 案件名/得意先名の境界、およびラベル全体/ガントチャートの境界の両方をドラッグして幅を変更できる
3. 変更した幅がブラウザに保存され、リロード後も維持される
4. 幅を極端に狭めても列が消えたり負の値にならない（最小幅でクランプ）
5. 既存テスト・回帰スイートが通る
