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
