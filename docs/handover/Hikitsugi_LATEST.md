# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-10-10 夜（R-0157〜R-0168をBeaver_betaへデプロイ。本番は未デプロイ）

前回分は `docs/handover/Hikitsugi_2026-10-06.md`（R-0148〜R-0152、auto modeとの付き合い方）。それ以前は同ディレクトリの日付付きファイル。

## 現在地

### 1. A-X-01（Access⇔Beaver_beta全件連携のやり直し）— 完了（2026-10-09、横断整合検査NG 0/37）
- 2026-10-07: 本番DBからBeaver_betaを再複製し、基準線R-0140(3)を記録。r0150・r0151の予行演習を実施
- 2026-10-08: Access側不具合（last_synced_atの1秒ずれ等）のため、手順3からやり直し。Beaver_betaを`database_beta_20261007_pre_applyrun.sqlite`へ戻し、ApplyRun後にA-B-10（重複4組の統合）・+10000変換・シード伝票5,772件削除・5792のvoidを実施
- 2026-10-09: 全件push（5,889件）後の照合が見込みどおり。dodai-backの手順7でも得意先の承認待ち0件、横断整合検査のNGは試用伝票6件由来のP2e・P6aのみ
- 手順8（2026-10-09）: 晴樹さんが画面から試用伝票を処理。E02041は物理削除、S04600・E02044・E02045はvoid（理由付き履歴あり）。E02046・E02047は残すことになり、Access競合解決画面で「Beaver版を採用」→ access_voucher_id 12101・12102、明細のaccess_line_idも返ってきた
- Beaver_betaのバックアップは`api/backups/database_beta_2026100[7-9]_*.sqlite`に段階ごとに保存してある

### 2. R-0154（画面からの伝票取消）— 実装済み・Beaver_betaへデプロイ済み（追加仕様含む）・本番は未デプロイ
- 仕様: `docs/spec/R-0154_voucher_void_reason_history.md`。中身ありは理由（任意）付きでvoid＋`record_history`、空は確認なしで物理削除、Access連携伝票は空でもvoid
- コミット: テスト`4ed2793`、実装`41cee6a`
- 追加仕様（2026-10-09、晴樹さん決定）: voidの売上は引用済み判定から除外（5806も5807取消後に取消可能）、未保存入力は保存してから空判定。テスト`5858f81`・実装`455e4d6`、Beaver_betaへデプロイ済み（前バックアップ`database_beta_20261009_pre_r0154b.sqlite`）
- 確認待ち: 引用先の売上をすべて取り消した見積から「引用して売上」で再び売上を作れてよいか／引用先一覧に取消済みの売上も載るが目印を付けるか

### 3. A-X-02（本番Beaverの切替）の手順メモ（Beaver側）
- 本番データの修復（r0150・r0151・r0152の`--execute`）はdodai-backが実行時期を指定する。r0151はシード伝票の削除後に実行すると対象が約21件に絞れる
- **順番の変更（2026-10-09 dodai-back）**: 試用伝票は本番の手順7（同期）の前、手順4.5（シード削除）の近くで本番Beaverから消す。Accessの競合待ちに出さないため。本番にR-0154（追加仕様含む）をデプロイしてから行う
- 5792相当の「Accessで削除済みの伝票」は`~/void_voucher_with_history.php <db> <id> <期待access_voucher_id> "<理由>" [--execute]`で履歴付きvoidにする（サーバーのホームに配置済み）
- **Beaverにしかない伝票の確認（2026-10-09 dodai-back提案）**: A-X-02の直前に本番で`access_voucher_id`がNULLの伝票を一覧で出し、晴樹さんに1件ずつ「残す（Access側で『Beaver版を採用』して取り込む）か、消すか」を確認する。試用伝票のうちE02046（id 5809）・E02047（id 5810）は晴樹さんが残すと決めたので削除対象から外し、手順7の同期のあとにAccess画面で採用する。採用すると`access-link`（明細つき）で`access_voucher_id`・`access_line_id`が返ってくる。5809の得意先は仮の「とりあえず登録用」なので、本当の得意先に付け替えるか晴樹さんに確認する
- 本番の試用データ22件（U0xxxx）の扱いも、dodai-backがA-X-02の中で判断する

### 3.5 進行中の相談（dodai-back）
- R-0155（同期・競合解消を得意先→案件→伝票の順に）: 晴樹さん承認済み、Access側で実装中。Beaver APIの変更は不要の見込み。「得意先を承認したら止めていた伝票を自動で取り直す」の要否は、dodai-backが作る得意先パターン表（新規・片側修正・両側修正・無効化・伝票の付け替え）を見て晴樹さんが判断する。Beaverには得意先の物理削除経路はない（`DELETE /customers/{id}`は`is_active=0`）
- R-0156（Accessの画面でBeaverの伝票番号E02046などを見えるようにする）: dodai-backが調査中
- 修正前の再現テスト: E02046の得意先「とりあえず登録用」をBeaverで付け替えても、今のAccessには反映されない（既存伝票の採用時にcustomer_id・project_idを更新しないため）
- 得意先の双方向同期テストは、Access側の受入シナリオU-3（S3・S4）で行う予定

### 3.6 2026-10-09〜10 の追加（すべてBeaver_betaのみ、本番は未デプロイ）
- **R-0157**（Accessからの得意先pushがBeaverの修正を黙って上書きしない。`base_synced_at`・`force`、409 `customer_conflict`。繰越残高の編集で`updated_at`を進めない）: 実装`2fe47d2`、dodai-backと通し確認4項目すべて合格
- **R-0158**（伝票pushも同じ方式、409 `voucher_conflict`＋`void_reason`。Beaverでvoid済みの伝票はforceで取消解除し`record_history`に`unvoid`。R-0154の一方通行の例外は晴樹さんの判断、dodai-back経由）: ClaudeのAgentが週の上限で停止しCodexが引き継いで実装（`9197091`）。dodai-backの通し確認待ち。`void_reason`は取消解除後も過去の理由が入るので、Access側はstatus=voidのときだけ使う
- **R-0159**（`GET /projects/sync`の`updated_at`をJSTで返す。Access側の番号R-0162）: `36b8465`。サーバーのPHP既定タイムゾーンはAsia/Tokyo（`updated_after`の`strtotime`解釈が依存）
- R-0158はdodai-backの通し確認B1〜B5・C〜Fすべて合格
- **R-0163**（伝票画面の時刻をJSTに、Access№・最終更新を表示）: Beaver_betaへデプロイ済み、合格
- **R-0164**（伝票ヘッダーの自動保存、保存ボタン廃止、離脱警告）／**R-0165**（伝票一覧で取消済みを既定で隠す）: Beaver_betaへデプロイ済み。晴樹さんは自動保存を「便利」と評価
- **R-0166**（伝票の楽観的ロック。`expected_updated_at`、409 `stale_voucher`、画面は自動保存を止めて再読み込みを案内）: `993730f`、Beaver_betaで合格
- **R-0168**（離れるときは保存の結果を待ち、409や失敗なら離れない。開くたびにサーバーから取り直す。生のJSONを出さない）: `c57248d`、Beaver_betaで合格。useBlockerで止めたまま非同期待ちすると`Invalid blocker state transition`になるため、即reset→保存待ち→自分でnavigateし直す設計にした。R-0164の離脱確認テスト1件は仕様変更に合わせて期待値を改めた（仕様書に明記）
- **R-0161**（優先度を上げた。選択肢＝得意先・案件・売上種別がそろうまでフォームに値を入れず保存もしない。R-0168後に5809で選択欄が全部空に見えた。データは無事）: `b3a075b`、2026-10-10夜にBeaver_betaへデプロイ。dodai-backが5809で確認予定
- **R-0167**（得意先画面にも楽観的ロックが無い）: 晴樹さんの判断待ち
- vitestの`localhost:3000`へのECONNREFUSEDログはR-0161以前から出ている既存のもので、失敗には数えられない。Codexの実行環境ではこれを理由に止まることがある
- **A-X-02で本番に入れるもの**: R-0154（追加仕様含む）・R-0157・R-0158・R-0159・R-0161・R-0163〜R-0166・R-0168。R-0158の「`base_synced_at`なしの既存伝票は400」への切り替えはA-X-02後にdodai-backの合図で行う
- **Codexの呼び出し方**: `codex-onrequest.cmd exec -`（標準入力渡し）は何も実行せず終了コード2で終わった。`codex --cd C:/Fujiruki/Projects --sandbox workspace-write --ask-for-approval on-request exec "$(cat プロンプト.md)"`で直接呼ぶと動く。`--cd`をBeaverにすると`.git`が読み取り専用になりコミットできない（必ず親の`Projects`）

### 4. 未着手
- R-0153（伝票編集画面の合計プレビューをR-0152の計算規則に揃える。`docs/requests.md` §38）。Dodaikunへ乗り換える前に必ず直す

## 運用メモ
- auto modeは、Beaver_betaのDB書き換え・`upload.ps1`の実行を止めることが多い。止められたら、コマンドを1行にまとめて晴樹さんに`! `で実行してもらう。バックアップ（cp）と読み取りは通ることが多い
- サーバーの`sqlite3` CLIは古く使えない。DBの確認は`php -r`でPDOを使う
- dodai-back（AccessTategu側backpc指揮役）とはSendMessageでやり取りする
