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

## 5. ~~R-036: frontend ビルドエラー（型エラー）~~ ✅ 解決済み（2026-06-24）

`AppSettings.tsx:156` は `as unknown as Record<string, string>` キャストで解消済み。`tsc -b` exit=0、R-065/A修正のデプロイ時に `npm run build`（tsc込み）成功で確認。

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

## 8. ~~割引明細の消費税ベース不一致（B）~~ ✅ 解決済み（2026-06-24）

伝票合計計算で「割引を税の課税ベースから引くか」がフロントとバックエンドで食い違っている。

### 現状（2026-06-24 調査・実コード/実データ確認済み）
- フロント `frontend/src/lib/voucherCalc.ts`: `課税ベース = 課税合計 − 割引合計`（割引後に課税）
- バックエンド `api/routes/vouchers.php` `recalcVoucher`: 割引を引かず gross の課税合計に課税（`total` でのみ割引を減算）
- 例（税抜・課税10万/割引1万）: フロント 税額9,000/合計99,000 vs バックエンド 税額10,000/合計100,000（1,000円差）
- 注: A修正（内税丸め一本化, 2026-06-24）でinclusive分岐はFE/BEとも「割引後に課税」へ揃えた。**残るBの不一致はexclusive分岐のみ**。

### 現状の実害
- Access同期伝票（本番5,777件中の割引付き887件）は `tax_amount=0` で `recalcVoucher` を通っておらず、Access値を保持＝**現状は無傷**。
- Beaver内で新規作成・編集した伝票でのみ表面化する潜在バグ。

### 確定した正本（Access実コードで確認）→ 一本化済み
- **税額は割引前の課税小計に課税、値引は合計でのみ減算**（外税: `floor(課税小計×税率)`／内税: `floor(課税小計税込×税率/(1+税率))`）。出典 `AccessTategu/src/forms/fsub売上.frm:2648`・`frm売上.frm:1600`。詳細 `AccessTategu/docs/wiki/knowledge/tax_calculation.md`。
- ⇒ **BEが正・FEが誤**だった。FE `voucherCalc.ts`(exclusive/inclusive)と BE `vouchers.php`(inclusive; A修正で割引後にしていた分を是正)を正本へ一本化。exclusive BE は元から正。
- 同期伝票（割引付き887件）は `recalcVoucher` 未通過(tax_amount=0)で無傷＝データ移行不要。Beaver内で作成・編集した伝票でのみ影響。
- テスト: `frontend/.../voucherCalc.test.ts`（割引 exclusive/inclusive）、`api/tests/test_recalc_inclusive.php`（T-05改・T-07追加）。

### 関連
- R-065 と同時調査した内税丸めバグ（A: 910 vs 909）は別途修正。本件はその派生。

## 9. ~~test_sync.php が全ケース500（既存破損）~~ ✅ 解決済み（2026-06-24）

`api/tests/test_sync.php` が全アサーション500（`vouchers.consumption_tax_type` 等 NOT NULL列への明示NULLバインド）。

- 修正: `sync_helpers.php` で変数はnull維持、INSERTのVALUES句で `COALESCE(:x, 既定値)`、upsertのDO UPDATEは生バインド `:x` 参照（`COALESCE(:x, x)`）に分離。再同期で未送信列が既存値を保持するよう設計。
- 初回修正で「再同期時に既存値をDEFAULTで上書き」する**本番データ破壊の回帰**を一度混入→指揮役が実コード精査で検出→回帰テスト2件(R-066-保持)を赤→緑で固定。test_sync 28/0。

---

## 13. ~~R-027b: 本番の日次バックアップが停止している疑い~~ ✅ 解決済み（2026-07-14）

2026-07-06 のデプロイ列車（migration 018/019/020 本番適用）作業中に発覚。SSH遮断中のためFTPS＋一回限りPHPスクリプト（`shell_exec`経由でcrontab確認・修正）で調査・復旧した。

### 症状（確定）
- `backup.log` の最終行は2026-06-09 03:00（それ以降のcron実行は無音失敗）
- crontab自体は生きていた（`0 3 * * * .../Beaver/backup.sh`）。原因はスクリプト側の消失

### 根本原因
`backup.sh` は Beaver ルート直下に置かれ、かつ **git管理外**（R-027完了時にSSHで直接設置しただけ）だった。`upload.ps1` のデプロイコマンド

```
find . -maxdepth 1 ! -name 'api' ! -name '.' ! -name '$archiveName' ! -name '*.sqlite' -exec rm -rf {} +
```

はルート直下で `api/` と `*.sqlite` 以外を全削除する仕様のため、2026-06-09以降の最初のデプロイ実行時点で `backup.sh` が消えていた（api/以下ではないため保護対象外）。

### 復旧内容
1. `api/backup.sh` として**gitで正式に追跡**する形で再構築（`api/`配下はデプロイ時に保護されるため今後は消えない）
2. crontabを `0 3 * * * /bin/bash .../Beaver/api/backup.sh` に更新（`/bin/bash`経由の起動にすることで、`upload.ps1`のchmodステップが全ファイルを644に戻しても実行できるようにした。実行ビット依存を排除）
3. 30日ローテーションの対象を自動生成ファイル名（`database_YYYYMMDD_HHMM.sqlite`）のみに限定し、手動退避ファイル（`_pre_xxx`等のサフィックス付き）を誤削除しないよう安全化
4. 本番でテスト実行し、`backup.log`への追記・新規バックアップファイル生成・古い自動生成分3件のみのローテーション削除（手動退避分は保持）を確認済み

### 今後の運用
- `api/backup.sh` はリポジトリのソースが正本。変更時は通常デプロイで反映される
- 同種の「ルート直下・git管理外ファイルが次デプロイで消える」問題は他にも起こりうるため、本番専用ファイルを置く場合は必ず `api/` 配下＋git管理下にすること

---

## 14. R-072-B: projectsテーブルのdev/prodスキーマ乖離の棚卸し（Beaver側）

2026-07-06 R-071 対応・本番migration適用作業中に発覚。

### 症状
- R-071修正で追加した migration 020（`order_date`/`owner_name`/`general_contractor_name`/`site_contact` の4カラム追加）を本番に適用しようとしたところ、**本番の `projects` テーブルには既にこの4カラムが存在していた**（手動追加の痕跡と推定）
- 一方 dev側の `api/schema.sql` と `api/migrations/*.sql`（020適用前）にはこれらのカラムが一切記録されていなかった
- つまり本番と開発でスキーマが逆方向に乖離していた（本番が先行し、devのmigration履歴に記録が無い状態）。migration 020 は dev にのみ適用し、本番は元々充足済みのため未適用（今回は実害なし）

### 優先度
【中】。今回は実害なく発覚したが、同種の記録漏れが他テーブルにもある可能性があり、本番デプロイ作業のたびに同様の食い違いに遭遇するリスクがある。

### 対処方針（案）
- 本番 `projects` テーブルの `PRAGMA table_info` と dev の `schema.sql`＋全migration適用後のスキーマを突合し、他に記録漏れの列・テーブルがないか棚卸しする
- 本番手動変更の経緯（いつ・誰が・なぜ追加したか）が追跡できるドキュメントが無いため、可能な範囲で経緯を確認し、今後同様の手動変更をする際は migration ファイルとして必ず記録する運用を徹底する

---

## 15. R-076: 「Beaverと同期」統合のBeaver側対応（2026-07-07 計画承認済み）

Access側の統合同期ボタンに対応するBeaver側タスク群（詳細: AccessTategu側R-076と共通計画）:
- B1-1: /vouchers/sync の updated_at/last_synced_at をJST正規化（SQLiteのCURRENT_TIMESTAMPがUTCであることを本番実測で確認済み）
- B1-2: syncVoucherUpsert 成功時に vouchers.last_synced_at をセット（エコー競合の抑止）
- B2-1: /vouchers/sync 応答へヘッダ項目追加（trade_type/description/print_*等＋customer_access_no）
- B2-2: lines_mode='replace'（競合解消の明示採用時の明細フル置換）
- B2-3: PATCH /vouchers/{id}/access-link（Beaver発伝票のaccess_voucher_id書き戻し）
- B3-1/B3-2: GET /customers/sync 新設（完全一致ルーティングガード必須）＋customers.last_synced_at
- B4-1: mergeSyncedLines（access_line_id行単位マージ・edited_in_beaver保護、R-066(c) Phase2本丸）

## 16. R-078: 建具台帳の型定義とDBカラムの不整合（2026-07-08 DataTable移行中に発見）

`TateguItem`型の `item_code`/`spec`/`unit` フィールドが実DBと不一致（`PRAGMA table_info(tategu_items)` で確認: 実在は `code` のみ、`spec`/`unit` 列は存在しない）。建具台帳一覧の「品名コード・仕様・単位」表示は元から空欄になっているはず。型定義の修正 or カラム追加の仕様判断が必要。DataTable移行ではソート対象から除外済み。

---

## 19. R-0093: PHPテスト用一時SQLiteファイルの競合対策（バックログ、品質改善・低優先）

2026-08-05、複数のCodex実装・指揮役の検証コマンドを並行実行した際に、`test_sync.php`/`test_list_sort.php`等がランダムに失敗する事象を確認（`api/tests/test_projects.sqlite`等、テストファイルごとに固定名の一時SQLiteを使っているため、同時実行時に競合する）。単独実行時は問題なし。テストの一時DBファイル名をプロセスID等でユニーク化すれば解消できる見込み。実害は「並行実行時のみ・単独再実行で解消」程度で緊急性は低い。

## 18. R-0084: 検索の複数プロパティ対応 Phase2（バックログ、未着手）

R-0083（得意先 + ComboSelect共通化）のPhase1完了後の横展開。案件一覧・建具台帳一覧・伝票一覧・請求書一覧など他の検索画面にも同じ複数プロパティ検索パターンを展開する。検索対象プロパティをUIから選べるようにする案も含め、着手時に仕様化する。詳細: `docs/spec/R-0083_search_multi_property.md` の「Phase 2」節。

---

## 17. R-079: 見積から売上を「引用して売上」で作成した際、同じ案件に属すること（2026-07-14 藤田晴樹確認要望）

「引用して売上」（R-065）で作成した売上伝票は、元の見積伝票と同じ案件に属しているべき、という仕様要望。

### 調査結果: ✅ 現状すでに満たされている（コード確認済み、2026-07-14）

- Beaver側: `api/routes/vouchers.php` の `POST /vouchers/{id}/convert-to-sales`（588〜629行目付近）で、新規売上伝票の`project_id`は元見積の`project_id`（`$orig['project_id']`）をそのまま引き継いでコピーしている
- Access同期側: `Df_Beaver連携.bas`（1356行目）で、Beaver発の新規伝票取込時（R-076 A2-3）も`beaverJson`の`project_id`を`案件番号`列にマッピングしており、同期経路でも欠落しない
- 見積→売上は完全ディープコピー方式（一度きりのコピーで、以降は独立管理）のため、変換後に元見積の案件を変更しても売上側は追従しない。これは仕様通り（伝票ごとに独立した記録を残す設計）

### 今後の扱い
新規のバグ・要望ではなく、既存仕様として保証されている点の確認記録。将来この経路を変更する際の回帰防止の参考にする。
