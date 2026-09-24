# R-0145: 伝票明細行「原価から売値を設定」ボタンの適用範囲・計算精度改善、労務単価デフォルト値バグ修正

## 背景

本番フィードバック（/readyoubou、`docs/requests.md` §35、id=50〜54、2026-09-11〜09-23、伝票編集画面）より。id=54は実装前の相談を明示的に希望しており、指揮役の調査結果を藤田晴樹さんへ提示のうえ全項目の方向性を確認済み（2026-09-25）。

## 対応項目

### (A) 労務単価デフォルト値バグ（id=50）

**原因**: `VoucherEdit.tsx`の`handleAddLine()`/`handleInsertLine()`で、新規伝票（`isNew`）の場合は`append({ ...defaultLine, cost_labor_rate: settings.defaultLaborRate })`だが、既存伝票（`!isNew`、`addLineMutation.mutate`経由）の場合は`cost_labor_rate`を渡し忘れており、常に`defaultLine`の`0`のままDBへ保存されていた（R-0125で実装した「設定画面のデフォルト労務単価を新規行へ自動反映」が既存伝票への行追加・行挿入では効いていなかった）。

**対応**: `addLineMutation.mutate(...)`（`handleAddLine`・`handleInsertLine`の両方）に`cost_labor_rate: settings.defaultLaborRate`を追加する。

### (B) 集計区分マスタの労務費マージ設定データ修正（id=54前半、赤字バグ）

**原因（確定・コード変更ではなくデータの問題）**: `aggregation_category_master.merge_into_price_code`が本番・開発DBとも全区分でNULL。migration 021（旧命名`factory_hours`/`site_hours`時代）で`merge_into_price_code='body'`を設定していたが、R-0119のmigration 027（2026-08-27、区分を`FACTORY_TIME`/`SITE_TIME`等の新コードへ再シード）でこの設定が引き継がれず消えていた。結果、`ProfitRateBar.tsx`の`calcCategorySellPrices()`が労務費をどの区分にもマージできず（`mergeCode`が常にnull）、「原価から売値を設定」ボタンは材料費のみに利益率を乗せた売値を算出しており、労務費比率が高い建具ほど実質的な粗利が想定より薄くなる（人件費が売値に反映されない）状態だった。R-0136（2026-09-01、丸め順序の修正）はこの前提が満たされている場合の計算式を直したものだが、そもそも前提（マージ設定）が消えていたため実質的に効果を発揮していなかった。

**対応**: `aggregation_category_master`の`FACTORY_TIME`・`SITE_TIME`の`merge_into_price_code`を`MAIN`（本体）へ設定するデータ修正のみ（コード変更なし）。dev・Beaver_beta・本番の3環境すべてに適用する。`aggregation_categories.php`のsync処理は既存の`merge_into_price_code`をCOALESCEで保持する実装のため、今後catalog-system側と再同期しても消えない。

migration: `api/migrations/037_fix_time_category_merge_price_code.sql`
```sql
UPDATE aggregation_category_master
SET merge_into_price_code = 'MAIN'
WHERE code IN ('FACTORY_TIME', 'SITE_TIME')
  AND merge_into_price_code IS NULL;
```

### (C) 「原価から売値を設定」ボタンの適用範囲変更（id=51・52・54後半）

**藤田晴樹さんの決定（2026-09-25）**:
- 明細行を選択中（`selectedIdx !== null`）に押した場合 → **その1行だけ**に適用する
- 未選択（`selectedIdx === null`）の場合 → 従来通り**全行**に適用する。ただし実行前に確認ダイアログ（`window.confirm()`、「行が選択されていません。全行に適用します。よろしいですか？」等）を出し、Enterキーで肯定（`confirm()`のOKボタンはブラウザ標準でEnterに反応するため追加実装不要）
- 1行適用が成功したら、自動的に**次の行**（`selectedIdx + 1`。最終行の場合は選択解除のまま据え置き）を選択状態にする（id=52。繰り返しクリックで次々設定できるようにするため）

**実装方針**: `ProfitRateBar`に`selectedIdx`・`onApplied(nextIdx: number | null)`（または`setSelectedIdx`）をpropsとして渡し、`VoucherEdit.tsx`側が保持する行選択state（既存の`selectedIdx`/`setSelectedIdx`、行操作ボタン群と共有）を利用する。`applyProfitRate()`を「1行分だけ計算する内部関数」を切り出し、全行適用時はその内部関数をloopで呼ぶ形にリファクタし、1行適用と全行適用でロジックの重複を避ける。

### (D) 行削除・並べ替えボタン（id=53）→ 対応不要（既存実装の確認のみ）

調査の結果、「行を削除」「▲（上へ）」「▼（下へ）」「行を挿入」「建具複製」ボタンは既に実装済み（`VoucherEdit.tsx`の`handleRemoveLine`/`handleMoveUp`/`handleMoveDown`/`handleInsertLine`/`handleDuplicateLine`、行右端の「選択」列のラジオボタンで対象行を選んでから使用する仕様）。行削除は物理削除（`DELETE FROM voucher_lines`、`DELETE FROM voucher_line_costs`・`voucher_line_prices`も連動削除、論理削除ではない）。コード変更なし。

## TDD必須

- (A): 既存伝票への「行を追加」「行を挿入」で`cost_labor_rate`が設定画面のデフォルト値になることを検証するテスト（vitest、`addLineMutation.mutate`の呼び出し引数を検証）
- (C): 以下をvitestで固定
  1. 行選択中に「原価から売値を設定」を押すと、その行のみ`prices`/`line_total`が更新され、他行は変化しないこと
  2. 行選択中に適用後、選択がその次の行のインデックスへ移ること（最終行選択中は選択状態が変わらない、または解除されないことを明示）
  3. 未選択時に押すと`window.confirm`が呼ばれ、確認でOK（true）なら全行に適用されること、キャンセル（false）なら何も変わらないこと
- 既存の全行適用時の計算結果（`calcCategorySellPrices`の丸め等）に関する既存テストは壊さないこと

## データ修正の実行手順（コード変更と別扱い、DBへのUPDATEのみ）

1. dev DB: `api/migrations/037_fix_time_category_merge_price_code.sql`をPHP PDO経由で適用、`applied.txt`に記録
2. Beaver_beta・本番: 通常のmigration運用手順（事前バックアップ→SSH+PHP PDO経由でUPDATE実行→`applied.txt`に記録、本番SQLite 3.7.17でも単純UPDATEのため互換性問題なし）
3. 適用後、`SELECT code, merge_into_price_code FROM aggregation_category_master`で3環境ともFACTORY_TIME/SITE_TIMEが`MAIN`になっていることを確認

## 受け入れ条件

1. 既存伝票へ行を追加・挿入すると、設定画面のデフォルト労務単価が自動入力される
2. dev・Beaver_beta・本番のいずれでも、原価に工場時間・現場時間の入力がある明細で「原価から売値を設定」を押すと、本体（MAIN）の売値に労務費分が反映される（材料費のみで計算されない）
3. 明細行を選択した状態でボタンを押すと、その行だけが変更される（他の行は変化しない）
4. 3の適用後、選択状態が次の行へ自動的に移る
5. 明細行を選択していない状態でボタンを押すと確認ダイアログが出て、OKなら従来通り全行に適用される
6. 既存テスト・回帰スイートが通る
