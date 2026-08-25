# R-0117: Beaver-Youkan連携 B1（案件工数の外部契約API）

計画書: `docs/2026-08-25_Beaver-Youkan連携開発計画.md`（B1節）。B1では**Beaver単体で完結する読み取り契約**のみを作る。Youkanへのpush・容量表示は作らない。

Youkan AIへの引き渡し文書（API契約の正本）: `docs/spec/R-0117_youkan_api_contract.md`

## 設計ゲートの調査結果（2026-08-25、本番DB実測）

- 見積伝票1,890件（draft 13 / submitted 1,877）。**approvedは実運用で未使用**
- 案件に紐づく（project_id NOT NULL）非void見積は**0件**（大半はAccess同期の過去伝票でproject_id NULL）
- 工数は現状すべて `manual_estimated_hours`（50案件中31件入力済み）
- 複数の工数つき見積を持つ案件は実質0件（1件ヒットしたのはproject_id NULLグループ）

## 確定仕様

### 複数見積の正本ルール（設計ゲートの決定）

**「工数明細（cost_factory_hours>0 または cost_site_hours>0 の行）を持つ非void見積のうち、最新の1件」を計画基準見積とする。**

- 「最新」= `voucher_date` 降順、同日なら `id` 降順
- approvedは実運用で使われていないため優先条件にしない（将来approved運用が始まったら「approved最新を優先」への変更を再検討。契約にもその旨注記）
- これにより初回見積20h＋改訂見積22h→42hになる合算バグを構造的に防ぐ
- **既存の `effective_estimated_hours`（一覧・段取りボードの工数目安）も同じ正本ルールに載せ替える**。現本番データでは挙動差ゼロ（紐づき見積0件のため）だが、将来Beaverで見積を作り始めたときにUIとYoukan契約が食い違うのを防ぐ。既存回帰テストで挙動維持を固定

### baseline の算出

| 状態 | baseline_hours | baseline_source |
|---|---|---|
| 計画基準見積あり | その1件の Σ(cost_factory_hours×qty + cost_site_hours×qty) | `estimate` |
| 見積なし・manual入力あり | `manual_estimated_hours` | `manual` |
| どちらもなし | `null` | `none` |

ユーザーに確度を入力させず、由来で自動決定（計画書§4.3）。

### API

- `GET /integrations/youkan/projects` — 一覧。クエリ: `updated_after`（任意）、`limit`（既定200・最大1000）、`cursor`（since_id方式）。応答 `{ "data": [...], "next_cursor": <int|null> }`
- `GET /integrations/youkan/projects/{id}` — 単体。無ければ404
- 完全一致ルーティングガード必須（`/integrations/youkan/projects/xxx/yyy` は404。R-034(b)の教訓）
- 読み取り専用（GET以外は405）

### 認証

- `Authorization: Bearer <YOUKAN_API_TOKEN>`（`api/config.local.php` で定義、BANTO_API_TOKENと同方式・別トークン）
- **YOUKAN_API_TOKENが通すのは `/integrations/youkan/*` のみ**（最小権限）。BANTOトークンの既存挙動は変更しない
- auth_gate: `/integrations/youkan/` パスはauth-hubログイン対象外とし、代わりに上記Bearer必須。トークン不一致・なしは401

### 対象案件・削除の扱い

- 一覧は全ステータスの案件を返す（キャンセル・完了含む）。除外判定はYoukan側が `status` で行う
- 完全削除（R-0095）された案件は一覧から消える。IDは再利用されないため、Youkanは既知IDが返らなくなった場合「Beaver側から消えたので要確認」として扱う（tombstoneは提供しない）

### AccessTategu既存契約への影響

なし（新規パスのみ。`/projects/sync` 等は無変更。既存テストで回帰確認）。

## 実装構成

| ファイル | 内容 |
|:--|:--|
| `api/routes/integrations_youkan.php`（新規） | 一覧・単体エンドポイント |
| `api/routes/list_helpers.php` | 正本ルールの共通関数（計画基準見積の選定＋baseline算出）。`fetchEstimatedHoursByProjectIds` をこのルールに載せ替え |
| `api/index.php` | ルーティング追加 |
| `api/auth_gate.php` | YOUKAN_API_TOKEN判定（対象パス限定） |
| `api/config.php` | YOUKAN_API_TOKEN の開発用フォールバック |
| `api/tests/test_youkan_integration.php`（新規） | TDD（正本ルール・API・認証・ガード） |

## 受け入れ条件（計画書§6の終了条件に対応）

1. `GET /integrations/youkan/projects` が正しいBearerで200・契約どおりのJSONを返し、トークン不一致/なしは401
2. baseline_hours/baseline_source が正本ルールどおり（estimate優先・最新1件のみ・manualフォールバック・none）
3. 複数の工数つき見積がある場合に合算されないことをテストで固定
4. `effective_estimated_hours` が同じ正本ルールで算出され、既存回帰テスト（vitest・PHP全件）グリーン
5. updated_after/limit/cursor の差分同期が機能する
6. 完全一致ルーティングガード（余分なパスセグメントは404）
7. AccessTategu系テスト（test_sync等）無変更でグリーン
8. API契約文書 `R-0117_youkan_api_contract.md` が計画書§13の10項目を満たす
