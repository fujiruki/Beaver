# Beaver CLAUDE.md

<!-- このファイルは Claude Code 向けのアダプターです。SdDDの正本ルールは SDDD.md に置きます。 -->

<!-- sddd:rules:start -->
## SdDD adapter

作業を始める前に、必ずプロジェクト直下の [SDDD.md](SDDD.md) を読む。その規則が、要望・仕様・タスク・検証の正本である。

- 会話で受けた要望は、仕様の検討を始める前に `docs/requests.md` へ原文のまま記録する
- 仕様が確定するまで実装を始めない。確定時には、`SDDD.md` の手順に従い、要望台帳・仕様・タスクを更新してから該当の入力を `requests.md` から取り除く
- 要望IDの採番、状態の変更、公開範囲、他要望への統合は、すべて `SDDD.md` の規則に従う
- Claude Code の補助コマンドを使える場合は `.claude/commands/` を使う。ただし、コマンドの説明より `SDDD.md` を優先する

<!-- sddd:rules:end -->

<!-- sddd:project:start -->
建具店向け 見積・売上・請求・案件管理 Web システム。

## 最初に読むべきファイル

作業開始前に以下を確認すること：

1. **このファイル（CLAUDE.md）** — 環境・ルール
2. **`Hikitsugi.md`** — 直前の作業内容・現在地・次のタスク
3. **`docs/`** — 設計ドキュメント（DB設計・画面設計・フロー解説）

## システム概要

```
得意先 → 案件 → 伝票（見積/売上）→ 請求書 → 入金
                  ↑
              建具台帳（品番マスタ・原価）
```

- フロントエンド: React + TypeScript (Vite) — `frontend/`
- バックエンド: PHP + SQLite — `api/`
- DB: `api/database.sqlite`（1ファイル、バックアップ不要）

## 開発サーバー起動

```powershell
# バックエンド（別ターミナル）
cd C:\Fujiruki\Projects\Beaver\api
php -S localhost:8003 index.php

# フロントエンド
cd C:\Fujiruki\Projects\Beaver\frontend
npm run dev
```

アクセス: http://localhost:5178/contents/Beaver/

## 実装済み機能（2026-03-17時点）

- 得意先 CRUD
- 案件 CRUD
- 伝票（見積・売上）作成・編集・明細行管理・行操作（複製/挿入/移動）
- 建具台帳 CRUD・カタログ連携（catalog-system プロキシ）
- 請求書
- 入金管理
- 売上種別マスタ（設定画面あり）
- 粗利・純利益率・日割り粗利サマリー

## DB スキーマ概要

主要テーブル:

| テーブル | 役割 |
|---|---|
| `customers` | 得意先マスタ |
| `projects` | 案件 |
| `vouchers` | 伝票ヘッダー（見積/売上） |
| `voucher_lines` | 伝票明細行 |
| `tategu_items` | 建具台帳（品番マスタ・原価） |
| `tategu_item_additions` | 建具の追加工程 |
| `invoices` | 請求書 |
| `payments` | 入金 |
| `sales_categories` | 売上種別マスタ |

マイグレーション管理: `api/migrations/` — 適用済みは `applied.txt` に記録。

## 主要ファイルマップ

```
api/
├── index.php                  # ルーティング（全エンドポイント一覧はここ）
├── routes/                    # 各リソースのCRUD実装
└── migrations/                # DBスキーマ変更履歴

frontend/src/
├── App.tsx                    # ルーター定義（全画面一覧はここ）
├── api/client.ts              # fetchラッパー（BASE = /contents/Beaver/api）
├── api/*.ts                   # TanStack Query フック（customers.ts を見本に）
├── components/voucher/        # 伝票の核心コンポーネント群
│   ├── VoucherHeader.tsx      # 伝票ヘッダーフォーム
│   ├── LineItemRow.tsx        # 明細行（16列）
│   └── TotalSummary.tsx       # 合計・粗利サマリー
├── lib/voucherCalc.ts         # 計算ロジック（税計算・粗利計算）
├── pages/VoucherEdit.tsx      # 伝票編集画面（最大・最複雑なコンポーネント）
└── types/                     # 型定義
```

## コーディングルール

- ページは `src/pages/` に配置
- APIフックは `src/api/{リソース名}.ts` に配置（`customers.ts` を見本にする）
- 型定義は `src/types/{リソース名}.ts` に配置
- APIは `api.get/post/put/delete` 経由（`api/client.ts`）
- Vite proxy: `/contents/Beaver/api/*` → `localhost:8003/*`
- 全コメント・ドキュメント・コミットメッセージは日本語

## 技術スタック

- React 19 + TypeScript + Vite
- TanStack Query（サーバー状態）
- React Hook Form（フォーム）
- Tailwind CSS + インラインスタイル混在（既存コードに合わせる）
- React Router v6

## テスト

```bash
cd frontend && npx vitest run
```

`frontend/src/lib/__tests__/voucherCalc.test.ts` に計算ロジックのテストあり。新しい計算関数を追加したら必ずテストを書くこと。

## 引き継ぎ

セッション開始時: `Hikitsugi.md` を確認する。
セッション終了時: `Hikitsugi.md` を更新する（何をした・何が残っているか）。

## ループエンジニアリング協議（黒/青ゲートの取り決め）

**TDDの「赤/緑」とループの「黒/青」は別物。混同しない。**
- TDD: 🔴赤=仕様先行の失敗テスト（進捗・正規手順） / 🟢緑=実装で通る
- ループ: ⚫黒=回帰ゲートでブロック（回帰 or 未完） / 🔵青=回帰なし・完了OK

### 完了(Stop)の定義
- Beaver では Stop 時に回帰ゲート `.claude/hooks/regression-gate.sh` が走る。🔵青（回帰スイート＝vitest + PHPテスト3本が全通過）で完了を許可、⚫黒で差し戻す。
- ゲートは「未コミット変更がある時のみ」「Beaverリポジトリのみ」自己ゲートして実行（会話だけのStopや他プロジェクトでは走らない）。
- セッションを Beaver ディレクトリ起点で起動したときに有効化される（親ルート起動では発火しない）。

### 反復上限（黒のときの動き）
- 黒で差し戻されたら修正して再挑戦。ただし**同一エラーが2回続いたら自動継続を止め**、原因を報告して人間／指揮役の判断を仰ぐ。
- 1タスクの修正ループは目安**5周**まで。超えたら実装をやめて設計に戻る。

### anti-cheat（黒を青に見せかける禁止行為）
- テスト削除・アサーション緩和・skip／コメントアウト・エラー握り潰しで通すのは**禁止**。
- 🟢緑／🔵青は「実装が正しい」結果であって目的化しない。テストが実バグを捉えているなら、テストではなく**コードを直す**。

### TDDの🔴赤を潰さない
- コミット時に all-green を強制しない（TDDの赤テストのコミットは正規手順）。
- 🔵青を要求するのは Stop（赤→緑を回し終えた地点）のみ。
- TDDの赤で**意図的に停止**する場合は回帰ゲートを一時無効化する（`/hooks` メニュー、または `.claude/settings.local.json` で上書き）。

### 委譲の規律（worktree・トークン予算・fixer）
- **委譲前にトークン予算と再試行上限を宣言**する（暴走防止）。例:「最大5周・同一エラー2回で停止・上限◯◯k」。バックグラウンド委譲時も同様。
- **並行修正は worktree で隔離**する。複数エージェントが同時にファイルを書く場合は `isolation: worktree` を使い、競合を避ける（単一ファイル逐次なら不要）。
- **行き詰まったバグ・回帰(⚫黒)は専門エージェント `fixer`（`.claude/agents/fixer.md`）に委譲**する。別コンテキストで再現→根因→最小修正→TDDで固定。
- 指揮役は実装を直接編集せず、報告（コマンドと生ログのパス）を**再実行して判定**する（verify-before-trust）。
<!-- sddd:project:end -->
