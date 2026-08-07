# R-0106 / R-0107: 案件一覧の工数目安右揃え・複合ソートのlocalStorage永続化

## R-0106: 工数目安列を右揃えに

### 背景
R-0080フィードバック（id=19、2026-08-07 07:10）より。

> 工数目安は右揃え表示にしてほしい

### 対象
`frontend/src/pages/ProjectList.tsx`の列定義（`effective_estimated_hours`列）

### 修正内容
`{ key: 'effective_estimated_hours', label: '工数目安', render: ... }`に`align: 'right'`を追加する。

### 受け入れ条件
- 案件一覧の「工数目安」列のヘッダー・値がともに右揃えで表示される

---

## R-0107: 案件一覧の複合ソートが他画面経由のナビゲーションで消える（バグ）

### 背景
R-0080フィードバック（id=20、2026-08-07 07:21）より。

> 案件一覽のソートをしても、伝票一覽を開いてから案件一覽に戻るとソートが消えている。列幅は希望通り維持されている。これはバグです。ほかの一覽がある画面でも同じでしょう。修正して

### 調査結果（指揮役、2026-08-07）
`CustomerList.tsx`/`TateguItemList.tsx`/`VoucherList.tsx`/`InvoiceList.tsx`は`DataTable.tsx`の`useSortState(tableId, defaultSort)`フックを使っており、このフックは**localStorage（`SORT_STORAGE_PREFIX + tableId`）を最優先で読み込み、URLクエリはlocalStorageが空のときのみのフォールバック**という優先順位になっている（`loadSort()`関数を参照）。そのため、サイドバーの別リンクを経由してURLクエリがリセットされても、localStorageに保存済みのソートが復元される。

一方`ProjectList.tsx`の複合ソート（`sortKeys`、R-0092で追加）は**URLクエリのみ**で管理されており（`useState(() => parseSortKeys(...))`、localStorageへの保存処理が一切ない）、サイドバー経由でURLクエリがリセットされるとソート情報が完全に失われる。

列幅（`useColumnWidths`）は常にlocalStorageへ保存されるため影響を受けず、「列幅は維持されるのにソートだけ消える」という報告内容と一致する。

**他4画面（得意先・建具台帳・伝票・請求書）は`useSortState`のlocalStorageフォールバックにより、実際にはこの問題は発生しない**（ユーザーの「他の画面も同じでは」という推測は、コード確認の結果、案件一覧固有の問題と判明した）。

### 修正方針
`DataTable.tsx`に、複合ソート版の永続化フック`useMultiSortState(tableId, defaultSortKeys?)`を追加する。既存の`useSortState`と対になる設計とし、同じ`SORT_STORAGE_PREFIX + tableId`キーを使うが、値は`SortState[]`（配列）として保存・復元する（`useSortState`の単一`SortState`形式とは別のJSON形状になるため、保存先のtableIdが重複しないよう注意。`projects`は現在このキーを使っていないため衝突は無い）。

優先順位は既存の`useSortState`と同じにする: **localStorageが最優先、URLクエリはlocalStorageが空のときのみのフォールバック**。

`ProjectList.tsx`側:
- `const [sortKeys, setSortKeys] = useState(...)` を `useMultiSortState('projects', parseSortKeys(searchParams.get('sort'), searchParams.get('order')))` に置き換える
- `handleMultiSortChange`内で、このフックが返すsetter（localStorageへの保存を内包）を呼び出す。既存の`syncUrl`によるURL同期はそのまま維持する（URL共有・リロード復元用途は引き続き必要）

検索語（`q`）・ページ番号（`page`）は今回のスコープ外（他4画面もソートのみlocalStorage永続化しており、検索語・ページはURLのみで意図的にフレッシュリセットされる設計のため、それに合わせる）。

### TDD必須
- `useMultiSortState`のテスト: 初期値としてlocalStorageに保存済みの配列がある場合はそれが優先されること、無ければ渡された`defaultSortKeys`（URL由来）が使われること、setter呼び出しでlocalStorageへ保存されること
- `ProjectList`の統合テスト（既存テストがあれば拡張）: ソート変更→別のtableId相当の状況を模してから再マウント→localStorageから復元されることを確認する（既存の`ProjectList`系テストファイルの構成を踏襲する）

### 受け入れ条件
1. 案件一覧でソートを変更した後、サイドバーの別画面（例: 伝票）を開いてから再度サイドバーの「案件」をクリックして戻っても、ソート状態が維持されている
2. リロード時のソート復元（既存動作）が引き続き機能する
3. 既存のR-0091/R-0092関連テスト・回帰スイートが通る
