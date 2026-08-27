# R-0118: Beaver-Youkan連携 B2（案件詳細のYoukan容量判定表示）

計画書: `docs/2026-08-25_Beaver-Youkan連携開発計画.md`（§7 B2節）。
前提契約:

- B1（Beaver→Youkan読み取り契約）: `docs/spec/R-0117_youkan_api_contract.md`
- Y1（Youkan容量判定API契約）: Youkanリポジトリ `docs/SPEC/R-153_capacity_check_api_contract.md`（2026-08-25確定、本番検証済み）

## 要望原文（藤田晴樹さん、2026-08-26会話）

> Youkan Y1（R-153）は本番デプロイ・実データ検証まで完了しました。次は開発計画の Beaver B2だけ をSdDD手順で進めてください。B3には進まないでください。
> B2の目的は、BeaverからYoukanを「別の管理画面」として使わせることではなく、Beaverで案件を扱っているその場で、「この案件は今の仕事量に入るか」「納期まで何時間不足するか」「何日頃まで実質埋まっているか」を判断できるようにすることです。
> 実装方針: (1) BeaverバックエンドからYoukanの POST /integrations/beaver/capacity-check を呼ぶこと。ブラウザからYoukanへ直接アクセスしない。(2) リクエストはBeaver projects.id を external_project_id として渡す。(3) Youkan側は判定前にBeaver B1 APIから案件を再取得するため、Beaver側で「同期完了待ち」は不要。(4) Beaver案件詳細では、容量判定を結論優先で表示する。Youkanレスポンスの message はそのまま利用してよい。(5) feasible / shortage_minutes / earliest_completion_date / saturated_through / evaluated_at などは、必要なら補助表示に使ってよいが、数値を大量に並べるUIにはしない。(6) 一覧表示のたびに全案件へcapacity-checkを大量発行する設計は避けること。B2ではまず案件詳細中心でよい。必要なら明示的な「入るか確認」操作や適切なキャッシュ方針を仕様化すること。(7) Youkan障害時でもBeaver本体の案件登録・見積・請求等を止めないこと。容量判定は補助機能として縮退させる。(8) Youkan APIが200で「Beaver再取得失敗・前回同期値で判定」と返した場合は、その注意書きを隠さない。(9) 納期未設定は「入らない」と断定せず、Youkanのmessageに従って「納期未設定・残りXh」等として扱う。(10) 既存要望の「Youkanで開く」ボタンはB2内で再評価。実装するなら対応するYoukanプロジェクトを直接開けるものとし、単にYoukanトップへ飛ばすだけにはしない。ただしB2本体を複雑化しないこと。(11) B2では見積明細をYoukanのサブプロジェクトへ展開しない（B3→Y2の仕事）。(12) B2完了後は、本番疎通・実案件でcapacity-check・Youkan停止時の縮退・Beaver通常業務への非影響を検証して止まる。
> BEAVER_CAPACITY_TOKEN等の本番設定値が必要なら、秘密値はGitへ書かず、必要な設定名と配置場所だけ報告。B2終了時にはB3へ進まず一度停止し、実装内容・本番検証結果・B3へ渡す事項を報告。

## 目的

Beaverの案件詳細画面で、その場で「この案件は今の仕事量に入るか」「納期まで何時間不足するか」「何日頃まで実質埋まっているか」を判断できるようにする。容量判定の正本はYoukan。Beaverはキャパシティ計算ロジックを持たない。

## スコープ

- **やる**: バックエンドプロキシ（Beaver→Youkan capacity-check）＋案件詳細画面の結論優先表示
- **やらない**: 案件一覧への容量表示（大量発行になるためB2では対象外。必要になったら別要望で「明示的な確認操作 or キャッシュ方針」を仕様化）、見積明細のサブプロジェクト展開（B3→Y2）、Beaver保存時のYoukanへのpush（YoukanはY1で判定前にB1 APIから都度再取得するため、B2では判定に不要。計画書§7.1のpushは将来のB2拡張またはB3時に再評価）

## API（Beaver内部・画面系）

```text
GET /projects/{id}/capacity-check
```

- 通常の画面系認証ゲート内（auth-hubログイン必須。`authGateIsExempt` 対象外パス）
- Beaverバックエンドが Youkan `POST /integrations/beaver/capacity-check` を `{"external_project_id": {id}}` ＋ `Authorization: Bearer <BEAVER_CAPACITY_TOKEN>` で呼び、結果を整形して返す。**ブラウザからYoukanへ直接アクセスしない**
- 判定は読み取り専用（Youkan側もスケジュールを書き換えない）ため、フロントから見たメソッドはGET
- タイムアウト15秒（YoukanがB1再取得＋EDF計算を行うため余裕を持つ）

### レスポンス（常に200。Beaver本体を巻き込まない縮退のため、Youkan障害もHTTPエラーにしない）

成功時:

```json
{ "ok": true, "result": { ...Y1契約のレスポンスをそのまま... } }
```

縮退時:

```json
{ "ok": false, "reason": "unreachable", "message": "Youkanに接続できないため、容量判定は現在利用できません" }
```

| reason | 発生条件（Youkan応答） | message（Beaver側で生成） |
|:--|:--|:--|
| `unreachable` | 接続不可・タイムアウト・502・5xx | Youkanに接続できないため、容量判定は現在利用できません |
| `excluded_status` | 404 かつ reason=excluded_status | このステータスの案件はYoukanの負荷計算対象外です |
| `not_found` | 404 かつ reason=not_found | Youkanが案件を見つけられませんでした |
| `config` | 401 / 403 / 503 / 400 | Youkan連携の設定に問題があります（管理者に連絡してください） |

- Youkanが200で返した `message` 末尾の「（Beaver再取得失敗・前回同期値で判定）」は `result.message` にそのまま含まれるため、加工せず表示する（隠さない）

## 設定（Git管理外の秘密値）

| 定数 | 開発フォールバック（`config.php`） | 本番（`config.local.php`、Git管理外） |
|:--|:--|:--|
| `BEAVER_CAPACITY_TOKEN` | `dev-beaver-capacity-token-change-me` | Youkan側で発行したトークン（藤田晴樹さん経由で設置） |
| `YOUKAN_CAPACITY_URL` | `http://localhost:8000/integrations/beaver/capacity-check` | `https://door-fujita.com/contents/Youkan/api/integrations/beaver/capacity-check` |

## フロントエンド（案件詳細 `ProjectDetail.tsx`）

- 編集時（既存案件）のみ「Youkan容量判定」パネルを表示。新規登録画面では出さない（YoukanがB1で再取得できるのは保存済み案件のみ）
- 画面表示時に自動で1回判定（TanStack Query `useQuery`、`staleTime` 60秒・`retry: false`）＋「再判定」ボタン（refetch）。連打対策はstaleTime＋ボタンのisFetching無効化で行う（Y1契約§7）
- **結論優先表示**: `result.message` を主表示（例「9/10納期では3h不足（9/12なら入る）」「納期未設定・残り20h」）。数値の羅列はしない
  - 色: `feasible=true` → 緑 / `feasible=false` かつ `deadline` あり → 赤 / `deadline` null（納期未設定） → アンバー（「入らない」と断定しない）
  - 補助表示は `evaluated_at`（判定時刻）のみ小さく添える
- 縮退時（`ok: false`）: パネル内にグレーの1行で `message` を表示するだけ。案件の閲覧・編集・保存など本体機能には一切影響させない（判定失敗でエラーモーダル等を出さない）

## 「Youkanで開く」ボタンの再評価（結論: B2では見送り）

- Beaverリポジトリの要望台帳・requests.mdに該当の既存要望は見つからなかった
- Y1契約にはYoukan側プロジェクトのID・URLを返すフィールドがなく、「対応するYoukanプロジェクトを直接開く」は現契約では実装できない（単にYoukanトップへ飛ばすだけのボタンは作らない、という条件を満たせない）
- → B2では実装しない。Youkanが対応プロジェクトのURL/IDを契約で返すようになった時点（Y2以降の契約改版時）に再評価する

## 受け入れ条件

1. 案件詳細を開くと、Youkan稼働時は結論メッセージ（Y1の `message`）が表示される
2. `feasible` / 納期未設定で表示色が変わり、納期未設定を「入らない」と断定しない
3. 「（Beaver再取得失敗・前回同期値で判定）」がmessageに含まれる場合、そのまま表示される
4. Youkan停止時（接続不可・5xx）はパネルがグレーの注意書きに縮退し、案件の閲覧・編集・保存は正常に動く
5. `excluded_status` の案件では「負荷計算対象外」と表示される
6. ブラウザからYoukanへの直接リクエストが発生しない（すべてBeaverバックエンド経由）
7. トークン・URLはGit管理外（`config.local.php`）。リポジトリに秘密値を含まない
8. 既存回帰スイート（vitest＋PHPテスト）が全通過（AccessTategu連携・B1 APIに影響なし）

## 検証（B2終了条件、計画指示(12)）

- [x] 本番疎通（Beaver本番→Youkan本番 capacity-check が200）（2026-08-27）
- [x] 実案件でのcapacity-check結果確認（id=52/48/42、excluded_status・404も確認）
- [x] Youkan停止時の縮退動作確認（URL到達不能を模擬、200 `ok:false, reason:unreachable`、`/api/health`は200のまま）
- [x] Beaver通常業務（案件登録・見積・請求）への非影響確認
- [x] baseline_source manual/estimate双方の判定結果確認、manual→estimate切替でYoukan判定工数が変化することを確認（検証後にテストデータを復元）

## 実装構成

| ファイル | 内容 |
|:--|:--|
| `api/routes/projects.php` | `GET /projects/{id}/capacity-check` 追加（Youkanへのプロキシ） |
| `api/config.php` | `BEAVER_CAPACITY_TOKEN` / `YOUKAN_CAPACITY_URL` の開発用フォールバック |
| `api/tests/test_capacity_check.php`（新規） | TDD（スタブ Youkan サーバーで成功・縮退・エラーマッピングを固定） |
| `frontend/src/api/capacityCheck.ts`（新規） | useQueryフック |
| `frontend/src/components/CapacityCheckPanel.tsx`（新規） | 結論表示パネル |
| `frontend/src/pages/ProjectDetail.tsx` | パネル組み込み（編集時のみ） |
