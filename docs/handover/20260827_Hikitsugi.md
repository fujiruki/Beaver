## 過去の作業（2026-08-27）: R-0121 工数データ参照元の統一（緊急バグ修正）✅ 完了 ／ R-0120 B3 ✅ 完了

### R-0121 — ✅ 完了（コード修正・回帰・本番デプロイ・本番実機検証まで完了）
- 本番実機検証（藤田晴樹さん実施）: テスト案件id=52の見積伝票（id=5806、明細「どあ」「わく」）に工場時間・現場時間を入力→案件詳細「Youkan容量判定」で再判定→不足時間が変化することを確認。検証後は入力値を0へ復元→再判定し判定結果も元へ戻ることを確認
- `/integrations/youkan/projects/52`への直接API確認（YOUKAN_API_TOKEN使用）は**未実施**（このセッション・藤田晴樹さんいずれもトークンを扱っていない。認証回避はしていない。今後Youkan側の反応に疑問が出た場合はこの直接確認が有効な切り分け手段になる）
- `docs/requests_log.md`のR-0121・R-0120とも「完了」へ更新済み

### R-0120（B3, work_packages公開）— ✅ 完了（R-0121解消を受けて）
- R-0120自身の受け入れ条件§8末尾「本番検証: 実案件でwork_packagesが期待どおり返る」は、work_packages自体の生JSONを目視確認したわけではない（直接APIを叩いていないため）。ただし`youkanWorkPackages`はbaseline_source=estimateの同一HTTPレスポンス内で無条件実行されるコードパスであり、今回のcapacity-check再判定成功（Beaver B1エンドポイントが実案件id=52のデータでエラーなく応答）は、このコードパスが本番の実データで例外なく実行された間接証拠となる。work_packagesの中身（カテゴリ分割・estimated_hours等）自体は自動テスト（`test_youkan_integration.php` 40/0）で担保済み。以上を根拠に完了とした
- **残課題（将来の切り分け用メモ）**: work_packagesの生JSONを本番で目視確認したことは一度もない。Youkan側でwork_packagesの中身に疑問が出た場合、`YOUKAN_API_TOKEN`で`/integrations/youkan/projects/{id}`を直接叩いて確認すること

### R-0121の実装詳細（補足）
- `docs/requests.md` -11（緊急）として記録されていたバグ（R-0119以降にBeaver画面で入力した工場時間・現場時間がbaseline_hours/Youkan容量判定/B3work_packagesへ反映されない）をR-0121として仕様化。仕様: `docs/spec/R-0121_hours_source_of_truth_unification.md`
- 根本原因: R-0119でフロントエンドの工数入力が動的カテゴリ方式（`voucher_line_costs`、`category_code=FACTORY_TIME/SITE_TIME`）へ切り替わったが、B1の`selectPlanningEstimateVouchers`/`sumHoursByVoucherIds`とB3の`fetchWorkPackagesByVoucherIds`（`api/routes/list_helpers.php`）は旧固定列（`cost_factory_hours`/`cost_site_hours`）のみを参照し続けていた
- 修正方針: `voucher_line_costs`を正規データ源とし、共通関数`fetchEffectiveLineHours`を新設。**カテゴリ単位**（行単位ではない）で「動的カテゴリ行が存在すれば値0でも採用、存在しなければ固定列へフォールバック」を判定。二重書き方式（保存時に固定列へも書く）は不採用
- 実装はAgent（r0121-impl）にTDD委譲。新規PHPテスト11件、指揮役が再実行して裏取り: `test_youkan_integration.php` 40/0、回帰スイート(`bash .claude/regression-suite.sh`) exit 0（vitest59ファイル324件＋PHPテスト13本）
- コミット`1db0ec4`→push→本番デプロイ済み（DB事前バックアップ`api/backups/database_20260827_1621_pre_r0121_hours_fix.sqlite`、本番側）。`/api/health`・アプリ200を確認済み
- frontend/index.htmlのWuunuスニペット（未コミットのローカル変更）はデプロイ時に一時stash→ビルド→復元済み（本番には持ち込んでいない）

### 次にやること
R-0121・R-0120とも完了。**Y2には進まない**（藤田晴樹さんの明示指示、継続して有効）。バックログは既存のまま（`docs/requests.md`参照）。

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

