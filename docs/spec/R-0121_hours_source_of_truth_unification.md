# R-0121: 工数データ参照元の統一（voucher_line_costs優先・固定列フォールバック）

対象: `docs/requests.md` -11（緊急）。R-0120（B3）本番実機検証中に発覚したバグ。

## 1. 背景・発覚経緯

R-0120のestimate baseline実機検証で、テスト案件（id=52）の見積明細（id=25488「どあ」・25489「わく」）にBeaver画面から工場時間・現場時間を入力（どあ8h/2h、わく4h/1h）しても、`/integrations/youkan/projects/52`のレスポンスに一切反映されないことが判明した（`baseline_source`が`manual`のまま、`baseline_hours`も変化なし）。

本番DB読み取り専用調査で確認した事実:
- 入力値は`voucher_line_costs`（`category_code=FACTORY_TIME/SITE_TIME`）には正しく保存されている
- 一方`voucher_lines.cost_factory_hours`/`cost_site_hours`（固定列）は0.0のまま更新されていない

## 2. 根本原因

R-0119（2026-08-26〜27）で、フロントエンドの工数入力欄が集計区分マスタ由来の動的カテゴリ方式（`voucher_line_costs`）へ切り替わった。`frontend/src/components/voucher/LineItemRow.tsx`の`saveLineToDb`は`costs`/`prices`配列のみをAPIへ送信し、`voucher_lines.cost_factory_hours`/`cost_site_hours`（固定列）を更新するフィールドは一切送らない。

しかし以下3箇所は、R-0119以前と変わらず**固定列だけ**を参照していた:

| 関数 | ファイル | 用途 |
|---|---|---|
| `selectPlanningEstimateVouchers` | `api/routes/list_helpers.php` | 計画基準見積の選定（工数明細を持つか否かの判定にEXISTS句で固定列を直接参照） |
| `sumHoursByVoucherIds` | 同上 | baseline_hours算出（B1・R-0097工数目安） |
| `fetchWorkPackagesByVoucherIds` | 同上 | B3 work_packages生成 |

一方、明細表示・編集API（`api/routes/vouchers.php`の`attachLineSubtables`/`fallbackCosts`）は既にR-0119時点で「`voucher_line_costs`に行があればそれを使い、無ければ固定列へフォールバック」という正しい方式に対応済みだった（表示側と集計側で参照方式が食い違っていた）。

### 実害

本番稼働中のYoukan容量判定（B2、R-0118）は、B2自体はBeaverの`GET /projects/{id}/capacity-check`がYoukanへプロキシするだけで、Youkan側が内部で改めてB1 API（`/integrations/youkan/projects/{id}`）を再取得してbaseline_hoursを得る構成（R-0118契約）。したがって**B1のbaseline_hours算出バグがそのままYoukan容量判定の入力値バグとして伝播する**。R-0119以降に時間入力された案件はYoukanから見て工数0（またはmanual値のみ）として扱われ、容量が「入る」と誤判定されるリスクがあった。B3のwork_packagesも同じ理由で常に空配列だった。

## 3. 正規データ源とfallback規則

### 正規データ源
`voucher_line_costs`テーブルの`category_code='FACTORY_TIME'`および`'SITE_TIME'`行を、明細行の工場時間・現場時間の第一正本とする。

### fallback規則（カテゴリ単位で判定。行単位ではない）

各明細行・各カテゴリ（FACTORY_TIME / SITE_TIME）ごとに独立して判定する:

- そのカテゴリの`voucher_line_costs`行が**存在する** → その`value`を使用する（`0`であっても採用し、固定列へは絶対にフォールバックしない）
- そのカテゴリの`voucher_line_costs`行が**存在しない** → `voucher_lines.cost_factory_hours`/`cost_site_hours`（固定列）へフォールバックする

判定を行単位ではなくカテゴリ単位にする理由: 建具台帳の原価内訳同期（`loadSnapshot`の`tategu_item_cost_breakdown`同期）等、他のカテゴリ（MAIN/HARDWARE/GLASS等）だけが`voucher_line_costs`に存在し、FACTORY_TIME/SITE_TIMEの行は存在しないケースがありうる。行の存在有無だけで判定すると、この場合に固定列の工数が誤って無視される。

既存の表示用ロジック`attachLineSubtables`/`fallbackCosts`（`api/routes/vouchers.php`）は「行に1件でも`voucher_line_costs`があれば全体をフォールバックしない」という行単位の粗い判定だが、これは表示専用でありB1/B3の集計とは別の関心事のため、今回は表示側を変更しない（対応範囲外）。

### 二重書き方式は採用しない
R-0119保存処理（`saveLineToDb`）を変更して固定列へも同時書き込みする方式は、要望の指示どおり採用しない。読み取り側（B1/B3）を正規データ源に合わせて修正する。

## 4. 実装方針

### 4.1 共通関数の新設: `fetchEffectiveLineHours`

`api/routes/list_helpers.php`に新設する。B1・B3で重複実装しないための共通の読み取りロジック。

```
fetchEffectiveLineHours(PDO $pdo, array $voucherIds): array
  => array<int, array<int, array{
       line_id: int, line_no: int, item_name: ?string, quantity: float,
       factory_hours: float, site_hours: float, updated_at: ?string
     }>>  // voucher_id => line_no昇順の実効工数配列
```

- `voucher_lines`（対象voucher_idの全行）と`voucher_line_costs`（`category_code IN ('FACTORY_TIME','SITE_TIME')`のみ）を取得
- 各行・各カテゴリについて§3の規則で実効値を決定する
- `factory_hours`/`site_hours`は**単位工数**（数量を掛ける前の値）。数量を掛ける処理は呼び出し側（用途ごとに掛け方が異なるため）

### 4.2 `selectPlanningEstimateVouchers`の修正

現状はSQLのCTE内でEXISTS句が固定列を直接参照して「工数明細を持つ見積」を判定していたため、動的カテゴリのみで工数を持つ見積が候補から漏れていた。

修正後は2段階にする:
1. SQLで「対象project_idに属する非void見積（`voucher_type='estimate' AND status!='void'`）」を`voucher_date DESC, id DESC`順に取得する（工数条件では絞り込まない）
2. `fetchEffectiveLineHours`で候補見積群の実効工数を取得し、PHP側で「factory_hoursまたはsite_hoursが1行でも>0」の見積を判定する
3. project_idごとに、順序どおり最初に条件を満たした見積を採用する（既存のROW_NUMBER選定と同じ優先順位を維持）

### 4.3 `sumHoursByVoucherIds`の修正

`fetchEffectiveLineHours`の結果を使い、行ごとに`(factory_hours + site_hours) * quantity`を合算してから小数2桁に丸める（既存の丸めタイミング・仕様を維持）。

### 4.4 `fetchWorkPackagesByVoucherIds`の修正

`fetchEffectiveLineHours`をそのまま利用する（薄いラッパー、または呼び出し元を`fetchEffectiveLineHours`に統一）。返却フィールド名を`factory_hours`/`site_hours`に統一する（旧`cost_factory_hours`/`cost_site_hours`という生列名の踏襲をやめる）。

### 4.5 `api/routes/integrations_youkan.php`の修正

`youkanWorkPackages`関数内の参照列名を`cost_factory_hours`/`cost_site_hours`から`factory_hours`/`site_hours`へ変更する（4.4の変更に追従）。計算ロジック自体（`単位工数 × quantity`を丸めて`estimated_hours`とし、`<=0`ならパッケージを生成しない）は変更しない。

### 4.6 影響を受けない箇所（変更不要と確認済み）

- `fetchProjectBaselines`・`fetchEstimatedHoursByProjectIds`・`effectiveEstimatedHours`: `sumHoursByVoucherIds`/`selectPlanningEstimateVouchers`を呼ぶだけなので、4.2/4.3の修正で自動的に正しくなる（R-0095/R-0097の案件一覧・ダッシュボード工数目安も同時に修正される）
- B2 `GET /projects/{id}/capacity-check`（`api/routes/projects.php`）: BeaverはYoukanへプロキシするのみで、Youkanが内部でB1 APIを再取得してbaseline_hoursを得る構成のため、B1の修正がそのまま反映される。Beaver側コード変更は不要
- `api/routes/vouchers.php`の`attachLineSubtables`/`fallbackCosts`（明細表示・編集API）: 既に正しい方式のため変更不要
- スキーマ・マイグレーション: 不要（読み取りロジックのみの修正。`voucher_line_costs`の既存データはそのまま正しく使われる）

## 5. 本番データへの対応

固定列（`cost_factory_hours`/`cost_site_hours`）自体を再計算するバッチは不要と判断する。理由: 今回の修正で読み取り側が`voucher_line_costs`を優先するため、既存の動的カテゴリデータはそのまま正しく扱われる。固定列に古い値が残っていても、対応する`voucher_line_costs`行が存在する限り参照されない。

## 6. 必須テスト

`api/tests/test_youkan_integration.php`に追加する（既存のセットアップ・ヘルパを再利用）。新規ヘルパ`insertVoucherLineCost($pdo, $lineId, $categoryCode, $value)`を追加してよい。

- [ ] FACTORY_TIMEのみ（動的カテゴリ、固定列は0）
- [ ] SITE_TIMEのみ（同上）
- [ ] FACTORY_TIME・SITE_TIME両方（動的カテゴリ）
- [ ] 数量1
- [ ] 数量>1（単位工数×数量が正しく反映される）
- [ ] 動的カテゴリ値が明示的に0（固定列には非0の旧値がある）→ 実効値は0（フォールバックしない）
- [ ] 動的カテゴリ行なし＋旧固定列に値あり → 固定列の値へフォールバックする
- [ ] 動的カテゴリと旧固定列に異なる値がある場合、動的側を正とする
- [ ] manual baseline（見積なし、`manual_estimated_hours`のみ）
- [ ] estimate baseline（計画基準見積から算出）
- [ ] manual→estimate切替（見積に工数明細を追加すると自動的にestimateへ切り替わる）
- [ ] 複数見積（新しい`voucher_date`の見積だけが採用され、旧見積は加算されない）
- [ ] plan-baseline estimate選択（動的カテゴリのみで工数を持つ見積が正しく候補として選定される。§4.2の主眼）
- [ ] void見積は計画基準見積の対象から除外される
- [ ] `GET /integrations/youkan/projects`・単体取得のHTTPレベルでbaseline_hours/work_packagesが正しく反映される
- [ ] B2 `capacity-check`回帰（既存`test_capacity_check.php`が全通過）
- [ ] B3 work_packagesが動的カテゴリの値を正しく反映する（既存`test_youkan_integration.php`のB3ケースを動的カテゴリ前提に拡張）
- [ ] 回帰スイート（`bash .claude/regression-suite.sh`、vitest含む）全通過

## 7. 本番検証（デプロイ後）

- テスト案件（id=52）で工場時間・現場時間を入力 → `baseline_hours`に反映・`baseline_source=estimate`
- B2容量判定の不足時間が入力工数に応じて変化する
- B3 `work_packages`が正しい工数・工場/現場分離で返る
- 検証用に入力した値は、Beaver画面または正規API経由で元の値へ復元する（直接SQL変更はしない）

## 受け入れ条件

- §6の全テストがグリーン
- 回帰スイート（vitest + PHPテスト全体）が全通過
- 本番実機で§7の検証項目を確認
