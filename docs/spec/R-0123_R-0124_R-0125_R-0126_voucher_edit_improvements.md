# R-0123 / R-0124 / R-0125 / R-0126: 伝票編集画面の改善4件

本番フィードバック（id=29,30,31,32）由来。2026-08-29 `/readyoubou`バッチで仕様化。

## R-0123: 案件から新規伝票作成した時に案件が引き継がれない

### 現状（調査結果）
`ProjectDetail.tsx`の「＋見積作成」「＋売上作成」ボタンは`/vouchers/new?project_id=...&customer_id=...&type=...`へ遷移しており、`VoucherEdit.tsx`もこのクエリを`defaultValues`へ反映する実装が既にある（`initProjectId`/`initCustomerId`）。コード上は正しく動作するはずだが、本番フィードバックで「案件が空欄になる」報告がある。

### 受け入れ条件
- 実際に本番相当の手順（案件詳細→＋見積作成 / ＋売上作成）で再現するか確認する
- 再現する場合: 原因を特定し修正する。候補: `useProjects()`のロード前に`<select>`がレンダリングされ選択状態が失われる、`customer_id`が空/nullの案件で得意先必須バリデーションに引っかかり体感的に「案件が引き継がれていない」ように見える、等
- 再現しない場合: 現状の実装で仕様を満たしていることをテストで固定し、「再現せず」として記録する
- いずれの場合も回帰テスト（vitest）を追加する

## R-0124: 「原価から売値を設定」ボタンの丸め

### 現状
`ProfitRateBar.tsx`の`applyProfitRate()`が原価÷(1-利益率)で売値を算出し、`Math.ceil`のみで整数化している（例: 123,456円などの半端な値になる）。

### 要望
算出された売値を **100円単位で四捨五入**する（1の位・10の位は必ず0にする）。例: 12,345円→12,300円、12,350円→12,400円。

### 受け入れ条件
- `applyProfitRate()`内で算出する各売値（money型区分の`sellVal`、time型由来でmergeする`laborSell`、固定列モードの`lineTotal`）すべてに100円丸めを適用する
- 丸め関数は`voucherCalc.ts`に`roundToHundred(value: number): number`として新設し、既存の`Math.ceil`丸めロジックの後段に適用する形にする（原価計算そのもの・利益率計算は変更しない）
- `voucherCalc.test.ts`にテストを追加（例: 12345→12300、12350→12400、12399→12400、0→0）

## R-0125: 労務単価のデフォルト値を設定画面で管理

### 現状
`VoucherEdit.tsx`の`defaultLine.cost_labor_rate`は`0`固定。新規伝票の明細行を作るたびに毎回手入力している。

### 要望
`AppSettings`（設定画面、ローカル設定・`AppSettingsContext`）に「労務単価のデフォルト値」を追加し、新規伝票の明細行作成時（初期行・行追加の両方）に自動入力されるようにする。

### 受け入れ条件
- `AppSettingsContext.tsx`の`AppSettings`型に`defaultLaborRate: number`を追加（デフォルト値は現状の後方互換のため`0`、既存の`localStorage`データに欠けていてもDEFAULTSで補完する）
- `pages/AppSettings.tsx`に入力欄を追加（既存の`hoursPerDay`等と同様のUIパターン）
- `VoucherEdit.tsx`で新規伝票（`isNew`）の初期行・追加行の`cost_labor_rate`に`settings.defaultLaborRate`を適用する（既存伝票の編集・保存済み明細の値は変更しない）
- テスト追加（AppSettingsContextのデフォルト値マージ、VoucherEditの新規行への反映）

## R-0126: 売上に引用済みの見積は編集不可にする

### 現状
`VoucherEdit.tsx`の`canEdit`は`['draft','submitted','approved'].includes(status)`のみで判定しており、見積が売上に変換済みかどうかは考慮していない。変換先一覧は`voucher.converted_sales`（既存フィールド、非空なら変換済み）で判定可能。

### 藤田晴樹さんの決定（2026-08-29）
AccessTateguと同じ挙動に揃える。売上へ変換済みの見積伝票は編集不可（閲覧のみ）にする。

### 受け入れ条件
- フロント: `voucher.voucher_type === 'estimate' && (voucher.converted_sales?.length ?? 0) > 0` の場合、`canEdit`をfalseにし、`editBlockReason`に「売上に引用済み」等の分かりやすい文言を表示する
- バックエンド: `api/routes/vouchers.php`のPUT（明細追加・更新含む）でも同条件のガードを追加し、API直叩きでも編集できないようにする（フロントのみの防御にしない）
- 既存の「請求済み」「無効化済み」の編集不可表示・ガードとは独立して追加する（既存の判定を壊さない）
- PHPテスト・vitest双方に回帰テストを追加する
