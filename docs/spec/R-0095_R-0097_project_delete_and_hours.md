# R-0095 / R-0097: 案件の完全削除・工数目安

## 背景
R-0080フィードバック（id=11、2026-08-05 07:32）より。

## R-0095: 案件編集画面に完全削除ボタン

> 案件編集画面において、最後に完全削除ボタンをつくってほしい。

指揮役からの確認（2026-08-05）: 伝票が紐づいている案件も削除可能にする方針（赤色の強い警告を出した上で）。

### 安全設計（重要）
伝票（見積・売上）を巻き込んで完全削除すること自体は許可するが、**その伝票が既に請求書（`invoice_vouchers`）に紐づいている場合は完全削除を拒否する**（409エラー、「請求書に紐づく伝票があるため完全削除できません」）。理由: 請求・入金という会計記録を巻き込んで消してしまうリスクが実務上大きいため、未請求の伝票までは削除対象にするが、既に請求書に載っている伝票がある案件は保護する。

### バックエンド
- `DELETE /projects/{id}?hard=1` （既存の`DELETE /projects/{id}`は現状通りソフトキャンセル＝status='キャンセル'のまま維持し、`hard=1`クエリパラメータ指定時のみ完全削除処理に分岐する）
- 完全削除処理:
  1. `SELECT COUNT(*) FROM invoice_vouchers iv JOIN vouchers v ON v.id = iv.voucher_id WHERE v.project_id = ?` が1件以上なら409で拒否
  2. 対象案件の`vouchers`に紐づく`voucher_lines`・`voucher_line_costs`・`voucher_line_prices`等の明細行を削除
  3. 対象案件の`vouchers`を削除
  4. `project_images`の行を削除（可能であれば`uploads/projects/{id}/`配下のファイルも削除。失敗してもDB削除は継続してよい）
  5. `projects`の行自体を削除
  6. トランザクション（`$pdo->beginTransaction()`〜`commit()`）で1〜5を一括処理し、失敗時はrollbackする

### フロントエンド
- `frontend/src/pages/ProjectDetail.tsx` の一番下（編集時のみ）に「完全削除」ボタンを赤系の目立つスタイルで追加する
- クリックすると、赤背景・太字警告文（「この操作は取り消せません。案件に紐づく伝票・明細も全て完全に削除されます。」等）を表示するカスタム確認モーダルを開く（ブラウザ標準の`confirm()`ではなく、既存の`NewCustomerModal`等と同様の自作モーダルコンポーネントにする）
- モーダルの「完全に削除する」ボタンで`DELETE /projects/{id}?hard=1`を呼び出す。409（請求書紐づきあり）の場合はエラーメッセージをそのまま表示する
- 成功したら案件一覧へ遷移する

## R-0097: 案件の工数目安（時間）

> 各案件について、およそ何日でできそうか目安工数を入力する機能を作ってほしい。少数１位まで入力可能で、1なら1時間、0.5なら30分、8なら8時間、40なら5日間かかるということ、案件自体に直接入力があればその数値、でも最新の見積伝票があれば、その伝票の中のかかる時間が集計されてればそれがそのまま使える数値ですよね？それが反映されるのがいいな。案件一覽にもその工数プロパティが表示されてほしい。つまり問い合わせから進行中のものの合計が何日になっているかを考えると、何日間は仕事が埋まっていると考えれるわけだ。そういう表記も行いたい。ダッシュボードに。

指揮役からの確認（2026-08-05）: 見積伝票の集計値（`estimated_factory_hours`＋`estimated_site_hours`の合計）があればそれを優先し、手動入力は伝票が無い（集計値が0の）案件のみ使う。

### DBスキーマ（migration追加）
`projects`テーブルに`manual_estimated_hours REAL`（NULL許容）列を追加する。

### バックエンド
- `api/routes/projects.php`のPOST/PUT許可フィールドに`manual_estimated_hours`を追加する
- 案件詳細GETのレスポンスに、既存の`estimated_factory_hours`/`estimated_site_hours`（伝票の`voucher_lines`から集計、既存ロジックのまま）に加え、`effective_estimated_hours`（実効工数目安、時間単位）を計算して含める:
  - `estimated_factory_hours + estimated_site_hours > 0` の場合はその合計値
  - そうでなければ`manual_estimated_hours`（NULLなら`null`）
- 案件一覧GETのレスポンス各行にも同じ考え方で`effective_estimated_hours`を含める（一覧はページングされるため、`voucher_lines`集計は該当ページの案件IDに絞ったサブクエリ/JOINにする。パフォーマンスに配慮すること）
- 工数（時間）から日数への変換は、`AppSettings`の`hoursPerDay`（1日あたり時間、フロントの`useAppSettings()`で取得できる設定値、既存の`ProjectDetail.tsx`の`factoryDays`計算と同じ考え方）を使う。バックエンドでは時間のまま返し、日数換算はフロントエンドで行う

### フロントエンド
- `frontend/src/pages/ProjectDetail.tsx`: 見積伝票由来の集計工数（`estimated_factory_hours + estimated_site_hours`）が0より大きい場合は、工数欄を「見積伝票から自動計算: X時間（Y日）」という読み取り専用表示にする。0の場合は`manual_estimated_hours`を小数第1位まで入力できる数値欄にする
- `frontend/src/pages/ProjectList.tsx`: 「工数目安」列を追加し、`effective_estimated_hours`を日数換算（`hoursPerDay`で割る）して「X.X日」のように表示する（`hoursPerDay`はAppSettingsから取得）
- `frontend/src/pages/Dashboard.tsx`: ステータスが「問い合わせ」〜「進行中」（`project_statuses`の`sort_order`で`完了`・`キャンセル`より前の全ステータス）の案件について、`effective_estimated_hours`の合計を日数換算し、「稼働予定 XX日分の案件が進行中です」のような形で表示するカードを追加する

## 受け入れ条件（共通）
1. 完全削除ボタンで、請求書に紐づく伝票が無い案件は伝票ごと完全に削除できる
2. 請求書に紐づく伝票がある案件は完全削除が409で拒否され、理由がUIに表示される
3. 完全削除前に赤色の目立つ警告付き確認モーダルが表示される
4. 見積伝票がある案件は工数目安が伝票集計値から自動表示され、無い案件は手動入力できる
5. 案件一覧に工数目安（日数換算）の列が表示される
6. ダッシュボードに、進行中案件群の工数目安合計（日数換算）が表示される
7. 新規・変更箇所にTDDでテストを追加すること。既存テストを壊さないこと
8. `npm run build`が通ること、`bash .claude/regression-suite.sh`がexit 0であること
