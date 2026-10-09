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

### 2. R-0154（画面からの伝票取消）— 実装済み・Beaver_betaへデプロイ済み・本番は未デプロイ
- 仕様: `docs/spec/R-0154_voucher_void_reason_history.md`。中身ありは理由（任意）付きでvoid＋`record_history`、空は確認なしで物理削除、Access連携伝票は空でもvoid
- コミット: テスト`4ed2793`、実装`41cee6a`
- **未決1**: 見積5806（売上5807の引用元）が取り消せない。`assertVoucherEditable`の「売上に引用済み」判定がvoidの売上を除外していないため、5807をvoidにしても5806は409のまま。案は「判定からvoidの売上を除く」（副作用: 引用先売上を取り消した見積は再び編集可能になる）。晴樹さんの判断待ち
- **未決2**: 編集画面で未保存の入力があるまま取消を押すと、保存済みの内容で空判定されるため、確認なしで物理削除され入力も失われる。確認を出すかどうか晴樹さんの判断待ち

### 3. A-X-02（本番Beaverの切替）の手順メモ（Beaver側）
- 本番データの修復（r0150・r0151・r0152の`--execute`）はdodai-backが実行時期を指定する。r0151はシード伝票の削除後に実行すると対象が約21件に絞れる
- **順番の変更（2026-10-09 dodai-back）**: 試用伝票は本番の手順7（同期）の前、手順4.5（シード削除）の近くで本番Beaverから消す。Accessの競合待ちに出さないため。本番にR-0154（と5806の修正）をデプロイしてから行う
- 5792相当の「Accessで削除済みの伝票」は`~/void_voucher_with_history.php <db> <id> <期待access_voucher_id> "<理由>" [--execute]`で履歴付きvoidにする（サーバーのホームに配置済み）
- 本番の試用データ22件（U0xxxx）の扱いも、dodai-backがA-X-02の中で判断する

### 4. 未着手
- R-0153（伝票編集画面の合計プレビューをR-0152の計算規則に揃える。`docs/requests.md` §38）。Dodaikunへ乗り換える前に必ず直す

## 運用メモ
- auto modeは、Beaver_betaのDB書き換え・`upload.ps1`の実行を止めることが多い。止められたら、コマンドを1行にまとめて晴樹さんに`! `で実行してもらう。バックアップ（cp）と読み取りは通ることが多い
- サーバーの`sqlite3` CLIは古く使えない。DBの確認は`php -r`でPDOを使う
- dodai-back（AccessTategu側backpc指揮役）とはSendMessageでやり取りする
