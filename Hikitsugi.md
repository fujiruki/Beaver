# 引き継ぎ資料 — Beaver

**最終更新**: 2026-07-04

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

## 本日の作業（2026-07-04）: R-067〜R-070

得意先まわりのバグ修正・改善を4件、TDD（赤→緑）で実施。全てローカルのみ、**本番未反映**。

### R-067: 得意先詳細の保存ボタンが機能しない ✅ 完了
- 赤 2c55c60 / 緑 b8354b3
- 原因: `CustomerDetail.tsx` のフォームに `noValidate` がなく、メール欄など不正値がある得意先でネイティブ検証がsubmitを黙ってブロックしていた。

### R-068: 得意先検索のIME変換中フォーカス喪失 ✅ 完了
- 赤 a6af90c / 緑 5b44a8e
- 真因: `CustomerList.tsx` の `if (isLoading) return <div>読み込み中...</div>;` が、検索文字列変更のたびに `useCustomersPaged` の isLoading が true に倒れて画面全体（検索input含む）を再マウントしていた。IME変換1文字目確定時にinputごと消えてフォーカス喪失→変換強制打ち切り。
- 対処: `useCustomersPaged` に `placeholderData: keepPreviousData` を追加 + `onCompositionStart/End` で変換中フラグ管理、変換確定時のみ検索発火。

### R-069: 「＋新規得意先」ダイアログのフル項目化 ✅ 完了
- 赤 e693c2e / 緑 8239dcb（改善点1）、3123145（改善点2の回帰テスト）
- `CustomerDetail.tsx` のフォーム部分を `components/CustomerFormFields.tsx` に抽出し、`CustomerDetail.tsx` と `NewCustomerModal.tsx` の両方から共有。ダイアログが得意先詳細と同等の全項目（郵便番号・住所・請求情報等）を入力可能に。
- 改善点2（登録後の得意先検索候補への即時反映）は調査の結果、`ProjectDetail.tsx` の `handleCustomerCreated`（`refetchCustomers()` 呼び出し）で既に実装済みと判明。新規実装はせず、回帰テストのみ追加して固定。

### R-070: 案件一覧・建具台帳一覧の同一パターン修正 ✅完了
- 赤 eaa8d70 / 緑 e6e6c86
- R-068の真因調査で発覚した同罪画面。`ProjectList.tsx`・`TateguItemList.tsx` にもR-068と全く同じ構造（`useProjectsPaged`/`useTateguItemsPaged` に placeholderData なし + isLoading早期return + compositionガードなしonChange）があったため、確定済みパターンをそのまま横展開。

要望管理: R-067/068/069/070 とも `docs/requests.md` から `docs/request_log.md` へ移動済み（dcfd553, 9830ba2）。

---

## 現在の状態（2026-07-04）

### 実装済み

| フェーズ / R番号 | 内容 | 状態 |
|---|---|---|
| Phase 1〜6 | 設計〜UI刷新・原価管理まで全フェーズ | ✅ 完了 |
| R-025 | BA連携 Phase1（案件番号橋渡し） | ✅ 完了 |
| R-027 | 定時バックアップ | ✅ 完了 |
| R-060 | 明細行updated_at配線・sync API拡張（Stage2まで） | ✅ dev 実装済み（本番未デプロイ） |
| R-065 | 「引用して売上」機能 | ✅ dev 実装済み（本番未デプロイ） |
| R-066 | AccessTategu ↔ Beaver 双方向同期（Phase1〜2まで） | ✅ dev 実装済み |
| R-067 | 得意先詳細の保存ボタンが機能しない | ✅ 完了（本番未デプロイ） |
| R-068 | 得意先検索のIMEインクリメンタルサーチ問題 | ✅ 完了（本番未デプロイ） |
| R-069 | 「＋新規得意先」ダイアログのフル画面化＋即時反映 | ✅ 完了（本番未デプロイ） |
| R-070 | 案件一覧・建具台帳一覧のIMEフォーカス喪失 | ✅ 完了（本番未デプロイ） |

### 検証状況（2026-07-04時点）

- `cd frontend && npx vitest run` → 全7ファイル **40/40** 通過
- `cd frontend && npm run build`（tsc -b && vite build）→ exit 0

### migration 適用状況

| 環境 | 最新適用 |
|---|---|
| dev（ローカル） | 019（`voucher_lines_updated_at`）まで |
| prod（本番） | 017（`quoted_at`）まで ← **018・019 が未適用（2世代遅れ）** |

---

## 未デプロイ事項（重要）

**本日コミットした内容を含め、直近の実装は全てローカルのみで、本番（ConoHa）には一切反映していない。**

- migration 018（`last_synced_at`）・019（`voucher_lines_updated_at`）が prod 未適用
- R-060 Stage2・R-065・R-066・R-067・R-068・R-069・R-070 は dev 実装済みだが本番未反映
- 本番デプロイは指揮役管理の**デプロイ列車**でまとめて実施する方針（AccessTategu 側 R-060 Stage1 完了後に着手予定）。個別デプロイはしない。

---

## 未対応リクエスト（要着手順）

詳細は `docs/requests.md` 参照。

| R番号 | タイトル | 種別 | 優先 |
|---|---|---|---|
| R-034 | validation 強化（silent NULL 許容など） | 品質改善 | 低（実運用での顕在化待ち） |
| R-035 | /projects/sync pagination + 重複対策 | 品質改善 | 低（実運用での顕在化待ち） |
| R-038 | 得意先マスタ双方向同期（未設計） | 機能追加 | 低 |

---

## 次タスク候補（優先順）

### 優先1: デプロイ列車（dev/prod乖離解消）

migration 018・019 の本番適用と、R-060・R-065〜R-070 の本番反映。AccessTategu側 R-060 Stage1 完了後にまとめて実施予定（指揮役管理）。

### 優先2: R-034/R-035（品質改善、低優先）

実運用で問題が顕在化してから着手する想定。`docs/requests.md` に詳細あり。

### 優先3: R-038（得意先マスタ双方向同期）

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
| `request_log.md` | 完了済みリクエストの記録 |
