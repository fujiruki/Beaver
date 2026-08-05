# R-0085: 案件ステータスのマスタ化（設定画面から追加・編集・並び替え可能に）

## 背景

R-0080フィードバック（id=4、2026-08-05）より。

> 案件一覧でステータス順に並べ替えしようとした時、その並びの順番が工程の順番に並んでいてほしい、それと、ステータスの最後に「キャンセル」も追加したい。

指揮役からの追加確認（口頭）: ステータス名は今回「キャンセル」を追加するだけでなく、今後も設定画面から変更・追加・編集できるようにしてほしい。

## 関連して見つかった既存の不具合

`api/routes/projects.php` に `p.status != 'cancelled'`（110行目、`/projects/sync`）、`WHERE p.status != "cancelled"`（236行目、一覧）、`UPDATE projects SET status = "cancelled"`（345行目、DELETE=論理キャンセル）という**英語**の `'cancelled'` 判定が既に存在するが、実際の案件ステータス値は`frontend/src/types/project.ts`の`ProjectStatus`型の通りすべて**日本語**（`問い合わせ`/`見積済`/`受注済`/`進行中`/`納品済`/`請求済`/`完了`）であり、`'キャンセル'`はどこにも存在しない。つまり案件の「削除」操作（DELETE `/projects/{id}`）は実際には物理削除ではなく`status`を`'cancelled'`に書き換える論理キャンセル方式だが、この値がフロントエンドの`statusLabel`/`statusColor`マップ（`ProjectList.tsx`）に存在しないため、削除済み案件は一覧で生の`"cancelled"`という英語表示になってしまう（表示は`ProjectList.tsx`の`{p.status}`フォールバック分岐）。今回`'キャンセル'`を正式な値として導入し、この3箇所の`'cancelled'`を`'キャンセル'`に統一する。

## 設計方針

`sales_categories`（売上種別マスタ、`api/routes/sales_categories.php`・`frontend/src/pages/SalesCategorySettings.tsx`・`frontend/src/api/salesCategories.ts`）と全く同じパターンを、案件ステータス用に新設する。**既存の`projects.status`列はTEXT型のまま変更しない**（ステータス名の文字列をそのまま保存。`sales_category_id`のような数値FKにはしない。既存データの変換・移行が不要になり、本番SQLite 3.7.17でのマイグレーションリスクを避けられる）。

### DBスキーマ（migration 023）

```sql
CREATE TABLE IF NOT EXISTS project_statuses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

既存の7値 + 新規「キャンセル」をseedする（sort_order 1〜8、この順）:
`問い合わせ`, `見積済`, `受注済`, `進行中`, `納品済`, `請求済`, `完了`, `キャンセル`

### バックエンド

- `api/routes/project_statuses.php` を新規作成し、`api/routes/sales_categories.php` と同じCRUD（GET一覧・POST新規・PUT更新・DELETE）を実装する
  - DELETEは、`projects.status = (削除対象のname)` の件数を確認し、1件以上使用中なら409エラーで拒否する（`sales_categories.php`の`vouchers.sales_category_id`チェックと同じ考え方だが、こちらはIDでなくname文字列で照合する点に注意）
- `api/index.php` に `project-statuses` ルートを登録する
- `api/routes/projects.php` の3箇所（110, 236, 345行目付近）の `'cancelled'` を `'キャンセル'` に修正する
- 案件一覧のstatusソート（`resolveSortClause`の`status`ホワイトリスト項目、263行目付近）を、`p.status`のテキスト順ではなく `project_statuses` を`LEFT JOIN`した`sort_order`順にする（`LEFT JOIN project_statuses ps ON ps.name = p.status`、ホワイトリストの`'status' => 'ps.sort_order'`に変更）

### フロントエンド

- `frontend/src/api/projectStatuses.ts` を新規作成（`salesCategories.ts`と同じ構造のTanStack Queryフック: `useProjectStatuses`/`useCreateProjectStatus`/`useUpdateProjectStatus`/`useDeleteProjectStatus`）
- `frontend/src/pages/ProjectStatusSettings.tsx` を新規作成（`SalesCategorySettings.tsx`と同じUI: 一覧表示・並び順編集・新規追加・削除）。`App.tsx`に`settings/project-statuses`ルートを追加し、`AppSettings.tsx`に遷移ボタンを追加する（`sales-categories`の行と同じパターン）
- `frontend/src/types/project.ts` の `ProjectStatus` 型を、固定ユニオン型から `string` へ変更する（設定画面で値が増減するため）。影響する既存ファイル（`ProjectList.tsx`, `ProjectDetail.tsx`, `Dashboard.tsx`, `VoucherList.tsx`, `VoucherEdit.tsx`, `VoucherHeader.tsx` 等、`ProjectStatus`を参照する全箇所）を確認し、コンパイルが通るよう調整すること
- `frontend/src/pages/ProjectList.tsx` の `statusLabel`/`statusColor`（固定Record）は、既存7値分の色分けはそのまま活かしつつ、未知のステータス名（新規追加分など）には既定の色（例: `bg-slate-100 text-slate-600`）にフォールバックするようにする
- `frontend/src/pages/ProjectDetail.tsx` の案件ステータス選択欄（`<select>`等）を、ハードコードされた選択肢ではなく `useProjectStatuses()` から取得した一覧（`is_active`のもののみ、`sort_order`順）を選択肢として表示するようにする

## 受け入れ条件

1. 案件一覧をステータスでソートすると、`問い合わせ→見積済→受注済→進行中→納品済→請求済→完了→キャンセル`の工程順（`project_statuses.sort_order`順）で並ぶこと
2. `/settings/project-statuses` 画面から、ステータスの新規追加・名前編集・並び順編集・削除ができること（使用中のステータスは削除時409エラー）
3. 案件詳細のステータス選択欄が、設定画面で追加したステータスも選択肢に表示すること
4. 案件のDELETE（論理キャンセル）操作後、案件一覧に「キャンセル」という日本語ラベルで正しく表示されること（現状の"cancelled"という英語生表示バグが解消されること）
5. 既存のPHPテスト・vitestが壊れないこと。新規ファイル・変更箇所にTDDでテストを追加すること
6. `npm run build`が通ること（型変更の影響を全て解消すること）

## 非スコープ
- ステータスごとの色を設定画面から変更できるようにはしない（既存7色は固定、新規追加分は既定色）
- 他マスタ（建具台帳ステータス等）への同パターン展開は今回やらない
