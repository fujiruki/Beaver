# Beaver 仕様書 目次

## システム概要

建具製造業向けの見積・売上・請求・入金管理システム。
得意先→案件→見積→売上→請求→入金の業務フロー全体をWeb上で完結させる。
既存のMS Accessシステム（AccessTategu）と並行稼働し、段階的にAccessを廃止する計画。

**コードベース**: `C:\Fujiruki\Projects\Beaver\`
**本番URL**: `https://door-fujita.com/contents/Beaver/`
**開発URL**: `http://localhost:5178/contents/Beaver/`

---

## 仕様書一覧

| ファイル | 内容 | 最終更新 |
|---|---|---|
| [01_概要.md](spec/01_概要.md) | コンセプト・業務フロー・用語定義 | 2026-03-21 |
| [02_機能仕様.md](spec/02_機能仕様.md) | 各機能の詳細仕様・計算ロジック | 2026-03-21 |
| [03_画面設計.md](spec/03_画面設計.md) | 全14画面の構成・VoucherEditの詳細 | 2026-03-21 |
| [04_データ設計.md](spec/04_データ設計.md) | DBスキーマ・型定義・API一覧 | 2026-03-21 |
| [05_技術設計.md](spec/05_技術設計.md) | 技術スタック・ディレクトリ構成・設計パターン | 2026-03-21 |
| [06_変更履歴.md](spec/06_変更履歴.md) | 仕様変更の経緯と理由 | 2026-03-21 |
| [R-0080_feedback_form.md](spec/R-0080_feedback_form.md) | 改善要望フィードバックフォーム（画像複数添付） | 2026-08-05 |
| [R-0081_R-0082_feedback_modal_improvements.md](spec/R-0081_R-0082_feedback_modal_improvements.md) | フィードバックモーダルの視認性修正・クリップボード貼り付け | 2026-08-05 |
| [R-0083_search_multi_property.md](spec/R-0083_search_multi_property.md) | 検索の複数プロパティ対応 Phase1（得意先 + ComboSelect） | 2026-08-05 |

---

## 現在地（2026-03-21時点）

- Phase 1〜6: 完了（全画面実装・伝票改修・動的集計区分対応）
- Phase 7: AccessTategu連携（設計完了・未実装）
- テスト: voucherCalc.ts に25件（全通過）

## アーカイブ

旧ドキュメントは `docs/archive/` に移動済み。
- `archive/20260317_Beaver_05_フロントエンド設計.md` — React設計書
- `archive/UserVoice/` — ユーザー要件メモ（伝票仕様、Access連携仕様）
