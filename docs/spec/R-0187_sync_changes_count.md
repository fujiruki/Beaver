# R-0187: Access起動時に「Beaverで変わったものがあるか」を数える窓口（GET /sync/changes）

- 依頼: 2026-10-20 dodai-back（藤田晴樹さんの決定、AccessTategu R-0192）
- 状態: 仕様確定（案A、dodai-backと合意）

## 背景

Accessは起動時に、前回プルの後にBeaverで変わったものがあるかだけを軽く確かめ、あれば自動で同期する。`GET /sync/status`はAccessのheartbeatの時刻だけを返すので代わりにならない。

## API

`GET /sync/changes?since=<YYYY-MM-DD HH:MM:SS（JST）>`

- 認証: `/sync/status`と同じ（df_sessionは免除、`SYNC_TOKEN_REQUIRED=true`の間は`SYNC_API_TOKEN`必須）
- `since`が無い・形式不正なら400 `{"error": "Invalid since"}`
- 応答200: `{"customers": N, "vouchers": N, "projects": N, "server_time": "YYYY-MM-DD HH:MM:SS"}`（`server_time`はJST）。中身は返さない

数え方（`since`はUTCに直して比べる。voidも数える）:

| 表 | 条件 |
|---|---|
| vouchers | `updated_at > since` かつ（`last_synced_at`がNULL、または`updated_at > last_synced_at`） |
| customers | 同上 |
| projects | `updated_at > since`（`last_synced_at`の列が無いため。Accessのpush分も入るが、Accessが案件を送るのはまれなので許容） |

Accessからのpushは`updated_at`と`last_synced_at`を同じ時刻にするので、伝票・得意先ではAccessが自分で送った分は数えない。

## 受け入れ条件（テスト）

1. Beaverで伝票を更新（`updated_at > last_synced_at`）し`since`より後 → vouchers 1
2. Accessのpushで更新された伝票（`updated_at == last_synced_at`）→ 数えない
3. `last_synced_at`がNULLで`updated_at > since`の伝票 → 数える
4. `updated_at <= since`の伝票 → 数えない
5. void済みの伝票も1の条件なら数える
6. 得意先で1〜4と同じ
7. 案件は`updated_at > since`で数える
8. `since`なし・形式不正 → 400 `Invalid since`
9. `server_time`はJSTの`YYYY-MM-DD HH:MM:SS`
10. 認証: `SYNC_TOKEN_REQUIRED=true`でトークンなし → 401、正しいトークン → 200、df_sessionは不要
