# Beaver→Youkan 案件工数API契約（B1版）

対象読者: **Youkan開発AI**。この文書だけでY1（Beaver案件の受け口・未配置負荷・容量シミュレーション）を実装できることを目的とする。コードを読まなくてよい。

- 発行: Beaver開発AI（R-0117 B1完了時点、2026-08-25／R-0120 B3で`work_packages`追加、2026-08-27）
- Beaver側仕様: `Beaverリポジトリ docs/spec/R-0117_youkan_integration_b1.md`、`docs/spec/R-0120_youkan_work_packages_b3.md`
- 計画書: `docs/2026-08-25_Beaver-Youkan連携開発計画.md`
- 契約バージョン: B1+B3（後方互換の追加。破壊的変更時は本文書を改版）

## 1. YoukanがcallするURL

```text
GET https://door-fujita.com/contents/Beaver/api/integrations/youkan/projects
GET https://door-fujita.com/contents/Beaver/api/integrations/youkan/projects/{external_project_id}
```

- 読み取り専用（GET以外は405）
- 一覧・単体とも同じオブジェクト形を返す
- 開発環境: `http://localhost:8003/integrations/youkan/projects`（Beaver開発サーバー直）

## 2. 認証方式

```text
Authorization: Bearer <YOUKAN_API_TOKEN>
```

- backend-to-backend専用の固定トークン。ブラウザから直接呼ばないこと
- トークンは Beaver本番の `api/config.local.php` に `YOUKAN_API_TOKEN` として定義（発行・共有は藤田晴樹さん経由。Git・本文書には値を書かない）
- このトークンで通るのは `/integrations/youkan/*` のみ（他のBeaver APIには使えない）
- トークンなし・不一致は `401 {"error":"unauthenticated"}`（Beaver共通認証ゲートの文言）
- テナント紐付けはYoukan側の連携設定で持つこと（「藤田建具店」を文字列ハードコードしない。計画書§12）

## 3. project IDの型

- `external_project_id`: **整数**（Beaver `projects.id`）。stable、再利用されない。**同期照合は必ずこのIDで行う**
- `project_code`: 文字列または**null**（例 "P00123"。人間用の表示コード。空文字の場合もありうる）。照合に使わないこと
- 案件名で照合しないこと（計画書§2の禁止事項）

## 4. baseline_hours の算出ルール

「現在この案件を何時間の仕事として扱うべきか」を常に**1値**で返す。

1. **計画基準見積があれば**その見積の Σ(工場時間×数量 + 現場時間×数量)（少数2桁丸め）
2. なければ案件登録時の概算 `manual_estimated_hours`
3. どちらもなければ `null`

計画基準見積 = 工数明細を持つ非void見積のうち最新の1件（→§6）。複数見積の合算はしない。

## 5. baseline_source の値域

| 値 | 意味 |
|---|---|
| `estimate` | 見積明細から算出（計画基準見積あり） |
| `manual` | 案件登録時の概算工数 |
| `none` | 工数情報なし（baseline_hoursはnull） |

ユーザーが確度を選ぶことはない。由来で自動決定される。Youkan側は `estimate` をより確度の高い値として扱ってよい。

## 6. 複数見積の正本ルール

1案件に複数の見積がありうる（初回20h→改訂22h等）。Beaverは以下で1件に定める:

- 対象: `voucher_type=estimate` かつ `status≠void` かつ 工数明細（工場or現場時間>0の行）を持つ見積
- 採用: `voucher_date` が最新の1件（同日なら作成が新しい方）
- 採用見積の合計だけが `baseline_hours`。**古い見積は加算されない**

注記: Beaverの見積ステータスには `approved` が存在するが実運用では未使用（2026-08-25実測: draft/submittedのみ）。将来approved運用が始まった場合「approved最新を優先」へ変更する可能性がある（変更時は本契約を改版して通知する）。

## 7. status の値域

`projects.status`（日本語文字列）。2026-08-25時点のマスタ値:

```text
問い合わせ / 見積済 / 受注済 / 進行中 / 納品済 / 完了 / 請求済 / キャンセル
```

- **マスタ（project_statuses）は設定画面から増減・改名されうる**。Youkanは未知の値を落とさず受け入れること
- 一覧APIは全ステータスの案件を返す。「キャンセル」「完了」を負荷計算から除外するのはYoukan側の責務
- 完全削除された案件は一覧から消える（tombstoneなし）。既知の `external_project_id` が返らなくなったら「Beaver側から消えたので要確認」として扱い、Youkan側の分解を勝手に消さないこと

## 8. delivery_date の意味

- 顧客への納期（YYYY-MM-DD、null許容）
- 「この日までに完了すべき」というBeaver側の商業上の期日。Youkanの容量シミュレーションの締切として使う
- 開始日・実行計画上の日付ではない（それらはYoukanが正本）

## 9. 差分同期の方法

一覧APIのクエリパラメータ:

| パラメータ | 意味 |
|---|---|
| `updated_after` | この日時より後に更新された案件のみ返す。**オフセット付きISO 8601で渡すこと**（例 `2026-08-25T09:00:00+09:00`。オフセットなしの文字列はサーバー既定タイムゾーンで解釈され曖昧になるため非推奨）。パース不能は400 |
| `limit` | 1ページ件数（既定200、最大1000） |
| `cursor` | 前回応答の `next_cursor` を渡すと続きを返す（id昇順のsince_id方式）。非数値は400 |

- 応答は `{ "data": [...], "next_cursor": <int|null> }`。`next_cursor` がnullになるまで繰り返す
- `updated_at`・`baseline_updated_at` は**JST（+09:00）オフセット付きISO 8601**（例 `2026-08-24T11:41:31+09:00`）。null許容（日時が取れない場合）
- 前回同期時に受け取った最大の `updated_at` をそのまま次回の `updated_after` に渡せる（オフセット付きなので曖昧さなし）
- `baseline_updated_at` = 案件更新と採用見積更新の新しい方。工数の変化検知にはこちらを使う
- ポーリング推奨間隔はYoukan側の判断でよい（B1では変更通知pushはない。B2でBeaver→Youkanのpushを追加予定）
- 冪等性: 同じ `external_project_id` を何度受けてもYoukanプロジェクトを増殖させないこと（計画書§12）

## 10. work_packages（B3, 2026-08-27追加。後方互換フィールド）

一覧・単体レスポンスの各案件オブジェクトに `work_packages` 配列が追加された。既存フィールドは無変更。

```json
"work_packages": [
  {
    "external_work_package_id": "beaver:voucher:55:line:101:factory",
    "label": "建具A",
    "category": "factory",
    "estimated_hours": 8.0,
    "source_voucher_id": 55,
    "source_line_id": 101,
    "updated_at": "2026-08-24T11:41:31+09:00"
  }
]
```

- `baseline_source` が `estimate` の案件のみ非空になりうる。生成元は必ず`baseline_hours`と同じ計画基準見積（§6）。`manual`/`none`の案件は常に `work_packages: []`
- `external_work_package_id`: 安定識別子。**名前照合をしないこと**（`label`は表示専用）。フォーマットは `beaver:voucher:{source_voucher_id}:line:{source_line_id}:{category}`だが、内部フォーマットに依存せず不透明な文字列として扱うこと
- `category`: `"factory"`（工場・製作作業）または`"site"`（現場・取付作業）の固定2値。Beaver設定画面で改廃されうる集計区分マスタとは独立した固定enum。将来値が増える場合は本文書を改版して通知する。未知の値は無視せず保持すること（前方互換）
- `estimated_hours`: 単位工数×数量を小数2桁に丸めた値。常に`> 0`
- **識別子の非連続性**: 対象の見積伝票が新しい見積へ切り替わる（B1§6の計画基準見積選定ルールにより）、見積内の行が削除・再作成される、またはAccessTategu同期の全置換が発生すると、`external_work_package_id`が入れ替わる（旧IDが消え新IDが現れる）。これは仕様であり、**受け取ったID集合から前回存在したIDが消えたら「Beaver側から消えたので要確認」として扱い、Youkan側の既存分解を自動削除しないこと**（計画書§8）
- **baseline_hoursとの整合性**: `Σ(work_packages[].estimated_hours)` は `baseline_hours` と完全一致しない場合がある（丸め方式の違いによる0.01h未満の誤差を含め得る）。Youkan側で `unallocated_hours = baseline_hours - Σ(estimated_hours)` を都度計算すること（負値=work_packages側が超過している状態もあり得る）。Beaver側はダミーパッケージで埋めない・baseline_hoursを書き換えない・不一致の警告も返さない
- 詳細な調査結果・設計根拠: `docs/spec/R-0120_youkan_work_packages_b3.md`

## 11. サンプルJSON

一覧 `GET /integrations/youkan/projects?limit=2`:

```json
{
  "data": [
    {
      "source": "beaver",
      "external_project_id": 123,
      "project_code": "P00123",
      "name": "○○様邸 建具工事",
      "customer_name": "○○様",
      "status": "受注済",
      "delivery_date": "2026-09-10",
      "baseline_hours": 20.0,
      "baseline_source": "manual",
      "baseline_updated_at": "2026-08-25T09:00:00+09:00",
      "updated_at": "2026-08-25T09:00:00+09:00",
      "work_packages": []
    },
    {
      "source": "beaver",
      "external_project_id": 124,
      "project_code": null,
      "name": "図書館 引戸改修",
      "customer_name": "△△市",
      "status": "問い合わせ",
      "delivery_date": null,
      "baseline_hours": null,
      "baseline_source": "none",
      "baseline_updated_at": "2026-08-24T19:30:00+09:00",
      "updated_at": "2026-08-24T19:30:00+09:00",
      "work_packages": []
    }
  ],
  "next_cursor": null
}
```

見積基準（`baseline_source=estimate`）の案件は例えば:

```json
{
  "source": "beaver",
  "external_project_id": 125,
  "project_code": "P00125",
  "name": "△△様邸 建具工事",
  "customer_name": "△△様",
  "status": "受注済",
  "delivery_date": "2026-09-20",
  "baseline_hours": 17.0,
  "baseline_source": "estimate",
  "baseline_updated_at": "2026-08-26T10:00:00+09:00",
  "updated_at": "2026-08-26T10:00:00+09:00",
  "work_packages": [
    {
      "external_work_package_id": "beaver:voucher:60:line:201:factory",
      "label": "建具A",
      "category": "factory",
      "estimated_hours": 8.0,
      "source_voucher_id": 60,
      "source_line_id": 201,
      "updated_at": "2026-08-26T10:00:00+09:00"
    },
    {
      "external_work_package_id": "beaver:voucher:60:line:201:site",
      "label": "建具A",
      "category": "site",
      "estimated_hours": 2.0,
      "source_voucher_id": 60,
      "source_line_id": 201,
      "updated_at": "2026-08-26T10:00:00+09:00"
    },
    {
      "external_work_package_id": "beaver:voucher:60:line:202:factory",
      "label": "建具B",
      "category": "factory",
      "estimated_hours": 6.0,
      "source_voucher_id": 60,
      "source_line_id": 202,
      "updated_at": "2026-08-26T10:00:00+09:00"
    },
    {
      "external_work_package_id": "beaver:voucher:60:line:202:site",
      "label": "建具B",
      "category": "site",
      "estimated_hours": 1.0,
      "source_voucher_id": 60,
      "source_line_id": 202,
      "updated_at": "2026-08-26T10:00:00+09:00"
    }
  ]
}
```

単体 `GET /integrations/youkan/projects/123` は上記オブジェクト単体を返す。存在しないIDは `404 {"error":"Not found"}`。

## 実装済みの追加（履歴）

- B2（2026-08-27完了）: Youkanの容量判定結果のBeaver表示。Beaver内部の画面系API（`GET /projects/{id}/capacity-check`）であり本契約（`/integrations/youkan/*`）には変更なし。詳細: `docs/spec/R-0118_youkan_capacity_check_b2.md`
- B3（2026-08-27完了）: 見積内訳の作業パッケージ公開。`work_packages`フィールドを本契約へ後方互換で追加（本書§10）

## 本契約にまだ含まれないもの（今後の予定）

- Beaver→Youkanへの保存時push（B2完了時点でも未実装。YoukanはB1と同様に判定前にB1 APIを都度再取得するため現時点では不要。将来のB2拡張として再評価）
- 見積のサブプロジェクト・タスクへの段階分解（Y2、Youkan側の責務）
