# R-0120: Beaver-Youkan連携 B3（見積内訳の作業パッケージ公開）

計画書: `docs/2026-08-25_Beaver-Youkan連携開発計画.md`（§8 B3節）。
前提契約:

- B1（Beaver→Youkan読み取り契約・baseline_hours）: `docs/spec/R-0117_youkan_api_contract.md`
- B2（案件詳細のYoukan容量判定表示）: `docs/spec/R-0118_youkan_capacity_check_b2.md`（完了・本番デプロイ済み）

要望原文: `docs/requests.md` R-0120（藤田晴樹さん、2026-08-27）参照。

## 目的

Beaverの見積内訳（建具ごとの製作・取付工数など）を、Youkanが後で「作業パッケージ」としてサブプロジェクト分解できる形の安定した外部契約として公開する。B3ではYoukan側の実装（Y2）には踏み込まない。Beaver側は読み取り専用の追加フィールドを公開するのみ。

## 1. 現状調査（実装前に確認した事実）

### 1.1 見積明細の構造

`voucher_lines`（`api/schema.sql:191`）は伝票（見積/売上）の明細行1件＝1レコード。工数に関係するのは以下の固定列のみ:

| 列 | 意味 |
|---|---|
| `quantity` | 数量（INTEGER、既定1） |
| `cost_factory_hours` | 建具1台あたりの工場作業時間（REAL） |
| `cost_site_hours` | 建具1台あたりの現場作業時間（REAL） |
| `item_name` | 品名（TEXT(60)、空になりうる） |
| `updated_at` | 行更新日時（migration 019で追加。ADD COLUMN後はDEFAULT無しのためNULLがありうる） |

**1行に工場時間と現場時間が両方乗ることがある**（例: 1つの建具行に「製作8h・取付2h」を両方持たせる運用）。計画書の想定図（建具A 製作／建具A 取付を別行として書く例）は、実データでは**列で分かれる**のであって行では分かれない場合がある、という点が今回の最重要発見。

R-0119で導入された `voucher_line_costs`（動的カテゴリ内訳テーブル、`category_code`=`FACTORY_TIME`/`SITE_TIME`等）は表示・編集用の内訳ミラーであり、`api/routes/vouchers.php` の `PUT /vouchers/{id}/lines/{lineId}` は固定列（`cost_factory_hours`/`cost_site_hours`）とこのミラーテーブルを**同じリクエストで同時に更新する**（`saveLineCosts`）。B1のbaseline計算（`sumHoursByVoucherIds`）は一貫して固定列のみを参照しており、B3もこれに合わせて**固定列を正**とする（動的ミラーテーブルは参照しない）。

### 1.2 数量と単位工数の扱い

既存のbaseline計算（`sumHoursByVoucherIds`, `api/routes/list_helpers.php:108`）は `cost_factory_hours × quantity` と `cost_site_hours × quantity` を行ごとに掛けてから全行を合算し、最後に小数2桁で丸めている。B3のwork_package単位の工数もこれに合わせ、**行×工数種別ごとに `単位工数 × quantity` を計算してから小数2桁で丸める**。

既知の誤差: baseline_hoursは「全行合算してから1回だけ丸め」、work_packagesは「行×種別ごとに丸めてから提示」のため、丸め方式の違いにより**0.01h未満のごく僅かな差**が理論上生じうる（例: 複数行の端数が丸め位置をまたぐ場合）。実害はなく、Youkan側はこの程度の差を「矛盾」として扱わないこと（本書§5で許容範囲として明記）。

### 1.3 同一見積内で複数行が同種作業の場合

行単位・工数種別単位で独立したパッケージとして扱う。**ラベルが同じでも統合・合算しない**（例: 建具Aの行が2行あり両方「製作」を持つ場合、2つの独立したwork_packageになる）。理由: 統合するとYoukan側が「どの建具のどの作業か」を追跡できなくなり、B3の目的（段階分解の単位を提供すること）に反するため。

### 1.4 明細IDの外部ID適性

`voucher_lines.id`（AUTOINCREMENT、グローバルに一意）はBeaverネイティブな編集（`PUT /vouchers/{id}/lines/{lineId}`によるフィールド更新）では**不変**。行を削除して新規作成した場合や、AccessTategu同期の`lines_mode=replace`経路（`api/routes/sync_helpers.php:416` `replaceSyncedLinesFromPayload`）が動いた場合は、対象伝票配下の明細が**全削除→再INSERT**されるため、既存の`voucher_lines.id`は失われ新しいIDが振られる。

→ `voucher_lines.id` は「編集では安定・行の削除／全置換では非安定」という性質を持つ。B3の識別子はこれを前提に、**IDが変わったら「消えて新しいのが現れた」という形でそのまま表現する**（後述§3のidentity規則）。これは計画書§8が要求する挙動（「Youkanでは削除元パッケージを『Beaver側から消えたので要確認』とできる設計にする」）と一致する。

### 1.5 見積改訂・複製・削除・voidの扱い

Beaverには「見積改訂」を表す専用機能（版管理・複製ボタン等）は無い。運用は以下のいずれか:

- **同一伝票を編集**（行の値を書き換える）: `voucher_lines.id`は不変。→ work_packageも同じIDのまま工数だけ変わる
- **新しい見積伝票を別途作成**: B1の「計画基準見積」選定ルール（`voucher_date`降順→id降順で最新の非void・工数明細ありの1件）により、新しい伝票が自動的に基準に切り替わる。旧伝票のwork_packageは全て消え、新伝票のwork_packageが一括で現れる
- **見積をvoid化**: 計画基準見積の対象から外れる（`selectPlanningEstimateVouchers`が`status != 'void'`を要求）。次点の見積、なければmanual/noneにフォールバックし、baseline_hoursと同時にwork_packagesも切り替わる
- **建具複製（行複製、`frontend/src/pages/VoucherEdit.tsx`の「建具複製」ボタン）**: 新しい`voucher_lines`行が作られる。これは identity churn ではなく、実際に工数を持つ新しい行が増えたことを意味するため、新しいwork_packageとして正しく出現する
- **AccessTategu同期の`lines_mode=replace`**: 対象伝票の明細が全削除→再INSERTされる。**baseline対象の見積がこの経路で更新されると、その伝票配下のwork_package IDが同時に総入れ替えになる**（voucher_idは同じでもline idは総入れ替え）。運用上は稀（見積の同期は主にAccess側が正本のケースだが、Beaver作成見積が同期対象になるのは限定的）だが契約上明記する

いずれの場合も、Beaver側が「以前と同じ作業」であることを推測してIDを引き継ぐことはしない（要望前提4「Youkan側で名前照合させない」の裏返しとして、Beaver側も同一性を推測しない）。

### 1.6 baseline_hoursとの合計整合性

`baseline_source='estimate'`の場合のみ、work_packagesはbaseline_hours算出に使った**同一の計画基準見積**（`selectPlanningEstimateVouchers`で選定済みの1件）の明細から生成する。既存のbaseline計算処理を再実行して選定し直すのではなく、**同じ関数呼び出し結果を両方の算出に使い回す**ことで、選定ズレ（baselineとwork_packagesが別の見積を参照してしまう）を構造的に防止する。

`baseline_source='manual'`または`'none'`の場合、work_packagesは常に空配列`[]`。この場合、Youkan視点では「baseline_hours全体が未分解残量」となる（自然に整合する）。

work_packages合計とbaseline_hoursの差（§1.2の丸め誤差を除く）は、**Beaver側では検知・警告しない**。差が生じるのはbaseline算出対象の見積とwork_packages生成対象の見積が異なる場合のみだが、本設計では両者を同一関数呼び出しから導出するため通常は発生しない。万一の乖離はYoukan側が「未分解残量」または「超過」として扱う（計画書§8の方針どおり、Beaver側でダミーパッケージを作らない・baselineを書き換えない）。

## 2. 確定した契約: `work_packages` フィールド

`GET /integrations/youkan/projects` および `GET /integrations/youkan/projects/{id}` のレスポンスオブジェクトに、後方互換の追加フィールドとして `work_packages` 配列を追加する。既存フィールド（`baseline_hours`含む）は無変更。

```json
{
  "source": "beaver",
  "external_project_id": 123,
  "project_code": "P00123",
  "name": "○○様邸 建具工事",
  "customer_name": "○○様",
  "status": "受注済",
  "delivery_date": "2026-09-10",
  "baseline_hours": 20.0,
  "baseline_source": "estimate",
  "baseline_updated_at": "2026-08-25T09:00:00+09:00",
  "updated_at": "2026-08-25T09:00:00+09:00",
  "work_packages": [
    {
      "external_work_package_id": "beaver:voucher:55:line:101:factory",
      "label": "建具A",
      "category": "factory",
      "estimated_hours": 8.0,
      "source_voucher_id": 55,
      "source_line_id": 101,
      "updated_at": "2026-08-24T11:41:31+09:00"
    },
    {
      "external_work_package_id": "beaver:voucher:55:line:101:site",
      "label": "建具A",
      "category": "site",
      "estimated_hours": 2.0,
      "source_voucher_id": 55,
      "source_line_id": 101,
      "updated_at": "2026-08-24T11:41:31+09:00"
    }
  ]
}
```

`baseline_source` が `manual` または `none` の案件では `work_packages: []`。

### フィールド定義

| フィールド | 型 | 説明 |
|---|---|---|
| `external_work_package_id` | string | §3参照。安定識別子。名前照合禁止（照合はこのIDのみで行う） |
| `label` | string | 表示用ラベル。明細の`item_name`。空欄の場合は`"明細{line_no}"`で補う（ダミー値だが表示上の欠落を避けるためであり、識別には使わない） |
| `category` | `"factory"` \| `"site"` | 固定2値。`factory`=工場（製作）作業、`site`=現場（取付）作業。集計区分マスタ（`aggregation_category_master`、設定画面から改名・増減されうる）とは独立の固定enum。マスタの改名・無効化に影響されない安定値とするため、意図的にマスタへ依存させていない |
| `estimated_hours` | number | `単位工数(cost_factory_hours または cost_site_hours) × quantity` を小数2桁に丸めた値。必ず`> 0`（0以下の組み合わせはパッケージを生成しない） |
| `source_voucher_id` | integer | 生成元の見積伝票ID（`vouchers.id`）。常に親オブジェクトの計画基準見積と一致する |
| `source_line_id` | integer | 生成元の明細行ID（`voucher_lines.id`） |
| `updated_at` | string (JST ISO8601) \| null | 明細行の`updated_at`。NULL（migration 019適用前からの行で未更新）の場合は生成元見積伝票の`updated_at`にフォールバック |

`external_project_id`をwork_package要素に含めない: 親オブジェクトに既に存在し、常に一致する（work_packagesは親と同じ計画基準見積からのみ生成される）ため、重複保持による不整合リスクを避けて省略した。Youkan側で必要なら親の`external_project_id`と組み合わせて扱う。

## 3. パッケージidentity規則

```text
external_work_package_id = "beaver:voucher:{source_voucher_id}:line:{source_line_id}:{category}"
```

- `{source_line_id}` は `voucher_lines.id`（グローバルに一意なAUTOINCREMENT）。単独でも一意性は担保されるが、デバッグ・可読性のため`voucher_id`も含めた複合文字列とする
- 1明細行につき最大2パッケージ（factory・site）。どちらか一方のみ`>0`なら1パッケージ、両方0なら0パッケージ
- **安定性の保証範囲**: 同一行を通常編集（数量・工数・品名変更等）している間はID不変。行の削除・作り直し、見積の版切替（新規伝票への切替）、AccessTategu同期の`lines_mode=replace`が発生した場合はIDが変わる（§1.4/1.5）。これは意図的な設計であり、Youkan側は「以前存在したIDが今回の応答に含まれなくなったら、そのwork_packageはBeaver側から消えたものとして扱う」（計画書§8の方針）ことで対応する
- IDに日本語ラベルやitem_nameを含めない（要望前提4の「名前照合させない」を満たすため）

## 4. baselineとの関係

- work_packagesは**baseline_source='estimate'の時のみ**非空になりうる。生成元は必ずbaseline_hours算出に使った計画基準見積（`selectPlanningEstimateVouchers`の選定結果）と同一
- 複数見積があっても合算しない（B1と同じ「計画基準見積1件のみ正本」ルールを継承。B3で新たな正本判定ルールは導入しない）
- work_packages合計とbaseline_hoursの差は契約上許容する。Beaver側はダミーパッケージで埋めない・baseline_hoursを書き換えない・警告も返さない（計画書§8の明記どおり）。Youkan側で `unallocated_hours = baseline_hours - Σ(work_packages[].estimated_hours)` を計算すること（負値=work_packages側が超過している状態であり、それも契約上あり得る。Beaver側で補正しない）

## 5. 見積改訂時の扱い（まとめ）

§1.5の詳細を契約として要約:

| イベント | baseline_hours | work_packages |
|---|---|---|
| 同一見積内の行編集（値変更のみ） | 再計算される | 該当行のIDは維持、estimated_hoursのみ更新 |
| 新しい見積伝票の追加（より新しいvoucher_date） | 新見積へ切替 | 旧見積の全パッケージが消え、新見積の全パッケージが現れる |
| 計画基準見積のvoid化 | 次点見積 or manual/noneへフォールバック | 同様に総入れ替え、または`[]`へ |
| 行の削除→新規追加（同一見積内） | 再計算される（値ベースなので影響小） | 削除された行のIDのパッケージは消え、新規行のIDで新しいパッケージが現れる |
| 建具複製（行複製） | 再計算される（行が増える分） | 新しい行IDで新しいパッケージが追加される（既存パッケージは維持） |
| AccessTategu同期`lines_mode=replace`が対象見積に発生 | 値は同じでも再計算扱い | 対象伝票配下の全パッケージIDが総入れ替え |

## 6. Youkan Y2へ渡す注意事項（申し送り）

1. `work_packages`は既存の一覧・単体APIのレスポンスに追加されたフィールドであり、新しいエンドポイントは無い。既存のポーリング（B1契約§9）でそのまま拾えるが、`updated_at`（プロジェクト単位）はwork_packages内の変更でも更新される（明細行の更新は`vouchers.updated_at`経由で親案件の`updated_at`も更新されるため、B1の差分同期は引き続き機能する）
2. パッケージ単位の存在チェックは`external_work_package_id`の集合比較で行うこと。前回受け取ったID集合から今回消えたIDがあれば「要確認」扱いにする（削除ではなく、Beaver側の版切替・行入れ替えの可能性が高いため、Youkan側の既存分解を自動削除しないこと。計画書§8）
3. `category`は`factory`/`site`の固定2値のみ。将来カテゴリが増える可能性はあるが、増える場合は契約改版で通知する。未知の値が来た場合は無視せず「不明カテゴリ」として保持することを推奨（前方互換）
4. `label`は表示用の参考情報であり、識別・突合には使わないこと（同じlabelが複数パッケージに現れうる。§1.3）
5. `estimated_hours`の合計は`baseline_hours`と完全一致しない場合がある（§4）。Youkan側で`unallocated_hours`を都度計算すること。Beaver側は事前計算値を提供しない
6. B3では見積のサブプロジェクト自動生成やタスク生成は一切行わない（Beaver側の責務外）。Y2側の段階分解ロジックが本格的な消費者になる

## 7. 実装構成

| ファイル | 内容 |
|:--|:--|
| `api/routes/list_helpers.php` | `fetchProjectBaselines`が選定済み計画基準見積の`voucher_id`も返すよう拡張。新規`fetchWorkPackagesByVoucherIds`関数追加 |
| `api/routes/integrations_youkan.php` | `youkanProjectRow`に`work_packages`を追加、work_packages生成のISO8601整形・カテゴリ分解ロジックを追加 |
| `api/tests/test_youkan_integration.php` | B3のテストケースを追加（TDD、本書§8の検証観点をカバー） |

## 8. 検証（B3終了条件）

- [ ] work_packagesなしの案件（manual/none baseline）でもB1/B2が壊れない（既存レスポンス構造維持、`work_packages: []`）
- [ ] manual baseline案件で`work_packages: []`
- [ ] estimate baseline案件で計画基準見積の明細からwork_packagesが生成される
- [ ] 複数明細（同種作業を含む）で行ごとに独立したパッケージが生成される（統合されない）
- [ ] 数量あり明細で`単位工数×quantity`が正しく反映される
- [ ] 工場時間のみの行はfactoryパッケージのみ生成
- [ ] 現場時間のみの行はsiteパッケージのみ生成
- [ ] 工場＋現場の行は2パッケージ生成
- [ ] 0時間明細（factory=0かつsite=0、またはquantity=0による実質0h）はパッケージを生成しない
- [ ] 見積改訂（新しい見積伝票への切替）で旧パッケージが消え新パッケージが現れる
- [ ] void見積は計画基準見積の対象にならず、その明細もwork_packagesに現れない
- [ ] baseline算出対象見積とwork_packages対象見積が常に一致する（同一関数呼び出し結果を共有していることをテストで確認）
- [ ] 既存 `/integrations/youkan/projects` の全フィールド・ページング・認証・404/405挙動に影響なし（APIが後方互換）
- [ ] 回帰スイート（vitest + PHPテスト全体）が全通過（B1/B2回帰なし）
- [ ] 本番検証: 実案件で`work_packages`が期待どおり返る（デプロイ後に実施）
