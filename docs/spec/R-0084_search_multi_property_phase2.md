# R-0084: 検索の複数プロパティ対応 Phase 2（横展開）

## 背景
R-0083（Phase 1、得意先検索＋ComboSelect共通化）完了後のバックログ。藤田晴樹さんより2026-08-11、会話内で明示的に着手指示。

対象は建具台帳一覧・伝票一覧・請求書一覧。案件一覧は既にR-0090/R-0091で`buildMultiColumnSearchClause`（かな正規化＋空白区切りAND検索）による複数プロパティ検索（`project_code`/`name`/`customer_name`）とURL状態保持を実装済みのため、今回のスコープ外（対応不要）。

## 現状調査（指揮役、2026-08-11）
- **建具台帳一覧（TateguItemList）**: 検索ボックスは既にあるが、対象は`name`/`code`のみ（`api/routes/tategu_items.php:154-158`）。`buildMultiColumnSearchClause`未使用の古い実装。
- **伝票一覧（VoucherList）**: 自由文字検索ボックスが**存在しない**（得意先・案件のComboSelectフィルタ、種別・ステータスのプルダウンフィルタのみ）。
- **請求書一覧（InvoiceList）**: 自由文字検索ボックスが**存在しない**（年・月・得意先フィルタのみ、ページネーションも無し＝`useInvoices`で全件取得）。

そのため、建具台帳は「既存検索の対象列拡張」だが、伝票一覧・請求書一覧は「検索ボックスの新規追加」を伴う。既存のプルダウン/ComboSelectフィルタは維持し、自由文字検索は**追加**する（置き換えない）。

## 修正方針

### 1. 建具台帳一覧（TateguItemList）
`api/routes/tategu_items.php`の検索条件（154-158行目）を`buildMultiColumnSearchClause(['name', 'code', 'description'], $_GET['q'])`に置き換える（`api/search_helpers.php`の既存ヘルパーを`require`して使う。かな正規化・空白区切りAND検索が自動的に効く）。フロントエンド（`TateguItemList.tsx`）の検索ボックスラベル・placeholderは「品番・品名で検索」のような文言があれば「品番・品名・仕様で検索」等に更新する（既存の文言を確認の上、必要な範囲で調整）。

### 2. 伝票一覧（VoucherList）
- バックエンド: `api/routes/vouchers.php`のリスト取得条件（518行目付近の`$where`組み立て）に、`$_GET['q']`があれば`buildMultiColumnSearchClause(['v.voucher_no', 'c.name', 'p.name', 'v.description', 'v.memo'], $_GET['q'])`を追加する。
  - **重要（R-0091と同種の既知バグを踏まないこと）**: ページネーション時のCOUNT用クエリ（527行目`SELECT COUNT(*) FROM vouchers v $where`）は現状`customers`/`projects`をJOINしていない。検索条件に`c.name`/`p.name`を含めると、このCOUNTクエリが「no such column: c.name」で500エラーになる（R-0091で一度発生した実際のバグと同一パターン）。COUNTクエリにも`LEFT JOIN customers c ON c.id = v.customer_id`・`LEFT JOIN projects p ON p.id = v.project_id`を追加すること。
  - ページネーション無し分岐（558行目付近、pageパラメータ無し時の全件取得）にも同じ検索条件を適用する。
- フロントエンド: `VoucherList.tsx`に検索ボックス（例:「伝票番号・得意先・案件・摘要で検索」）を追加し、`useVouchersPaged`の呼び出しに`q`パラメータを渡す。既存のIME対応パターン（`isComposingRef`、`onCompositionStart`/`onCompositionEnd`、他画面のR-0068/R-0070修正済みパターンを踏襲）を使うこと。R-0096パターン（`useSearchParams`でURL状態保持）にも対応する。

### 3. 請求書一覧（InvoiceList）
- バックエンド: `api/routes/invoices.php`のリスト取得条件（55-58行目`$where`組み立て）に、`$_GET['q']`があれば`buildMultiColumnSearchClause(['inv.invoice_no', 'c.name'], $_GET['q'])`を追加する（既に`LEFT JOIN customers c`済みのため、COUNTクエリの問題は無い＝そもそもこの一覧にはページネーション自体が無く、単一クエリで全件取得している）。
- フロントエンド: `InvoiceList.tsx`に検索ボックス（例:「請求書番号・得意先で検索」）を追加し、`useInvoices`の呼び出しに`q`パラメータを渡す。年・月・得意先フィルタと併用可能にする（AND条件）。R-0096パターンでURL状態保持にも対応する。

## TDD必須
- PHPテスト: `api/tests/test_tategu_items.php`（無ければ新規、既存があれば拡張）・`test_projects.php`と同様のパターンで`api/tests/`配下のvouchers/invoices向けテストファイルに、検索クエリ（`q`パラメータ）でヒットすること、ヒットしないこと、複数語のAND検索、ひらがな/カタカナ揺れでのマッチを検証するケースを追加する
- **`api/tests/test_sync.php`等、伝票一覧のページネーション+検索の組み合わせに対するテストを必ず追加する**（R-0091で実際に発生したCOUNTクエリのJOIN欠落バグの再発防止のため）。具体的には「`q`パラメータと`page`パラメータを同時に指定してもエラーにならないこと」を明示的に検証するテストケースを用意すること
- vitest: 各画面の検索ボックスのIME対応・URL状態保持・既存フィルタとの併用について、既存の類似テスト（ProjectList/CustomerListの検索テスト）を参考にテストを追加する

## 受け入れ条件
1. 建具台帳一覧で、品番・品名に加えて仕様（description）でも検索がヒットする
2. 伝票一覧に検索ボックスが追加され、伝票番号・得意先名・案件名・摘要・メモのいずれかにマッチする語で検索できる。既存のプルダウンフィルタ（種別・ステータス・得意先・案件）と併用できる
3. 請求書一覧に検索ボックスが追加され、請求書番号・得意先名のいずれかにマッチする語で検索できる。既存の年・月・得意先フィルタと併用できる
4. 検索語とページネーションを同時に指定してもエラーにならない（伝票一覧）
5. 全画面でひらがな/カタカナ揺れ・空白区切りAND検索が効く（`buildMultiColumnSearchClause`を使うため自動的に満たされるはず）
6. 既存のテスト・回帰スイートが通る
