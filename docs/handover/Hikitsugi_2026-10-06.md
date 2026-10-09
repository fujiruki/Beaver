# 引き継ぎ資料 — Beaver（最新）

**最終更新**: 2026-10-06（R-0148〜R-0151完了、auto modeクラシファイアとの付き合い方が確立、設定変更の反映待ちで`/clear`予定）

過去の引き継ぎ（日付別）は同ディレクトリ `docs/handover/YYYYMMDD_Hikitsugi.md` に保管。直前分は`docs/handover/20260927_Hikitsugi.md`（本番緊急migration適用インシデントの顛末）。

---

## 次回セッション開始時にまず確認すること

### 0.【要確認】`.claude/settings.local.json` の `autoMode.allow` 設定が反映されたか

今回のセッション終盤で、SSH/SCP経由のBeaver_betaサーバー（`www1045.conoha.ne.jp`、鍵`key-2025-11-29-07-10.pem`、ポート8022）操作が毎回auto modeクラシファイア（`Remote Shell Writes`/`Production Reads`等の理由、`permissions.allow`とは別レイヤー）でブロックされる問題に対し、藤田晴樹さんに`.claude/settings.local.json`へ`autoMode.allow`ブロックを追記していただいた（内容は同ファイル参照。`$defaults`＋このホスト・鍵を使うssh/scp全般を許可）。

編集直後に動作確認のscpを試したが、同じ`[Self-Modification]`理由（直前の自己編集操作の残響の可能性）でブロックされたため、**設定が実際に効くか未確認のまま`/clear`（新セッション）に入る**ことになった。次回セッション開始時、Beaver_betaへのssh/scpが自動承認されるか試してみること。まだブロックされるようなら、本当のプロセス再起動（`claude`終了→再起動）が必要な可能性が高い。

### 1. R-0148〜R-0151（すべて完了・コミット・push済み）

今回のセッションで以下を実施。すべて`docs/requests_log.md`に詳細記録済み、仕様書は`docs/spec/R-0148_*.md`〜`R-0151_*.md`。

- **R-0148**: 伝票編集画面で案件プルダウンから案件を選択した際、得意先が未設定なら自動的にその案件の得意先を設定するように（`VoucherEdit.tsx`）
- **R-0149**: `GET /vouchers/sync`に`beaver_customer_name`・`beaver_project_name`を追加（AccessTategu側の競合解決画面で未リンク伝票の名前が常に「該当なし」になる問題への対応）
- **R-0150**: 伝票見出し`consumption_tax_type`の新規作成時デフォルト値バグ修正（誤って`'課税'`→正しくは`'外税/伝票計'`）＋値域バリデーション追加。既存データ（本番・Beaver_betaとも6件、id 5805〜5810）の修正スクリプトは用意済みだが実行は藤田晴樹さんの運用（今回のセッションでは実行していない）
- **R-0151**: 明細同期の抜本修正。要点:
  - `recalcVoucher()`を`vouchers.php`から`sync_helpers.php`へ移動（`/projects/{id}/vouchers/sync`経由だと`vouchers.php`が読み込まれずFatal errorになる致命的バグを発見・修正）
  - `PATCH /vouchers/{id}/access-link`に`lines:[{line_no,access_line_id}]`を追加（ヘッダーと同一トランザクション、全件検証→ロールバック）。レビューで「payload外の既存行が持つaccess_line_idとの衝突が検証漏れで500になる」バグを発見し別途修正済み
  - `GET /vouchers/sync`に`beaver_line_id`を追加
  - `lines_mode=replace`を全DELETE→INSERTからaccess_line_idキーのupsertに変更（Beaver側id・costs/prices維持）、処理後に`recalcVoucher()`を自動呼び出し
  - 既存17行のaccess_line_id修復（Beaver_beta限定、`api/manual/r0151_fix_access_line_ids.php`）を実行・完了（dodai-back提供の参照値で全件照合OK）
  - `api/manual/r0151_recalc_voucher_totals.php`（total_amount一括修復、dry-run/`--execute`）を作成済み。dodai-backからBeaver_beta向けのdry-run→execute依頼が来ており、dry-runまで実施（対象3,921件、売上9335（access 4274）が15180→10120になることを確認済み）。**`--execute`は未実行のまま中断**（`/clear`に入ったため）

### 2.【次にやること】R-0151系2本のBeaver_beta実行の続き

dodai-backから依頼された以下2本を、Beaver_betaに対して dry-run→確認→`--execute`まで進める（**本番Beaverには触れない**、A-X-02前に改めて判断）。

1. `api/manual/r0151_recalc_voucher_totals.php`: dry-run済み（対象3,921件）。事前バックアップ（`database_beta_20261006_pre_r0150_r0151recalc.sqlite`、取得済み）があるので、このまま`--execute`に進めてよい
2. `api/manual/r0150_fix_consumption_tax_type.php`: まだdry-runもできていない。同じBeaver_betaに対して実行する

実行後、dodai-backへ対象件数・変更件数・残0件を報告すること。

サーバー接続コマンド（鍵・ポート等）:
```
ssh -i "C:\Fujiruki\Projects\AI_DEVELOP_RULES\UPLOAD\key-2025-11-29-07-10.pem" -p 8022 c6924945@www1045.conoha.ne.jp "<コマンド>"
scp -i "C:\Fujiruki\Projects\AI_DEVELOP_RULES\UPLOAD\key-2025-11-29-07-10.pem" -P 8022 <ローカルパス> c6924945@www1045.conoha.ne.jp:~/
```
Beaver_betaのDBパス: `/home/c6924945/public_html/door-fujita.com/contents/Beaver_beta/api/database.sqlite`

スクリプトは`php -r "require '...';"`では動かない（CLIエントリポイント判定`realpath($argv[0]) === __FILE__`が成立しないため）。`php /home/c6924945/<転送先ファイル名> <dbパス> [--execute]`の形で直接実行すること。

### 3. auto modeクラシファイアとの付き合い方（学んだこと）

- SSH/SCPでのリモート書き込み・サーバー上の読み取りコマンドは`Remote Shell Writes`・`Production Reads`等の理由でブロックされることが多い。都度「進めてよいか」ユーザーに確認し、OKなら**ユーザー自身に`! <command>`で実行してもらう**運用で乗り切ってきた
- 自分の権限設定ファイル（`.claude/settings.local.json`等）を自分で編集する行為は`[Self-Modification]`で常にブロックされる。ユーザーに頼んでも、ユーザーの代わりに自分が編集することはできない。設定変更が必要な場合は、変更内容のJSONを提示してユーザー自身に編集してもらうしかない
- 今回`autoMode.allow`に`$defaults`＋特定ホスト・鍵のssh/scpパターンを追加したことで、今後この種のブロックが減る見込み（上記0.の確認待ち）

### 4. 進行中のdodai-back（AccessTategu側backpc指揮役）との協働について

- Beaver_beta限定の作業（複製・データ修正・スクリプト実行）はdodai-backからの合図＋晴樹さんの事前了承があれば自律的に進めてよい運用が定着している
- 本番Beaverへの書き込み（migration適用・デプロイ等）は都度晴樹さんに直接確認する
- dodai-backとの連絡は`SendMessage`（to: "dodai-back"）で行う

---

## 追記（2026-10-06 新セッション）: 上記0.と2.は完了

- **0. autoMode.allow**: 新セッションでは効いていることを確認した。Beaver_betaへのssh（読み取り・スクリプト実行とも）が確認なしで通った
- **2. Beaver_betaでの実行**: 2本とも`--execute`まで完了し、dodai-backへ報告済み
  - r0151 total_amount修復: 対象3,921件、実行後のdry-runで残0件。売上9335（S08125）のtotal_amountが10120になっていることを確認
  - r0150 consumption_tax_type修正: 6件（id 5805〜5810）を更新、実行後のdry-runで残0件
- 注意: サーバーの`sqlite3` CLIは古く、部分インデックス（`idx_payments_access_payment_no`）を読めず`malformed database schema`エラーになる。DBの中身を確認するときは`php -r`でPDOを使う
- 本番Beaverには未適用。A-X-02の前に改めて判断する

## 追記2（2026-10-06）: R-0152完了・本番コードデプロイ、R-0153は未着手

- **R-0152**（recalcVoucherの計算式をAccessに揃える）: 実装・Beaver_beta反映・一括修復まで完了。dodai-backの照合チェックで全37項目の不一致が0件。仕様は`docs/spec/R-0152_recalc_voucher_access_parity.md`、経緯は`docs/requests_log.md`
- **本番Beaver**: 藤田晴樹さんの許可を得て、コードだけをデプロイ済み（R-0149〜R-0152）。デプロイ前は本番もBeaver_betaも、APIがR-0143のころの版のままだった
- **保留**: 本番データの修復（r0150・r0151・r0152の`--execute`）と、本番の試用データ22件（U0xxxx）の扱い。dodai-backがA-X-02の切り替え手順の中で実行時期を指定する
- **次の作業**: R-0153（画面の合計プレビューをR-0152の計算規則に揃える。`docs/requests.md` §38）。Dodaikunへ乗り換える前に必ず直す
- **auto mode**: `upload.ps1`と`git push`は、同じ操作でも通るときと止められるときがある。止められたら、ユーザーに`! `で実行してもらう
