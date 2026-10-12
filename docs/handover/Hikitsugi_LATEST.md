# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-10-12 朝（2026-10-11〜12にR-0169〜R-0174と不具合修正4件をBeaver_betaへデプロイ。本番は未デプロイ）

前回分は `docs/handover/Hikitsugi_2026-10-10.md`（A-X-01完了、R-0154〜R-0168）。それ以前は同ディレクトリの日付付きファイル。

## 最初に

- **実装はCodexへ（2026-10-12 晴樹さん指示、番頭経由）**: 実装・TDD修正はできるだけCodex（`codex:codex-rescue` か直接呼び出し）に任せる。顧客情報・個人情報・口座情報など機密を含む作業はClaude側で行う。前セッションはClaudeのAgentに任せ続けていたので切り替えること
- **Codexの呼び出し方**: `codex --cd C:/Fujiruki/Projects --sandbox workspace-write --ask-for-approval on-request exec "$(cat プロンプト.md)" </dev/null`。`codex-onrequest.cmd`に標準入力で渡すと何もせず終わる。`--cd`をBeaverにすると`.git`が読み取り専用になる
- **Beaver_betaへのデプロイ前後はdodai-backに一言連絡**（共同確認中のため）。DBを書き換える変更はデプロイ前に`api/backups/`へコピー
- テスト用の伝票はE03981（id 11709）・E03982・5809（E02046）。**5810（E02047）は実務の伝票なのでテストに使わない**

## 現在地

### 1. 2026-10-11〜12 にBeaver_betaへ入れたもの（本番は未デプロイ）
| 件 | 内容 | コミット | beta確認 |
|:--|:--|:--|:--|
| 不具合 | 新規伝票保存後の遷移でベースパスが二重→404（R-0168離脱ガードの再遷移でbasename込みのパスを渡していた） | `f58ddb1` | 合格（E03981） |
| 不具合 | 既存伝票で追加した明細行がフォームに入らず、blurで保存されない／明細保存で保存状態が変わらない | `f325668` | 未確認 |
| 不具合 | 「原価から売値を設定」（ProfitRateBar）が売値・金額をフォームに入れるだけで保存しない | `87d1796` | R-0173の往復で合格 |
| R-0171 | 売値の内訳（voucher_line_prices MAIN/HARDWARE/GLASS）を/vouchers/syncで返し、Accessのreplaceを内訳にも反映。画面保存で旧列も揃える | `b79dab6` | 合格 |
| R-0173 | 明細の取付場所・原価5項目・労務単価を双方向同期（キーが無いときは変えない。労務単価は列のみ）。Access側はR-0174 | `4b51e74` | 合格（E03981） |
| 改訂 | 内訳を全部消して保存したら旧列も0（R-0171/R-0173、晴樹さん判断） | `0df3655` | — |
| R-0170 | 取消した伝票に「下書きに戻す」（POST /vouchers/{id}/unvoid、履歴unvoid） | `abed2c9` | 合格（E03982、Access往復も） |
| R-0169 | 上部メニューの「伝票」を「見積」「売上」に分ける | `ee95307` | 未確認 |
| R-0172 | 伝票画面の保存状態を右下に固定表示 | `bedc730` | 未確認 |
| 不具合 | 下書きに戻した後、案件画面で無効のまま（伝票の変更時にprojectsクエリも無効化） | `320704e` | 確認依頼中 |
| R-0174 | 新しい行の労務単価の初期値を会社設定`company_settings.default_labor_rate`（betaは5000）から取る。設定画面もこの値を編集 | `8039c1e` | 確認依頼中 |

- バックアップ: `database_beta_20261011_pre_r0171.sqlite`・`_pre_r0173`・`_pre_r0170`
- 仕様書はすべて`docs/spec/R-01xx_*.md`、台帳は`docs/requests_log.md`
- R-0174は**Beaverの番号**。Access側のR-0174（原価同期）とは別物
- `AppSettingsContext`の`defaultLaborRate`（localStorage）は未使用のまま残してある（消すと既存テストも消すことになるため）

### 2. 晴樹さんの判断待ち
- **R-0167**（得意先画面の楽観的ロック。開きっぱなしの画面で保存すると、同期で入った新しい内容を黙って上書きする）: 2026-10-11に平易に説明済み。指揮役のおすすめは「本番切替前に入れる」。「入れて」と言われたらR-0166と同じ作りで実装
- R-0154の確認待ち: 引用先の売上をすべて取り消した見積から再び売上を作れてよいか／引用先一覧の取消済み売上に目印を付けるか

### 3. A-X-02（本番Beaverの切替）の手順メモ（Beaver側）
- **本番に入れるもの**: R-0154（追加仕様含む）・R-0157・R-0158・R-0159・R-0161・R-0163〜R-0166・R-0168〜R-0174と上の不具合修正すべて。R-0158の「`base_synced_at`なしの既存伝票は400」への切り替えはA-X-02後にdodai-backの合図で行う
- 本番データの修復（r0150・r0151・r0152の`--execute`）はdodai-backが実行時期を指定する。r0151はシード伝票の削除後に実行すると対象が約21件に絞れる
- 試用伝票は本番の手順7（同期）の前、手順4.5（シード削除）の近くで本番Beaverから消す。本番にR-0154をデプロイしてから行う
- 5792相当の「Accessで削除済みの伝票」は`~/void_voucher_with_history.php <db> <id> <期待access_voucher_id> "<理由>" [--execute]`で履歴付きvoidにする（サーバーのホームに配置済み）
- A-X-02の直前に本番で`access_voucher_id`がNULLの伝票を一覧にし、晴樹さんに残すか消すかを1件ずつ確認する。E02046（5809）・E02047（5810）は残す。5809の得意先は仮の「とりあえず登録用」なので付け替えを確認
- 本番の試用データ22件（U0xxxx）の扱いはdodai-backが判断
- 本番切替前に、本番AccessにBeaver由来で売値0の行が無いことを確かめる（R-0171以前の取り込みで起きていた。本番AccessにはまだBeaver由来の伝票が無い見込み）
- **本番の会社設定`default_labor_rate`の値を確認**してから切り替える（R-0174で新しい行の初期値になる）

### 4. dodai-backと進行中
- R-0155（同期を得意先→案件→伝票の順に）・R-0156（Access画面でBeaverの伝票番号を見せる）: Access側の作業
- Access側の受入シナリオU-3で得意先の双方向同期を確認予定

### 5. 未着手
- R-0153（伝票編集画面の合計プレビューをR-0152の計算規則に揃える。`docs/requests.md` §38）。Dodaikunへ乗り換える前に必ず直す

## 知っておくと早いこと
- Accessの`lines_mode=replace`は`access_line_id`キーのupsert。payloadに無い既存行は消える（`access_line_id`がまだ無いBeaver追加行も）。price_*はキーが無いと0、原価系（R-0173）はキーが無いと変えない
- 明細の内訳は`voucher_line_prices`／`voucher_line_costs`が正、旧列`price_*`/`cost_*`は内訳0件の行の表示用（`fallbackPrices`/`fallbackCosts`）。労務単価は列`cost_labor_rate`のみ
- 伝票画面のフォームは開いたときに1回だけ値を入れる（R-0166）。フォームだけ`setValue`して保存しない経路があると、画面と DB がずれる（ProfitRateBarがそうだった）
- `blocker.location.pathname`はbasename込み（`/contents/Beaver_beta/...`）

## 運用メモ
- auto modeは、Beaver_betaのDB書き換え・`upload.ps1`の実行を止めることがある。止められたら、コマンドを1行にまとめて晴樹さんに`! `で実行してもらう
- サーバーの`sqlite3` CLIは使えない。DBの確認は`php -r`でPDOを使う
- dodai-back（AccessTategu側backpc指揮役）とはSendMessageでやり取りする
- `upload.ps1 -Beta`に`-KeepLocalDB`は絶対に付けない
