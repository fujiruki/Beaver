# R-0152: recalcVoucher() の計算式をAccess（CalcVoucherTotals）に揃える

## 背景

dodai-back（AccessTategu側backpc指揮役）が横断整合検査（`sync_reconcile.ps1` P2h）を実行したところ、Beaver_betaの売上3,139件で`total_amount`がAccessと食い違った（2026-10-06、`docs/requests_log.md` R-0152に原文）。明細の合計は両側で一致しており、違いは計算式にある。発行済み請求書（Access `tbl売掛`）と一致するのはAccessの`CalcVoucherTotals`（別プロジェクト AccessTategu の `src/modules/Dodaikun_VoucherOps.bas`）なので、Beaverの`recalcVoucher()`をAccess側に合わせる。

## 現状の不具合（`api/routes/sync_helpers.php` の `recalcVoucher()`）

1. 税率を常に`tax_rates`の最新（10%）で計算している。2019/10より前の伝票（5%/8%）が誤る（約2,320件）
2. 値引行の`line_total`は負数で入っているのに`total = … - $discount`としているため、値引が加算になる（約819件）
3. `consumption_tax_type='外税/請求計'`でも税を計上している
4. 端数処理が`floor`で、負数のときAccessの0方向切り捨てとずれる
5. 毎回`updated_at = CURRENT_TIMESTAMP`を立てる。Access同期の受信経路（`replaceSyncedLinesFromPayload`）から呼ぶと、Accessから受け取った伝票の`updated_at`が進み、次回pullで`beaver_newer`としてAccessへ送り返されるおそれがある

## 仕様

### 計算規則（外税 = `tax_input_type='exclusive'`）

- 税率の基準日: 売上（`voucher_type='sales'`）は`delivery_date`、それが無ければ`voucher_date`。見積（`estimate`）は`voucher_date`
- 税率: `SELECT rate FROM tax_rates WHERE valid_from <= :基準日 ORDER BY valid_from DESC LIMIT 1`。該当が無ければ0
- 課税小計 = `line_type <> 'discount'` かつ `tax_category = 'taxable'` の行の`line_total`合計
- 非課税小計 = `line_type <> 'discount'` かつ課税以外の行の`line_total`合計
- 値引小計 = `abs(Σ line_type='discount' の line_total)`（合計の絶対値。行ごとの絶対値ではない）
- 消費税 = `consumption_tax_type='外税/請求計'`なら0、それ以外は`課税小計 × 税率`を0方向に切り捨て（`(int)`キャスト相当。浮動小数点の誤差で1円欠けないよう、切り捨て前に小数第6位程度で丸めてよい）
- 合計 = 課税小計 + 消費税 + 非課税小計 − 値引小計
- `subtotal_discount`には値引小計（正の値）を保存する

### 内税（`tax_input_type='inclusive'`）

Beaverの「税を内側から抜く」計算（`税 = 課税小計 × 税率 / (1 + 税率)`、`subtotal_taxable = 課税小計 − 税`、`合計 = 課税小計 + 非課税小計 − 値引小計`）を維持し、次の3点だけ外税と揃える。税率を基準日で決めること、値引小計をabsで扱うこと、端数を0方向に切り捨てること。Beaver_betaでは内税の伝票は0件。

### updated_at

- `recalcVoucher(PDO $pdo, int $voucherId, bool $touchUpdatedAt = true)`とし、`false`のときは`updated_at`を変更しない
- Beaver画面からの操作（`vouchers.php`の各呼び出し）は従来どおり`true`
- Access同期の受信経路（`sync_helpers.php`の`replaceSyncedLinesFromPayload`）は`false`
- 計算部分は副作用の無い関数（例: `computeVoucherTotals(PDO, int): array`）に切り出し、`recalcVoucher`と一括修復スクリプトが同じ規則で計算するようにする

### 一括修復スクリプト `api/manual/r0151_recalc_voucher_totals.php`

- 計算規則を上記に揃える。サーバーのホームディレクトリへ単体で転送して実行するため、`routes/`を`require`しない自己完結の形を維持する（同じ規則であることはテストで保証する）
- 対象を`voucher_type IN ('sales','estimate')`に広げる（見積はAccess側で合計を保存しないため横断検査の対象外だが、Beaverの画面・一覧の値を正しくするため）
- `updated_at`を変更しない作りは維持する
- 出力に`voucher_type`を加える

## 範囲外（別要望 R-0153）

フロントエンドの合計プレビュー（`VoucherEdit.tsx`の`TotalSummary`に税率0.10を固定で渡している、`voucherCalc.ts`の値引の符号）も同じ誤りを持つ。Dodaikun乗り換えまでに必ず直す項目として別要望で扱う。

## TDD

`api/tests/test_r0152_recalc_voucher_parity.php`（新規）で、`recalcVoucher`と一括修復スクリプトの両方を検証する。

1. 税率の日付判定: 売上で`delivery_date`が2019-09-30なら8%、2019-10-01なら10%。`delivery_date`がNULLなら`voucher_date`で判定。見積は`delivery_date`があっても`voucher_date`で判定。1997-04-01〜2014-03-31は5%
2. dodai-backの代表例（すべて売上・外税/伝票計、2019/10より前の日付は該当税率で再現する）
   - Beaver 5814（Access 44）: 課税19000・値引0・5%（2019/10より前の日付）→ 税950・合計19950（現状20900）
   - Beaver 5811（Access 38）: 課税23000・値引行合計−4150・5% → 税1150・合計20000（現状29450）
   - Beaver 9004（Access 3612）: 課税28200・値引行合計−3020・10% → 税2820・合計28000（現状34040）
3. 値引行の合計が正の値でも、絶対値を差し引く
4. `外税/請求計`は税0
5. 負の課税小計（返品等）で、切り捨てが0方向になる
6. 内税: 基準日の税率、値引のabs、0方向切り捨て
7. `recalcVoucher(..., false)`は`updated_at`を変えない。`true`（既定）は変える
8. Access同期の受信経路（`lines_mode=replace`）を通しても`updated_at`がpayloadで設定した値から変わらず、合計が正しく再計算される
9. 一括修復スクリプト: 見積も対象になる、`updated_at`を変えない、実行後のdry-runが0件、`recalcVoucher`と同じ値になる

既存の`api/tests/test_recalc_inclusive.php`は本体のコピーを持っているので、本体の関数を直接呼ぶ形に直すか、新テストへ統合する。

## 受け入れ条件

1. 上記TDDのテストがすべて通る
2. 回帰スイート（vitest＋PHPテスト）が通る
3. Beaver_betaへAPIをデプロイし、一括修復スクリプトのdry-run→`--execute`を実行、再dry-runで0件になる
4. dodai-backの横断検査P2hが0件になる（dodai-back側で確認）
5. 本番Beaverへの反映は、4.を確認したあとに藤田晴樹さんへ確認してから行う
