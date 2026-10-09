# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-10-09（A-X-01やり直しのBeaver側作業が完了、R-0154を実装しBeaver_betaへデプロイ）

前回分は `docs/handover/Hikitsugi_2026-10-06.md`（R-0148〜R-0152、auto modeとの付き合い方）。それ以前は同ディレクトリの日付付きファイル。

## 現在地

### 1. A-X-01（Access⇔Beaver_beta全件連携のやり直し）— Beaver側の作業は完了
- 2026-10-07: 本番DBからBeaver_betaを再複製し、基準線R-0140(3)を記録。r0150・r0151の予行演習を実施
- 2026-10-08: Access側不具合（last_synced_atの1秒ずれ等）のため、手順3からやり直し。Beaver_betaを`database_beta_20261007_pre_applyrun.sqlite`へ戻し、ApplyRun後にA-B-10（重複4組の統合）・+10000変換・シード伝票5,772件削除・5792のvoidを実施
- 2026-10-09: 全件push（5,889件）後の照合が見込みどおり。dodai-backの手順7でも得意先の承認待ち0件、横断整合検査のNGは試用伝票6件由来のP2e・P6aのみ
- 残り: 手順8（晴樹さんがBeaver_betaの画面から試用伝票5805〜5810を取消・削除する練習）
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

### 4. 未着手
- R-0153（伝票編集画面の合計プレビューをR-0152の計算規則に揃える。`docs/requests.md` §38）。Dodaikunへ乗り換える前に必ず直す

## 運用メモ
- auto modeは、Beaver_betaのDB書き換え・`upload.ps1`の実行を止めることが多い。止められたら、コマンドを1行にまとめて晴樹さんに`! `で実行してもらう。バックアップ（cp）と読み取りは通ることが多い
- サーバーの`sqlite3` CLIは古く使えない。DBの確認は`php -r`でPDOを使う
- dodai-back（AccessTategu側backpc指揮役）とはSendMessageでやり取りする
