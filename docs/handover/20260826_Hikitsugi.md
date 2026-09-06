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

