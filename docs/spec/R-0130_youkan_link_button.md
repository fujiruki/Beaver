# R-0130: 案件編集画面・案件一覧に「Youkanで見る」ボタン

## 背景

藤田晴樹さんより会話内で直接（2026-08-31）:

> 案件編集画面から、この案件のYoukanで見るボタンが欲しい。案件一覧の各行にも欲しい。

R-0118（B2）検討時にも同種要望が出たが、当時はYoukanのプロジェクトURL/IDをBeaverへ返す契約が無く見送られ、「Y2以降の契約改版時に再評価」と`requests_log.md`に記録されていた。今回調査した結果、Y2完了後もこの経路は未整備のままだったため、藤田晴樹さんに実装方針を確認: **「Youkan側に新規APIを追加して正確な遷移を実装する」**を選択（Youkan一覧への一般リンクにとどめる代替案は不採用）。

## 前提: Youkan側の対応

Youkanリポジトリ側に新しいAPIを追加してもらう（本要望を受けてBeaver側で仕様化・Youkan側へ申し送り済み）。

- 契約: `Youkanリポジトリ docs/SPEC/13_Beaver連携プロジェクトURL.md`
- エンドポイント: `GET /integrations/beaver/project-link/{external_project_id}`
- 認証: 既存の`BEAVER_CAPACITY_TOKEN`（R-0118で設置済みのYoukan発行トークン）をそのまま再利用。新しいトークンは発行しない
- レスポンス（200）: `{"external_project_id": 123, "youkan_project_id": "...", "title": "...", "tenant_id": "..."}`
- レスポンス（404）: `{"error":"...","reason":"not_found"}`（案件がまだYoukanと連携（同期）されていない場合）

**このBeaver側実装は、Youkan側のAPIが実装・デプロイされて初めて動作する。Youkan側の実装状況を確認してから着手すること。**

## Youkan側URLの組み立て

Youkanのフロントエンド（`JWCADTategu.Web/src/App.tsx`の`handleOpenCloudProject`）は、以下のURLクエリで特定プロジェクトを直接開く機構を持つ（調査済み・既存機能）:

```text
{Youkanフロントエンドのベース}Focus?projectId={youkan_project_id}&title={title}&tenantId={tenant_id}
```

- 本番: `https://door-fujita.com/contents/Youkan/Focus?projectId=...&title=...&tenantId=...`
- 開発: `http://localhost:5173/contents/Youkan/Focus?projectId=...&title=...&tenantId=...`

URLの組み立てはBeaverバックエンド側で行う（Youkanは構成要素のみ返す契約のため）。

## 設計

### 1. バックエンド設定（新規定数、`api/config.php`）

既存の`YOUKAN_CAPACITY_URL`/`BEAVER_CAPACITY_TOKEN`（R-0118）と同じパターンで追加する:

```php
if (!defined('YOUKAN_PROJECT_LINK_BASE_URL')) define('YOUKAN_PROJECT_LINK_BASE_URL', 'http://localhost:8000/integrations/beaver/project-link');
if (!defined('YOUKAN_FRONTEND_BASE_URL'))     define('YOUKAN_FRONTEND_BASE_URL', 'http://localhost:5173/contents/Youkan/');
```

本番は`api/config.local.php`（Git管理外）で上書きする:
- `YOUKAN_PROJECT_LINK_BASE_URL` = `https://door-fujita.com/contents/Youkan/api/integrations/beaver/project-link`
- `YOUKAN_FRONTEND_BASE_URL` = `https://door-fujita.com/contents/Youkan/`

`BEAVER_CAPACITY_TOKEN`は新規追加不要（既存の値をそのまま使う）。

### 2. バックエンド: `GET /projects/{id}/youkan-link`（新規プロキシ）

`api/routes/projects.php`の既存`capacity-check`プロキシ（R-0118、151〜212行目付近）と同じ構造・同じ縮退方針で追加する。

- 対象案件が存在しなければ404
- Youkanへ`GET {YOUKAN_PROJECT_LINK_BASE_URL}/{resourceId}`（`Authorization: Bearer <BEAVER_CAPACITY_TOKEN>`）
- 200時: `youkan_project_id`・`title`・`tenant_id`を受け取り、`YOUKAN_FRONTEND_BASE_URL . 'Focus?' . http_build_query([...])`でURLを組み立て、`{"ok": true, "url": "..."}`を返す
- 404時（Youkan未連携）: `{"ok": false, "reason": "not_found", "message": "この案件はまだYoukanと連携されていません"}`
- その他のエラー（401/403/503・接続不可等）: `capacity-check`と同じ`config`/`unreachable`の縮退メッセージパターンを踏襲（`{"ok": false, "reason": "...", "message": "..."}`）
- **常にHTTP 200でレスポンスする**（`capacity-check`と同じ設計思想: Youkan障害・未連携がBeaver本体の動作やUIの表示崩れを引き起こさないようにする）
- GET以外は405

### 3. フロントエンド: 共通コンポーネント`YoukanLinkButton`

案件編集画面・案件一覧の両方で同一のUI・挙動が必要なため、`frontend/src/components/YoukanLinkButton.tsx`を新設する（`CapacityCheckPanel.tsx`とは別。あちらは判定結果を常時表示するパネル、こちらはクリック時にのみ問い合わせる軽量ボタン）。

- props: `projectId: number`
- 見た目: 小さいボタン/リンク（例:「Youkanで見る ↗」）。案件一覧では行内に収まるサイズ（アイコンのみでも可）
- クリック時:
  1. `GET /projects/{id}/youkan-link`を呼ぶ（ローディング状態を短時間表示してよい）
  2. `ok: true`なら`window.open(result.url, '_blank', 'noopener,noreferrer')`で新規タブを開く
  3. `ok: false`なら遷移せず、簡潔なメッセージ（`message`フィールドの値、または「Youkanに接続できませんでした」）をトースト/インライン表示する
- 案件一覧（`ProjectList.tsx`、PC版DataTable・スマホ版簡素リスト行の両方）でのクリックは、行クリック（詳細遷移）の伝播を止める（`stopPropagation`、R-0129の得意先一覧の電話番号リンクと同じパターン）
- API呼び出しはクリック時のみ（一覧表示時に全行分を先読みしない。N+1呼び出し回避）

### 4. 配置

- 案件編集画面（`ProjectDetail.tsx`）: 既存の`<CapacityCheckPanel projectId={projectId} />`（490行目付近）の近くに`<YoukanLinkButton projectId={projectId} />`を配置する。新規案件（`isNew`）では表示しない（Youkanへの連携は既存案件のみ）
- 案件一覧（`ProjectList.tsx`）: DataTableの操作列（`actions`カラム、編集/削除ボタンの並び）に追加。R-0129のスマホ簡素リスト行には追加しない（簡素リストは詳細遷移のみに絞る設計のため、Youkanボタンは案件詳細画面から使う想定。スマホでの利用頻度が高いと分かれば別途追加を検討）

## TDD必須

バックエンド（PHP）:
- [ ] Youkan 200応答時、正しく`url`を組み立てて`{"ok":true,"url":"..."}`を返す（`http_build_query`のエンコードを含め検証）
- [ ] Youkan 404応答時、`{"ok":false,"reason":"not_found",...}`を返す
- [ ] Youkanへの接続不可時、`{"ok":false,"reason":"unreachable",...}`を返す
- [ ] Beaver側に存在しない案件IDは404
- [ ] 常にHTTP 200で応答する（`ok:false`のケースも200）
- [ ] GET以外は405

フロントエンド（vitest）:
- [ ] `YoukanLinkButton`クリックで`ok:true`応答時、`window.open`が正しいURLで呼ばれる
- [ ] `ok:false`応答時、`window.open`が呼ばれずメッセージが表示される
- [ ] 案件一覧の行内で使った場合、クリックしても行の詳細遷移（`onRowClick`）が発火しない

## 受け入れ条件

1. 案件編集画面（既存案件）に「Youkanで見る」ボタンが表示され、クリックするとYoukanの該当プロジェクトが新規タブで開く
2. 案件一覧（PC版DataTable）の各行に同ボタンがあり、クリックしても行の詳細遷移は発火せず、Youkanの該当プロジェクトが新規タブで開く
3. Youkan未連携の案件でクリックした場合、遷移せず「まだYoukanと連携されていません」等のメッセージが表示される
4. Youkanが到達不能でも、Beaver本体（案件編集・案件一覧の他機能）は正常に動作し続ける
5. 新規案件作成画面にはボタンを表示しない
6. 既存のテスト・ビルド・回帰スイートが通る
