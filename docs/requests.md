# 要望・リクエスト

## 1. R-025: BA連携 Phase 1（案件番号橋渡し、2026-06-05 確定）

藤田晴樹確定。AccessTategu との双方向同期基盤を構築する。**旧 Phase 7（AccessTategu 連携）はこの R-025 に統合・拡張。**

### 確定方針
| 項目 | 決定 |
|:--|:--|
| 案件マスタ権威 | Beaver 一本（projects テーブル） |
| Access キャッシュ更新 | Access 起動時に自動 + 手動「Beaver 案件取込」ボタン |
| Access 側 新規見積作成 | 残す（→ push back 必要） |
| 着手範囲 | Step A〜E 全部 |

### Beaver 側のスコープ
- **Step A**: `GET /projects/sync` API 追加（Access 用軽量フォーマット、案件番号 / 案件名 / 得意先番号 / ステータス / 更新日時）
- **Step E**: Access→Beaver push back 受信エンドポイント（伝票・発送済ステータス等の同期）

### AccessTategu 側のスコープ
- Step B: `tbl案件_cache` 追加 + 「Beaver 案件取込」ボタン + 起動時自動同期
- Step C: `tbl見積` / `tbl売上` / `tbl請求書` に `案件番号` 列追加（migration 010-012）
- Step D: 見積入力フォームに案件番号コンボボックス追加

### 旧 Phase 7（統合済み、参考）
- `api/migrations/009_customer_access_no.sql` — customers に access_customer_no 列追加（R-025 で再評価）
- `api/routes/customers.php` — 更新フィールド配列に追加
- `frontend/src/types/customer.ts` + `pages/CustomerDetail.tsx` — 入力 UI 追加

詳細仕様: `Projects/AccessTategu/docs/R-025_BA連携_詳細設計.md`（grill 反映済み）。

### 着手タイミング
AccessTategu の R-022（請求書発送済管理）完了済み（2026-06-06、HEAD: fe479fe）。R-025 設計確定（grill 反映済み）→ Step A から実装開始可能。

---

## 2. ~~R-027: Beaver の定時バックアップ機能~~ ✅ 完了（2026-06-07）

ConoHa の本番 Beaver に `backup.sh` 設置 + crontab 毎日 03:00 登録済み:
- スクリプト: `public_html/door-fujita.com/contents/Beaver/backup.sh`
- 出力先: `api/backups/database_yyyymmdd_HHMM.sqlite`
- 30 日ローテーション（find -mtime +30 -delete）
- ログ: `api/backup.log`
- crontab: `0 3 * * * /home/c6924945/.../Beaver/backup.sh`

異常検出（前日比サイズ激減等）は未実装。必要なら R-027b として別途。

---

## 3. R-034: Beaver validation 強化（2026-06-06 R-025 review で発覚）

R-025 Step E-Beaver の review で発覚。デプロイ前に対応した HIGH 修正（H1/H2/H3/M2）と別に、運用してから対応すべき MEDIUM 級の改善。

### 内容
- (a) **POST /vouchers/sync で customer_access_no 空が silent 許容される問題**: 過去伝票（project_id=NULL）モードでは `$accessCustomerNo === ''` 分岐により validation がスキップ → customer_id=NULL の伝票が無音で作成される。仕様確認の上、必須化するか過去伝票モード時のみ NULL 許容とする分岐を明示。
- (b) **GET /projects/sync ルーティング順の脆さ**: 現状の `isset($segments[1]) && $segments[1] === 'sync'` 判定は `/projects/sync/anything` を全件返却で誤通過させる可能性。`!isset($segments[2])` の完全一致チェックを追加。
- (c) **voucher_lines の validation 不足**: `insertSyncedLines` で `line_type` / `tax_category` / `quantity` / `line_total` の値検証なし。`line_type ∈ {normal, discount, ...}` / `tax_category ∈ {課税, 非課税, ...}` のホワイトリスト導入、`quantity >= 0` チェック。
- (d) **UPDATE 経路で lines を触らない仕様**: コメントには「INSERT 時のみ取り込み」とあるが、Access 側で明細が後で変更された場合に Beaver に反映されない盲点。仕様判断: 明示コメント化 or UPDATE 経路で `DELETE → INSERT` のフル置換に変更するかを決定。

### 優先順位
R-025 デプロイ後に着手。実害は限定的（不正データ流入リスクが小さい運用環境）。

---

## 4. R-035: Beaver /projects/sync pagination + access_voucher_no 重複対策（2026-06-06 R-025 review で発覚）

R-025 review の MEDIUM/LOW 級指摘。

### 内容
- (a) **GET /projects/sync が pagination/limit を持たない**: `updated_after` なし呼び出しで全件返却 → 案件数が増えると応答サイズが線形に膨れる。デフォルト `limit=1000` + `since_id` ベース cursor pagination を導入、または `updated_after` 必須化。
- (b) **syncVoucherUpdate / syncVoucherShipped が access_voucher_no 重複時に「最初の 1 件」を silent 更新**: `SELECT id FROM vouchers WHERE access_voucher_no = ?` に LIMIT なし → 先頭 1 件のみ更新で残りは取り残される。R-029 の access_voucher_id UNIQUE 制約で根本対処されるが、LIMIT 1 明示 + 複数ヒット警告ログ追加で防御的に。

### 優先順位
R-025 完了後・実運用で問題顕在化したら着手。

---

## 5. R-036: frontend ビルドエラー（型エラー）

R-025 デプロイ作業中に発覚（2026-06-07）。`npm run build` (`tsc -b && vite build`) で型エラー:

```
src/pages/AppSettings.tsx(156,42): error TS2345:
  Argument of type 'ColumnMapping' is not assignable to parameter of type 'Record<string, string>'.
  Index signature for type 'string' is missing in type 'ColumnMapping'.
```

R-025 とは無関係（既存コードの型整合性問題）。frontend ビルドが通らないため、本番には backend (api/) のみデプロイした状態。frontend の R-025 対応 UI（案件詳細などに `access_customer_no` 連携表示等）は未デプロイ。

### 対応
- `src/pages/AppSettings.tsx:156` の `ColumnMapping` 型に index signature を追加するか、呼び出し側を `Record<string, string>` に明示変換
- ビルド成功確認後、frontend をデプロイ（Youkan の deploy パターン参照）

### 優先順位
中。frontend 機能の本番反映には必須だが、AccessTategu↔Beaver の R-025 同期機能には影響しない。

---

## 6. R-038: 得意先マスタの双方向同期（2026-06-07 R-025 デプロイ後の追加要望）

R-025 では案件マスタのみ同期、得意先（customers ↔ tbl得意先M）は未同期。R-025 と同じパターンで実装する。

### Beaver 側のスコープ
- `GET /customers/sync` API 追加（R-025 Step A の `/projects/sync` 模倣）
  - クエリ: `updated_after` / `include_inactive`
  - レスポンス: 得意先 ID, 名前, アドレス, アクセス番号, 更新日時 等
- 必要なら `POST /customers/{id}/sync` でPush back 受信（双方向の場合）

### 設計判断要点（grill 必要）
- (a) tbl得意先M（既存 AccessTategu 権威）と tbl得意先_cache（Beaver ミラー）を分離
- (b) Beaver 権威に統一して tbl得意先M を tbl得意先_cache 化（影響範囲大）
- (c) 双方向同期、両側で編集可能

### 着手タイミング
R-037（案件管理 UI）と並行 or その後。

---

## 7. TateguDesignStudioとの連携

TateguDesignStudio（建具設計・積算ツール）で設計・積算した建具データを、Beaverの伝票明細に取り込めるようにする。

### 想定フロー
1. TDSで建具を設計→積算完了
2. Beaverの伝票編集画面で「TDSから取込」ボタン
3. TDSのAPIから建具データ（名前、原価内訳、数量）を取得
4. 伝票明細行に自動挿入（原価スナップショットとして）

### 優先順位
Phase 7（Access連携）完了後に着手。

## 8. 割引明細の消費税ベース不一致（B）— 要仕様確認

伝票合計計算で「割引を税の課税ベースから引くか」がフロントとバックエンドで食い違っている。

### 現状（2026-06-24 調査・実コード/実データ確認済み）
- フロント `frontend/src/lib/voucherCalc.ts`: `課税ベース = 課税合計 − 割引合計`（割引後に課税）
- バックエンド `api/routes/vouchers.php` `recalcVoucher`: 割引を引かず gross の課税合計に課税（`total` でのみ割引を減算）
- 例（税抜・課税10万/割引1万）: フロント 税額9,000/合計99,000 vs バックエンド 税額10,000/合計100,000（1,000円差）
- 注: A修正（内税丸め一本化, 2026-06-24）でinclusive分岐はFE/BEとも「割引後に課税」へ揃えた。**残るBの不一致はexclusive分岐のみ**。

### 現状の実害
- Access同期伝票（本番5,777件中の割引付き887件）は `tax_amount=0` で `recalcVoucher` を通っておらず、Access値を保持＝**現状は無傷**。
- Beaver内で新規作成・編集した伝票でのみ表面化する潜在バグ。

### 確認すべき仕様
- Access 正本の伝票単位の割引・消費税集計仕様（割引は税抜段階か税込段階か、課税ベースに含めるか）。`AccessTategu/src` の伝票/請求集計ロジックを調査。
- 確定後、フロント・バックエンドを正本に一本化し、必要なら既存Beaver作成伝票を再計算。

### 関連
- R-065 と同時調査した内税丸めバグ（A: 910 vs 909）は別途修正。本件はその派生。

## 9. test_sync.php が全ケース500（既存破損）

`api/tests/test_sync.php` が全アサーション 500。原因は `vouchers.consumption_tax_type` の NOT NULL 制約違反（`api/routes/sync_helpers.php:309`、テストDB由来）。

- 2026-06-24 確認。内税修正(A)前のコミット `bfebca2` でも同一に失敗＝A修正とは無関係の既存破損。
- 本番 `vouchers.consumption_tax_type` は DEFAULT '外税/伝票計' があるため本番実害なし。テスト/同期INSERT経路で `consumption_tax_type` を明示セットするか、テストDB初期化を見直す。
