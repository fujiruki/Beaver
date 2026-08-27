# 引き継ぎ資料 — Beaver

**最終更新**: 2026-08-27

---

## 直近の作業（2026-08-27）: R-0121 工数データ参照元の統一（緊急バグ修正）— コード修正・本番デプロイ済み／実案件での最終確認は藤田晴樹さん待ち

### R-0121 — コード修正・回帰・本番デプロイ完了、実案件確認のみ保留
- `docs/requests.md` -11（緊急）として記録されていたバグ（R-0119以降にBeaver画面で入力した工場時間・現場時間がbaseline_hours/Youkan容量判定/B3work_packagesへ反映されない）をR-0121として仕様化。仕様: `docs/spec/R-0121_hours_source_of_truth_unification.md`
- 根本原因: R-0119でフロントエンドの工数入力が動的カテゴリ方式（`voucher_line_costs`、`category_code=FACTORY_TIME/SITE_TIME`）へ切り替わったが、B1の`selectPlanningEstimateVouchers`/`sumHoursByVoucherIds`とB3の`fetchWorkPackagesByVoucherIds`（`api/routes/list_helpers.php`）は旧固定列（`cost_factory_hours`/`cost_site_hours`）のみを参照し続けていた
- 修正方針: `voucher_line_costs`を正規データ源とし、共通関数`fetchEffectiveLineHours`を新設。**カテゴリ単位**（行単位ではない）で「動的カテゴリ行が存在すれば値0でも採用、存在しなければ固定列へフォールバック」を判定。二重書き方式（保存時に固定列へも書く）は不採用
- 実装はAgent（r0121-impl）にTDD委譲。新規PHPテスト11件、指揮役が再実行して裏取り: `test_youkan_integration.php` 40/0、回帰スイート(`bash .claude/regression-suite.sh`) exit 0（vitest59ファイル324件＋PHPテスト13本）
- コミット`1db0ec4`→push→本番デプロイ済み（DB事前バックアップ`api/backups/database_20260827_1621_pre_r0121_hours_fix.sqlite`、本番側）。`/api/health`・アプリ200を確認済み
- frontend/index.htmlのWuunuスニペット（未コミットのローカル変更）はデプロイ時に一時stash→ビルド→復元済み（本番には持ち込んでいない）

### 【次セッション最優先】実案件（id=52）での本番最終確認
このセッションはYOUKAN_API_TOKEN等の認証情報を保持していないため、`/integrations/youkan/projects/52`をcurlで直接確認できなかった。また本番DBへの直接SQL読み取り（SSH経由sqlite3）は権限クラス分類器にブロックされたため実行していない（意図的な安全策、無理に回避していない）。**藤田晴樹さんに以下の実機確認をお願いすること**:
1. テスト案件（id=52）の見積伝票（id=5806、明細id=25488「どあ」・25489「わく」）を開き、現在の工場時間・現場時間の値を確認する（前回セッションで0/0へ復元予定だったが未確認のまま終了している）
2. 工場時間・現場時間を入力する（例: どあ8h/2h、わく4h/1h。前回R-0120検証時と同じ値で構わない）
3. 案件詳細画面の「Youkan容量判定」パネルで「再判定」ボタンを押し、不足時間が入力工数に応じて変化することを確認する（前回はこの反映が起きなかった箇所）
4. 可能であれば`YOUKAN_API_TOKEN`を使って`/integrations/youkan/projects/52`をcurl等で直接確認し、`baseline_source=estimate`・`baseline_hours`が正しい値・`work_packages`が工場/現場に分離して返ることを確認する
5. 検証後、入力した値はBeaver画面から元の値へ復元する（次に何かのテストで混乱しないよう）
6. 確認が取れたら`docs/requests_log.md`のR-0121を「完了」へ更新し、R-0120（B3のestimate baseline実機検証）も合わせて完了へ更新する
- **B3完了後もY2へは進まない**（藤田晴樹さんの明示指示、継続して有効）

---

## 過去の作業（2026-08-27）: R-0120 Beaver-Youkan連携B3（見積内訳のwork_packages公開）実装・デプロイ済み／【緊急】前提バグ発覚で一旦停止

### R-0120 — 実装完了・本番デプロイ済み（estimate baselineの実機検証は次項のバグ修正待ちで保留）
- 藤田晴樹さんの指示「B1/Y1/B2は完了。今回は開発計画のB3だけをSdDDの手順で仕様化・実装。Y2以降には進まない」より着手。仕様: `docs/spec/R-0120_youkan_work_packages_b3.md`、Youkan向け契約更新: `docs/spec/R-0117_youkan_api_contract.md`（§10 work_packages追加）
- 調査で判明した最重要点: 見積明細（`voucher_lines`）は1行に工場時間・現場時間の両方が乗りうる（計画書の想定図とは異なり列で分かれる）。work_packageは「明細行×工数種別（factory/site）」単位で生成し、識別子は`beaver:voucher:{voucher_id}:line:{line_id}:{category}`。baseline_hours算出（B1）と同一の選定済み計画基準見積からのみ生成し二重計上を防止
- 実装はCodex（TDD）へ委譲、指揮役が差分・テスト・回帰スイートを再実行して裏取り: `test_youkan_integration.php` 29 PASS/0 FAIL、`regression-suite.sh` exit 0。コミット`2748f06`→push→本番デプロイ（DB事前バックアップ`database_20260827_1429_pre_r0120_work_packages.sqlite`）
- 本番実機確認: manual/none案件（既存案件）で`work_packages: []`が正しく返り後方互換を確認済み

### 【緊急・最優先】次セッションでやること: R-0119以降の時間入力がbaseline_hours/Youkan容量判定に反映されないバグ
- R-0120のestimate baseline実機検証中に発覚。藤田晴樹さんがテスト案件（id=52）の見積伝票（id=5806、明細id=25488「どあ」・25489「わく」）にBeaver画面から工場時間・現場時間を入力（どあ8h/2h、わく4h/1h）したが、`/integrations/youkan/projects/52`に一切反映されず（`baseline_source`が`manual`のまま）
- 本番DB読み取り専用調査で確認した原因: R-0119でフロントエンドの時間入力が動的カテゴリ方式（`voucher_line_costs`、`category_code=FACTORY_TIME/SITE_TIME`）に切り替わったが、`LineItemRow.tsx`の`saveLineToDb`は`costs`配列のみ送信し`voucher_lines.cost_factory_hours`/`cost_site_hours`（固定列）を更新しなくなった。一方B1（`sumHoursByVoucherIds`等）・B3（`fetchWorkPackagesByVoucherIds`）はこの固定列だけを参照している
- **実害**: 本番稼働中のYoukan容量判定（B2）が、R-0119以降に時間入力された案件の工数を過小評価（実質0扱い）している可能性がある。業務判断に関わるため緊急扱い
- 詳細・対応方針案（`voucher_line_costs`優先・固定列フォールバック方式、フロントの`attachLineSubtables`/`fallbackCosts`と同じ考え方）は`docs/requests.md` -11に記録済み
- **本番テストデータ復元**: テスト案件id=52の明細（どあ・わく）の工場時間・現場時間は、藤田晴樹さんがBeaver画面から元の値（0/0）へ戻す予定（本セッション終了時点で復元未確認、次セッション冒頭で確認すること）
- 修正後、R-0120のestimate baseline（work_packages非空パターン）の本番実機検証を再実施し、`docs/requests_log.md`のR-0120を完了へ更新すること
- **B3完了後もY2へは進まない**（藤田晴樹さんの明示指示、継続して有効）

---

## 直近の作業（2026-08-26）: R-0119 伝票明細の時間入力・保存不具合の一括修正

### R-0119 — 検証中（実装・ローカル検証済み、コミット`3bd0292`、本番デプロイ未実施）
- 発端: 藤田晴樹さん報告「見積伝票画面に労務単価はあるのに時間数入力欄がない」「編集保存しても項目名が保存されない」。Codexレビュー＋指揮役裏取りで原因特定、仕様: `docs/spec/R-0119_voucher_line_fixes.md`
- 原因(a): 時間入力列は`measure_type='time'`の集計区分がある時だけ描画、労務単価列は無条件描画。マスタがmoney型のみ（or空）だと症状どおりになる。時間数は**time型区分を本番マスタへ追加**する方針（藤田晴樹さん決定）
- 原因(b): 集計区分0件時のLegacyRow（旧固定列UI）は全入力に保存処理なし＋新規伝票は明細を送信せず破棄＋sales_category_idがAPI許可リスト漏れ
- 実装済み（S2〜S6、Codex TDD委譲・差し戻し1回）: LegacyRow廃止（未同期時は警告表示）／新規伝票の明細保存（二重作成ガード付き）／sales_category_id保存／課税フラグDB正準値を`taxable`/`non_taxable`に統一（Access同期契約は日本語のまま境界変換、migration 026 dev適用済み）／costs・prices空配列クリア
- 検証済み: 回帰ゲート🔵青（vitest 323件・PHPテスト17ファイル）、R-0119 PHPテスト8/8、build成功。指揮役が再実行して裏取り

### R-0119 追加実装とデプロイ（2026-08-27、コミット`50032fb`）
- 本番実測: 集計区分マスタ**0件**（本番は旧UI=LegacyRowの列ずれが症状の正体）、catalog-system同期は認証ゲートで**401**、tax_category分布はクリーン、`tategu_item_cost_lines`・`voucher_line_costs`は空
- S1a: catalog-systemベースURLを`CATALOG_API_BASE`定数化（config.local.phpで上書き可、同期経路の認証対応はバックログ-10）
- S1b: fallback変換・建具原価再計算・列マッピング既定値を実マスタコード（MAIN/HARDWARE/GLASS/FACTORY_TIME/SITE_TIME）へ整合。localStorage保存済みの旧小文字コードは読み込み時に正規化。対応: **製作時間=工場時間、施工時間=現場時間**（藤田晴樹さん決定）
- S1c: migration 027で5区分をシード（dev・本番とも適用済み）
- デプロイ済み（事前承認あり）: バックアップ`api/backups/database_20260827_0034_pre_r0119.sqlite`→upload.ps1（Wuunuはstash→復元）→migration 026/027本番適用（taxable 24,351/non_taxable 1,133、5区分シード確認）→health/アプリ200

### R-0119の次の一手
1. **藤田晴樹さんの本番実機確認**: 伝票画面に工場時間(h)・現場時間(h)列が出る／旧伝票の金額・時間が表示される／品名編集が保存される／税額計算が正しい → OKなら台帳を「完了」へ
2. 新規伝票作成→明細入力→保存→再表示の一連も実機で確認できるとベター

---

## 直近の作業（2026-08-27）: R-0118 Beaver-Youkan連携B2（案件詳細のYoukan容量判定表示） ✅ 完了・本番デプロイ済み

### R-0118 — 完了（実装・本番デプロイ・本番検証まで完了）
- Youkan Y1（R-153、capacity-check API）本番検証完了を受けてB2に着手。仕様: `docs/spec/R-0118_youkan_capacity_check_b2.md`、Y1契約: Youkanリポジトリ `docs/SPEC/R-153_capacity_check_api_contract.md`
- 実装: `GET /projects/{id}/capacity-check`（BeaverバックエンドがYoukanへbackend-to-backendでPOST、障害時は常にHTTP200の`ok:false`で縮退）＋案件詳細の`CapacityCheckPanel`（Youkanのmessageを結論優先表示、feasible=緑/不足=赤/納期未設定=アンバー、縮退はグレー1行、再判定ボタン）
- Agent（r0118-impl）へTDD委譲（修正ループ0周）。PHPテスト10件＋vitest6件。回帰スイートへ`test_youkan_integration.php`（B1、登録漏れ）と`test_capacity_check.php`を登録
- コミット `e9abc34`、GitHub push・本番デプロイ済み（upload.ps1、Wuunuスニペットは一時stashしてビルド→復元済み）
- 本番実機確認済み: 案件一覧・詳細正常、容量判定パネルはトークン未設置のため縮退表示（=Youkan障害時と同じ経路が本番で機能している）、Beaver本体非影響
- 「Youkanで開く」ボタン: Y1契約にYoukanプロジェクトURL/IDが無く直接遷移を実装できないためB2では見送り（Y2以降の契約改版時に再評価、台帳に記録）

### 本番トークン設置・最終検証（2026-08-27）
- 採用した本番設定箇所: `api/config.php`が`api/config.local.php`（Git管理外・SSH経由で直接編集）を読み込む既存方式のまま。`.env`方式は使っていない（Youkan側の`.env`表現とBeaver側は別方式）
- `BEAVER_CAPACITY_TOKEN`（Youkan発行値）・`YOUKAN_CAPACITY_URL`（`https://door-fujita.com/contents/Youkan/api/integrations/beaver/capacity-check`）を本番`api/config.local.php`へ設置済み（値はSSH経由のみで扱い、Git・ログ・本記録には非出力）
- 実案件検証: id=52（テスト案件、赤字「9/5納期では8h不足（10/2なら入る）」）、id=48（納期未設定、アンバー「納期未設定・残り24h」）、id=42（進行中案件、赤字「8/29納期では64h不足（9/23なら入る）」）で正常応答・パネル表示・「再判定」ボタンとも実機確認済み
- excluded_status（完了/キャンセル案件）・Beaver側404（存在しない案件ID）のエラーマッピングも実API確認済み
- baseline_source manual→estimate切替: テスト案件(id=52)の見積明細へ一時的に工場時間12hを設定→Youkan判定が8h不足→12h不足へ変化することを確認、検証後は明細を0へ復元し8h不足へ戻ることも確認（変更前に本番DBバックアップ取得: `api/backups/database_20260827_r0118_pre_baseline_test.sqlite`）
- Youkan障害時の縮退: `YOUKAN_CAPACITY_URL`を一時的に到達不能アドレスへ切替えてcapacity-checkが200 `ok:false, reason:unreachable`で縮退し`/api/health`は200のまま保たれることを確認、検証後に実URLへ復元し正常応答が戻ることを確認
- Beaver通常業務（案件一覧・詳細の閲覧編集、見積伝票一覧表示等）への影響なしを確認
- `docs/requests_log.md` のR-0118を「完了」へ更新済み
- **B3（見積内訳の作業パッケージ公開）へは着手せず停止**（藤田晴樹さんの明示指示。別途指示を待つ）

---

## 直近の作業（2026-08-24）: R-0111 段取りボード + /readyoubou（R-0112〜R-0116）

### R-0111: 段取りボード（案件ガントチャート） — 検証中（実装・デプロイ済み、藤田晴樹さんの最終確認待ち）
- 新画面 `/dandori`（ナビ「段取り」）。工房のみんなで囲む段取り会議用ボード。仕様: `docs/spec/R-0111_dandori_board.md`、承認済みデザインモック: `docs/spec/R-0111_mockup.html`
- バー=開始日+工数の営業日換算（1日あたり時間は既存`AppSettingsContext.hoursPerDay`、土日は消化しない）、納期赤線、超過赤斜線+⚠バッジ、稼働数の帯+空きマーカー、8週間/6ヶ月/1年プリセット、ズーム、文字A−/A/A＋、折り返しモード（閲覧専用）、バー/納期線ドラッグで即保存
- 実機フィードバックでF1〜F5を追加対応（ページ横スクロール禁止=AppLayout mainにminWidth:0、開始日未設定一覧のDataTable化+「今日に置く」「次の空きに置く」、バー外ラベル黒文字表示）
- 実装はSonnetの3Agent（calc/settings/board）に並行委譲、計算ロジックはTDD（dandoriCalc.ts）
- コミット: `9bf4d88`→`d810a5c`→`cbf4e40`→`dd2305e`、いずれも本番デプロイ済み

### /readyoubou: 本番フィードバックid=22〜27対応（R-0112〜R-0116） ✅ 完了・本番デプロイ済み
- 手順・注意点は `docs/wiki/knowledge/readyoubou.md` に記録（**必読**: admin/feedbackトークンは`.claude/secrets/admin_feedback_token`。`api/config.local.php`をローカルに置くとPHPテストが壊れるので置かない）
- 内容はrequests_log.md参照（タブ名/よみがなバグ/Enter先頭候補確定/検索AND/既定ソート=ステータス工程順→納期昇順/バー外ラベル）

### このセッションの運用メモ
- `upload.ps1`実行は`.claude/settings.json`の許可ルール登録済み（**未コミットのまま**。コミット可否は藤田晴樹さん判断待ち）
- `frontend/index.html`にWuunuスニペット（未コミットのローカル変更）あり。**デプロイ時は一時的にHEADへ戻してビルドし、後で復元する**（本番に持ち込まない）
- 開発DBに段取りボード確認用のテスト案件6件を投入済み（山本工務店・田中様・社内等。本番には無関係）
- ローカルdevサーバー起動時、5178が勤怠管理TSUMUGIに使われているとViteが5179/5180へ自動退避する
- デプロイ成功時は番頭AI（ListAgentsの`BantoAI`）へ通知する（藤田晴樹さんの指示）

### 次の一手
- 藤田晴樹さんの本番確認（段取りボード全体・よみがな・検索）→ OKならR-0111を台帳で「完了」に更新
- バックログ: 折り返しモードのバー外ラベル対応（F5は横スクロールのみ）、`requests.md` -9（同期API認証）

---

## プロジェクト概要

**Beaver** — 藤田建具店向け 製造業見積・請求・案件管理 Webシステム。
既存の MS Access システムと並行稼働し、約1年後に Access を廃止する計画。

- **配置**: `C:\Fujiruki\Projects\Beaver\`
- **URL（本番）**: `https://door-fujita.com/contents/Beaver/`
- **URL（開発）**: `http://localhost:5178/contents/Beaver/`
- **API（開発）**: `http://localhost:8003`
- **Git**: `C:\Fujiruki\Projects\Beaver\.git`（masterブランチ）

---

## 直近の作業（2026-08-17〜18）: auth-hub連携ログイン基盤 + 番頭AI向けAPIトークン認証

### 本番の認証状態（重要・次セッションで必ず把握すること）
- Beaver全体が **auth-hub（`https://door-fujita.com/contents/auth/`）経由のログイン必須** になった（`api/config.local.php`の`AUTH_DRIVER='shared'`）
- `.htaccess`のBasic認証（R-0099、staff共有パスワード）は**撤去済み**
- `api/config.local.php`に`BANTO_API_TOKEN`設定済み（番頭AI専用の固定トークン、値は藤田晴樹さんへ会話内で直接申し送り済み、Git管理外）
- **AccessTategu連携用の同期API（`/projects/sync`, `/vouchers/sync`等）は引き続き無認証のまま**（`requests.md` -9として未着手・要リスク認識）

### R-0109: auth-hub連携によるログイン基盤の導入 ✅ 完了・本番デプロイ済み
- `requests.md` -7（社内共通認証基盤への移行）に着手。auth-hub本体は2026-08-14に本番稼働済み（Youkan・DotLogは連携済み）と判明したため、DotLog `docs/spec/08_auth-hub連携.md` を参考に仕様化
- 藤田晴樹さんの回答: (1) 全画面ログイン必須化、(2) 今回のスコープはログイン基盤のみ（`created_by`記録は別要望）、(3) AccessTategu同期API群は対象外（人間のログインと性質が違うため、従来のBasic認証のまま）
- 実装: `api/auth_client.php`（auth-hub正本コピー配布）・`api/auth_gate.php`（対象外パス判定）・`api/index.php`（認証ゲート＋`GET /me`新設）・フロント401ハンドリング・サイドバーのユーザー名表示/ログアウトボタン
- 実装はCodex（TDD）に委譲、指揮役が回帰スイート（vitest+PHPテスト）・`npm run build`を再実行して検証（1回目は`npm run build`のtscエラーを見落として指摘・再修正させた）
- 本番デプロイ前に本番DB・コード一式をバックアップ（`~/beaver_pre_r0109_backup/`、本番サーバー上のホームディレクトリ）
- デプロイ後、SSH経由でPHP CLIから認証ゲートの動作を直接検証、藤田晴樹さんが実機でログイン→操作→ログアウトを確認完了
- 二重保護だった`.htaccess`Basic認証（R-0099）を撤去（コミット `492565a`, `0bd4ba4`）
- 仕様: `docs/spec/R-0109_auth_hub_integration.md`

### R-0110: 番頭AI向けAPIトークン認証の追加 ✅ 完了・本番デプロイ済み
- `requests.md` -8（AI(番頭)がBeaverへ直接登録できるように）に着手。R-0109で全画面ログイン必須化した結果、ブラウザを持たない番頭AI（`C:\claude-workspace`）が通せなくなっていた問題への対応
- 既存の`ADMIN_FEEDBACK_TOKEN`と同じ単一固定トークン方式（`BANTO_API_TOKEN`、`Authorization: Bearer <token>`）を採用。DotLogの`dl_api_keys`（複数ユーザー管理・発行UI付き）は過剰と判断し採用しなかった
- claude-workspace側への申し送りドキュメント: `docs/wiki/knowledge/banto_ai_beaver_integration.md`（トークン実値は含まない、ベースURL・エンドポイント一覧・curl例のみ）
- 本番デプロイ・トークン発行（`openssl rand -hex 32`）・実HTTPS疎通確認（有効トークン=200、なし=401、`getallheaders()`フォールバックは不要と判明）まで完了（コミット `4f5d61e`）
- 発行したトークンは会話内で藤田晴樹さんへ直接申し送り済み。claude-workspace側`.env`の変数名は既存パターン（`YOUKAN_API_BASE`, `DOTLOG_API_KEY`）に揃えて `BEAVER_API_BASE` / `BEAVER_API_TOKEN` を提案した（**claude-workspace側の`.env`追記・APIクライアント実装は未対応、Beaverリポジトリの範囲外のため別セッションでの作業が必要**）
- 仕様: `docs/spec/R-0110_banto_api_token.md`

### `docs/requests.md` の整理
- `-1`〜`-6`（既に`requests_log.md`で完了記録済みだった項目）を削除
- `-7` → R-0109として仕様化・削除
- `-8` → R-0110として仕様化・削除
- `-9`（AccessTategu連携用の同期APIに認証を追加）を新規起票。**AccessTateguのVBAコードがこのマシン（backPC）に存在しない**ため着手を保留中。着手にはAccessTategu側へのアクセス手段の確保が必要

### ロールバック用バックアップ（本番サーバー上、次に問題が起きたら使う）
- `~/beaver_pre_r0109_backup/`（本番サーバーのホームディレクトリ）配下に複数世代のコード一式tar.gz、撤去前`.htaccess`のバックアップあり
- `api/backups/`配下に`database_*_pre_r0109_auth_hub.sqlite`, `database_*_pre_r0110_banto_token.sqlite`等のDBバックアップあり

### 次回セッションでやること
1. claude-workspace側（`C:\claude-workspace`をルートにした別セッション）で `.env` に `BEAVER_API_BASE` / `BEAVER_API_TOKEN` を追加し、APIクライアントを実装する
2. `-9`（AccessTategu同期APIへの認証追加）: AccessTateguのVBAコードへのアクセス手段を確保してから着手を検討する
3. その他バックログ: R-038（得意先マスタ双方向同期、未設計）、R-078（建具台帳の型定義とDBカラムの不整合）、TateguDesignStudio連携（未着手）

---

## 過去の作業（2026-08-05）: SdDDテンプレート改訂の導入 + R-0080 改善要望フィードバックフォーム

### SdDDテンプレート改訂 ✅ 完了
- 参照リポジトリが `C:\Fujiruki\00_AI共通\spec-docs-driven-dev-template` から `C:\Fujiruki\Projects\SDDD` に更新されていたため、Beaverへ安全にアップグレード適用
- `SDDD.md`（ツール非依存の正本ルール）・`AGENTS.md` を新規追加、`CLAUDE.md` を `sddd:rules`/`sddd:project` マーカー付きアダプター構成に変更（既存のBeaver固有ルールは無変更）
- `docs/request_log.md` → `docs/requests_log.md` にリネーム（git mv、履歴保持）
- 新しい要望IDは `R-0001` 形式（4桁連番）を採用。次の新規IDは `R-0080` から開始済み
- コミット `0a05d60`

### R-0080: 改善要望フィードバックフォーム ✅ 実装・検証完了、本番デプロイは未実施（ブロック中）
- Beaver内どの画面からも開ける「改善要望を送る」ボタン→本文＋画像最大5枚を添付して送信
- `feedback`/`feedback_images`テーブル（migration 022）、`POST /feedback`、`GET /admin/feedback`（`X-Admin-Token`認証、開発側=Claudeが本番データを直接読みに行く用）
- 実装はCodex（`codex:codex-rescue`）に委譲、TDDでPHPテスト8件・vitest 6件を追加。指揮役が再実行して検証: PHPテスト8/8 PASS、vitest 19ファイル108件 PASS、`npm run build` exit 0、`regression-suite.sh` exit 0（🔵青）
- 仕様: `docs/spec/R-0080_feedback_form.md`
- コミット `e479c1d`
- **本番デプロイは未実施**: `upload.ps1`が前提とするSSH鍵（`C:\Fujiruki\Projects\AI_DEVELOP_RULES\UPLOAD\key-2025-11-29-07-10.pem`）がこのマシン（backPC）上に存在せず（ディレクトリごと無い）、SSH接続がPermission deniedで失敗。FTPS代替手順（`docs/wiki/knowledge/deploy_ftps_fallback.md`）もアカウント`ai@door-fujita.com`の認証情報が必要で、このセッションには無い
- **次回セッションでやること**: (a) SSH鍵をbackPCへ配置してもらう、(b) FTPSアカウント情報を安全な経路で受け取る、(c) 藤田晴樹さん側で`upload.ps1`を実行してもらう、のいずれかで本番反映を完了させる。migration 022は`CREATE TABLE IF NOT EXISTS`のみで既存データに影響しない安全な追加のみ
- 本番反映時は他のmigrationと同様に事前バックアップ必須。`api/config.local.php`（`ADMIN_FEEDBACK_TOKEN`、Git管理外）を本番に手動設置することを忘れないこと（`upload.ps1`はこのファイルをステージングから除外するよう修正済み）

---

## 過去の作業（2026-07-14）: R-076完結 + 建具台帳原価モデル設計・P0実装・本番デプロイ

### R-076「Beaverと同期」統合 P2 ✅ 完了（AccessTategu側と合わせて完結）
- B2-2（`lines_mode==='replace'`でvoucher_lines全置換）: コミット`dd6e1fb`
- B2-3（`PATCH /vouchers/{id}/access-link`新設）: コミット`944e674`
- AccessTategu側（A2-1〜A2-4）も全て完了・検証済み。詳細はAccessTategu `docs/handover/20260714_セッション引き継ぎ.md` 参照

### 建具台帳の原価モデル設計・ADR化 ✅ 完了
- Access建具台帳（本体/金物/ガラス/労務費の行明細＋木材立米計算）とBeaver `tategu_items`（固定集計列）のギャップをCodexに静的調査させ、AccessTategu wiki `docs/wiki/integration/tategu_daicho_gap.md` にまとめた
- 設計をADR化: AccessTategu wiki `docs/wiki/adr/ADR-003_tategu_cost_model.md`。核心は「労務費をどこに合算するか」をハードコードせず、既存の`aggregation_category_master.merge_into_price_code`（現状は伝票行でのみ使用）を建具台帳側にも流用する設計にしたこと

### ADR-003 P0実装 ✅ 完了・本番デプロイ済み
- migration 021: `tategu_item_cost_lines`（本体/金物/ガラス統合、`category_code`参照）・`tategu_item_labor_lines`（労務費）を新設
- `PUT /tategu-items/{id}/cost-lines` / `/labor-lines`（全件入れ替え）＋`recalcTateguCost`拡張で`tategu_items`の固定集計列を明細から再計算するキャッシュに
- コミット `55b1e92`。regression-suite.sh（vitest+PHP7本）全緑
- **フロントUIは未実装**（今回はバックエンドのみ、次の作業候補の筆頭）

### 本番デプロイ ✅ 完了（SSH遮断のためFTPS代替手順を新規確立）
- `upload.ps1`前提のSSH/SCPがConoHa側でブロックされていたため、FTPS（明示的AUTH TLS）での代替デプロイを実施
- 手順・ハマりどころ（curl+Windows Schannelの451エラー対策等）は `docs/wiki/knowledge/deploy_ftps_fallback.md` に記録。次回SSHが使えない時はこれを参照
- migration 021は「本番でPHPスクリプトを一回限り実行してその場で適用」方式（ダウンロード→再アップロードのレース回避）。バックアップ: `api/backups/database_20260714_145125_pre_r076_tategu_cost_lines.sqlite`
- デプロイ範囲: 自分のP0実装 + 別作業でマージされていたDataTableソート機能（VoucherList/InvoiceList）等も含めmaster全体を本番同期

### 副次的発見
- 本番`aggregation_category_master`は現状0件（動的原価内訳の同期実績が無いため）。migration 021のseed（`merge_into_price_code`初期値）は無害な空振り。今後この機能を使い始めた時点で改めて設定が必要

### R-027b（本番日次バックアップ停止） ✅ 解決済み（同日中に追加着手）
- SSHは引き続き遮断中だったため、FTPS＋一回限りPHPスクリプト（`shell_exec`経由）で調査・復旧
- 根本原因: `backup.sh`がBeaverルート直下・git管理外に置かれており、`upload.ps1`のデプロイコマンド（ルート直下でapi/と*.sqlite以外を全削除）が2026-06-09以降の最初のデプロイで消していた。crontab自体は生きていた
- 復旧: `api/backup.sh`としてgit管理下に再構築（デプロイで保護される）、crontabを`/bin/bash`経由起動に変更（chmodリセットに強くする）、30日ローテーションを自動生成ファイルのみに限定（手動退避分を保護）。本番テスト実行で動作確認済み
- 詳細: `docs/requests.md` の R-027b（解決済みセクション）参照

### ADR-003 P0 フロントUI ✅ 完了（コミット `acb3f20`、本番未デプロイ）
- `TateguItemDetail.tsx`に材料費明細（`TateguCostLinesPanel`）・労務費明細（`TateguLaborLinesPanel`）の行編集パネルを新設。既存の「集計区分別内訳」セクションはそのまま維持
- 明細が存在する区分の固定集計列（本体材料費等）は読み取り専用表示に切替え、「明細から自動計算されます」と注記
- Codexに実装委譲→指揮役が`/code-review`（medium）を実施し、**明細を全削除して保存すると固定列が無警告で0円に上書きされる重大バグ（CONFIRMED）を検出**。原因はバックエンド`recalcTateguCost(forceLineRecalc=true)`が明細0件でも強制上書きする一方、フロントの保存順序が「本体更新→明細保存」だったため、ユーザーが再入力した固定列の値も明細保存側の強制ゼロ化で消えてしまう構造だった
- 修正をCodexに再委譲: 保存順序を「明細保存→本体更新」に変更し、本体更新のpayloadから明細が存在する区分の固定列キーを除外する方式で解消（バックエンドは無変更）。回帰テスト2本（明細あり/明細を全削除の両ケース）で固定
- 指揮役がテスト99件・ビルドを再実行して裏取り済み
- **本番デプロイ済み**（2026-07-14）: バックエンド無変更のためフロントエンド静的ファイルのみFTPS経由で同期（SSH引き続き遮断中）。デプロイ前バックアップ: `api/backups/database_20260714_181522_pre_adr003_frontend.sqlite`。疎通確認済み（新ビルドの参照・`/api/health`・`/api/tategu-items`とも正常）

---

## 現在の状態（2026-07-06）

### 実装済み（本番反映済み）

| フェーズ / R番号 | 内容 | 状態 |
|---|---|---|
| Phase 1〜6 | 設計〜UI刷新・原価管理まで全フェーズ | ✅ 完了 |
| R-025 | BA連携 Phase1（案件番号橋渡し） | ✅ 完了 |
| R-027 / R-027b | 定時バックアップ（2026-06-09〜停止していたが復旧・恒久化済み） | ✅ 本番反映済み |
| R-060 | 明細行updated_at配線・sync API拡張（Stage2まで） | ✅ 本番反映済み |
| R-065 | 「引用して売上」機能 | ✅ 本番反映済み |
| R-066 | AccessTategu ↔ Beaver 双方向同期（Phase1〜2まで） | ✅ 本番反映済み |
| R-067 | 得意先詳細の保存ボタンが機能しない | ✅ 本番反映済み |
| R-068 | 得意先検索のIMEインクリメンタルサーチ問題 | ✅ 本番反映済み |
| R-069 | 「＋新規得意先」ダイアログのフル画面化＋即時反映 | ✅ 本番反映済み |
| R-070 | 案件一覧・建具台帳一覧のIMEフォーカス喪失 | ✅ 本番反映済み |
| R-071 | 案件の保存ボタンが機能しない | ✅ 本番反映済み |
| R-076 | AccessTategu ↔ Beaver 統合同期（P1・P2） | ✅ 本番反映済み |
| ADR-003 P0 | 建具台帳 原価行明細テーブル（cost_lines/labor_lines）＋API | ✅ 本番反映済み |
| ADR-003 P0 フロントUI | 材料費明細・労務費明細の行編集パネル | ✅ 本番反映済み（`acb3f20`） |

### 検証状況（2026-07-14時点）

- `cd frontend && npx vitest run` → 全通過
- `bash .claude/regression-suite.sh`（vitest + PHPテスト7本）→ exit 0
- `cd frontend && npm run build`（tsc -b && vite build）→ exit 0

### migration 適用状況

| 環境 | 最新適用 |
|---|---|
| dev（ローカル） | 021（`tategu_cost_lines`）まで |
| prod（本番） | 021（`tategu_cost_lines`）まで適用済み（2026-07-14、FTPS経由。バックアップ: `api/backups/database_20260714_145125_pre_r076_tategu_cost_lines.sqlite`）。020相当のカラムは本番に手動追加済みで充足（migration自体は未適用、詳細はR-072-B） |

---

## 未対応リクエスト（要着手順）

詳細は `docs/requests.md` 参照。

| R番号 | タイトル | 種別 | 優先 |
|---|---|---|---|
| ADR-003 P1 | 木材原価サブドメイン（`wood_species_master`/`tategu_item_wood_lines`、立米計算） | 機能追加 | 中 |
| ADR-003 P2 | 集計区分の合算設定画面（`aggregation_category_master`の`merge_into_price_code`をUIから編集） | 機能追加 | 中 |
| R-072-B | projectsテーブルのdev/prodスキーマ乖離の棚卸し（本番手動追加分がmigration履歴に記録されていなかった） | 品質改善 | 中 |
| R-034 | validation 強化（silent NULL 許容など） | 品質改善 | 低（実運用での顕在化待ち） |
| R-035 | /projects/sync pagination + 重複対策 | 品質改善 | 低（実運用での顕在化待ち） |
| R-038 | 得意先マスタ双方向同期（未設計） | 機能追加 | 低 |

---

## 次タスク候補（優先順）

### 優先1: R-072-B（projectsスキーマ乖離の棚卸し）

本番`projects`テーブルの`PRAGMA table_info`とdevの`schema.sql`＋全migration適用後のスキーマを突合し、他に記録漏れがないか棚卸し。

### 優先2: ADR-003 P1/P2（木材原価サブドメイン・合算設定画面）

詳細はADR-003参照。

### 優先3: R-034/R-035（品質改善、低優先）

実運用で問題が顕在化してから着手する想定。`docs/requests.md` に詳細あり。

### 優先4: R-038（得意先マスタ双方向同期）

未設計。着手前に設計から必要。

---

## アーキテクチャ概要

### データフロー
```
得意先 → 案件 → 伝票（見積/売上）→ 請求書 → 入金
                  ↑
              建具台帳（品番マスタ・原価スナップショット）
                  ↑
            catalog-system（別プロジェクト、Phase 6以降）
```

### 重要な設計決定
- 見積と売上は `vouchers` テーブルに統合（`voucher_type='estimate'|'sales'`）
- 見積→売上は完全ディープコピー（`POST /vouchers/{id}/convert-to-sales`）
- 税計算は伝票単位（`tax_input_type='exclusive'|'inclusive'`）
- 原価スナップショット: 建具台帳選択時に自動ロード、`reload-snapshots` で一括再取得
- 伝票ステータス: `draft` → `submitted` → `approved` → `billed` / `void`
  - `billed` と `void` は編集不可（readonly 時に「編集できません」表示）
- 一覧画面のページネーション検索（`useCustomersPaged`/`useProjectsPaged`/`useTateguItemsPaged`）は
  `placeholderData: keepPreviousData` ＋ 検索inputの `onCompositionStart/End` ガードが必須パターン（R-068/R-070）。
  新規に同種の一覧検索を作る場合はこのパターンに揃えること。
- `ALTER TABLE ADD COLUMN` で後付け追加した列（本番/devとも）は非定数DEFAULTを持てないため、
  カラムDEFAULTに依存せず、アプリコードの全INSERT経路で明示的に値をセットすること（voucher_lines.updated_at統一で確定）。
- 本番SQLiteは3.7.17と古く、部分インデックス（WHERE句付きCREATE INDEX）等3.8.0+機能に非対応。
  migrationは単純な`ALTER TABLE ADD COLUMN`等の3.7.17互換構文に限定すること。

---

## 設計ドキュメント一覧

すべて `docs/` フォルダに格納。

| ファイル | 内容 |
|---|---|
| `20260316_依頼文.md` | ユーザー要件（原点） |
| `20260316_Beaver_01_概要とアーキテクチャ.md` | システム概要・技術スタック |
| `20260316_Beaver_02_DBスキーマ設計.md` | 全テーブル定義・税計算・原価→売価仕様 |
| `20260316_Beaver_03_画面設計_ワイヤー.md` | 全画面ワイヤーフレーム・UI構成表 |
| `20260316_Beaver_04_Accessデータ移行マッピング.md` | Access→Beaverフィールドマッピング |
| `20260317_Beaver_05_フロントエンド設計.md` | React設計・ディレクトリ構成・リアクティブ設計 |
| `requests.md` | 未対応リクエスト一覧 |
| `requests_log.md` | 完了済みリクエストの記録 |
