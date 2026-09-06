# R-0143: Dodaikun（AccessTategu）⇔ Beaver 同期契約（Phase A）

作成: 2026-09-06。**正本は AccessTategu `docs/Dodaikun_Beaver連携設計.md`**（設計判断はそちらで変える。本書は Beaver 側が実装に使う契約の写し）。前提: R-0140（R-086 連携契約）、R-0141（Beaver_beta）。

## 1. 決定事項（晴樹さん 2026-09-06）

- 運用の主戦場: Beaver＝案件・得意先・見積・売上／Access＝見積・売上・請求・入金・売掛。
- 「Access の伝票・売掛・請求の計算の流れが一番正しい。Beaver をそちらに合わせる」。Beaver 独自の請求モデル（画面入力の金額をそのまま保存）は採用しない。
- 得意先・伝票は双方向＋競合解消。案件は Beaver のみで作成・編集（Beaver→Access）。請求・入金の Beaver 側編集は Phase B（本番切替後）。売掛は同期しない。
- Beaver 発得意先の仮コード域は 90001〜。

## 2. 原則（Beaver に関わるもの）

1. 共通 ID の発行者は Dodaikun。Beaver 発のレコードは Access が採番し `access-link` で書き戻す。
2. `last_synced_at` の発行者は **Beaver サーバ**。push／access-link の応答に `last_synced_at`（サーバ時刻）を必ず含める。Access はそれを書き戻す。
3. 削除は同期しない。
4. Access で請求済み（`access_billed_flag=1`）の伝票は Beaver で編集不可。取消で解除。
5. 締め処理・繰越・請求金額は Dodaikun だけが計算する。Beaver は写しを持つ。`carry_forward_balance` は Access の値で上書きのみ。

## 3. スキーマ変更（Beaver_beta で先に適用。`reset_beta_db.ps1` の `$betaOnlyMigrations` に追加）

| migration | 内容 |
|:--|:--|
| 030 | `vouchers.access_billed_flag INTEGER NOT NULL DEFAULT 0`、`access_billing_date DATE`、`access_receivable_id INTEGER` |
| 031 | `invoices.access_receivable_id INTEGER UNIQUE`、`access_cancelled_at DATETIME` |
| 032 | `payments.access_payment_no INTEGER UNIQUE`、`origin TEXT NOT NULL DEFAULT 'access'` |
| 033 | `billing_requests`（Phase B。Phase A では作らない） |

## 4. API 契約（Phase A）

| メソッド | パス | 認証 | 内容 |
|:--|:--|:--|:--|
| GET | `/customers/sync?updated_after&limit&cursor` | 同期トークン | **済（A-B-01）**。応答 `{synced_at, customers[], next_cursor, next_cursor_at}`。`carry_forward_balance` を含めない。`gender/mobile/fax/is_active` を含める（追補） |
| GET | `/vouchers/sync` | 同期トークン | 応答の各伝票に `access_billed_flag`・`access_billing_date`・`lines[]`（`line_no, item_name, quantity, price, updated_at`）を追加 |
| POST | `/vouchers/sync` | 同期トークン | 受信 `billed_flag`（→`access_billed_flag`）・`billing_date`（→`access_billing_date`）・`cutoff_day`（Access 側で 0→31 変換済み）・`receivable_id`（→`access_receivable_id`）。応答に `last_synced_at`。`lines_mode`: `edited_in_beaver=1` の行が無ければ replace |
| PATCH | `/vouchers/{id}/sync-state` | 同期トークン | 新設。`{sync_pending: bool}`。Access 側で競合待ちの伝票に印を付ける |
| POST | `/invoices/sync` | 同期トークン | 新設。`access_receivable_id` で upsert。列: `customer_access_no`（→`customer_id` 解決）, `cutoff_day`, `billing_date`, `carry_forward`, `sales_total`, `tax_total`, `payment_received`, `invoice_total`, `next_carry_forward`, `voucher_access_ids[]`（→`invoice_vouchers`）, `cancelled_at`（→`access_cancelled_at`。削除しない） |
| POST | `/payments/sync` | 同期トークン | 新設。`access_payment_no` で upsert。列: `customer_access_no`, `payment_date`, `amount`, `memo`, `receivable_id`（→`invoice_id` 解決、無ければ NULL） |
| POST | `/sync/heartbeat` | 同期トークン | 新設。`{synced_at, source: 'access'}` を保存 |
| GET | `/sync/status` | **通常認証（`df_session`）** | 新設。最終同期時刻・同期先 AppID |
| GET | `/projects/sync` | 同期トークン | `deleted_at` を返す（論理削除列が無ければ追加） |
| PATCH | `/customers/{id}/access-link` | 同期トークン | 済（R-0140(2)） |

### 認証（A-B-08）

- `authGateIsExempt` の `strpos($path,'/sync')` 部分一致をやめ、**完全一致の免除一覧**にする: `/vouchers/sync`、`/customers/sync`、`/projects/sync`、`/invoices/sync`、`/payments/sync`、`/sync/heartbeat`、`#/access-link$#`、`#/vouchers/\d+/sync-state$#`。
- 免除パスは `Authorization: Bearer <SYNC_API_TOKEN>` を必須にする（R-0110 の BANTO トークンと同方式、`config.local.php`）。移行フラグ `SYNC_TOKEN_REQUIRED`（既定 false）。Beaver_beta で先に true。
- `/sync/status` は免除しない。

### 請求済みロック（A-B-02）

- `assertVoucherEditable` を `status='billed' OR access_billed_flag=1` に拡張。
- `access_billed_flag=1` の伝票を触る全経路を 409: `PUT/PATCH/DELETE /vouchers/{id}`、明細の追加・変更・削除、`POST /invoices`（`voucher_ids` に含む）、`DELETE /invoices/{id}` の `status` 巻き戻し、`POST /history/{id}/restore`。
- 応答 409 の body: `{"error":"locked_by_access","billing_date":"yyyy-mm-dd"}`。

### 請求・入金編集の封印（A-B-05）

- `BILLING_EDIT_ENABLED`（`config.php`、既定 false、`config.local.php` で上書き）。false のとき `POST /invoices`・`DELETE /invoices/{id}`・`POST /payments`・`DELETE /payments/{id}`・`POST /history/{id}/restore`（請求書・入金対象）・`PATCH /customers/{id}` の `carry_forward_balance` を 409。
- UI: `+ 新規請求書`・入金追加・入金削除・繰越残高編集を非表示。請求書・入金は Access の写しとして表示専用（`access_cancelled_at` は「取消済み」表示）。

## 5. Beaver UI（A-B-06）

- 伝票詳細: 「Access 由来／Beaver 作成」バッジ（`access_voucher_id` の有無）、`last_synced_at`、請求済みロック表示「Access で請求済み（請求日 yyyy/mm/dd）」、`sync_pending=1` なら「Access で確認待ち」バナー。
- 得意先詳細: 同期バッジ、繰越残高は表示のみ、請求書・入金タブは写し（読み取り専用）。
- 設定: 同期先 AppID・最終同期時刻（`GET /sync/status`）。

## 6. Access の計算フローに合わせる（Beaver 側で「計算をやめる」項目）

| 項目 | Beaver でやめること | 代わりに |
|:--|:--|:--|
| 請求日 | `billing_date` の画面入力・`override_billing_date` の利用 | Access の `access_billing_date` を表示 |
| 金額 4 項目（繰越・売上・消費税・入金）と請求額 | 画面入力・再計算 | `/invoices/sync` の写し |
| 繰越残高 | 請求・入金・画面編集での更新 | `/customers` push と `/invoices/sync` の写し |
| 請求取消 | 請求書 DELETE・伝票 `approved` 戻し・繰越巻き戻し | `access_cancelled_at` 表示のみ |
| 入金の消込 | `payment_received += amount` | `/payments/sync` の写し |
| 税額 | `tax_input_type` による再計算表示 | `total_amount`（税込）をそのまま表示 |
| 請求書 PDF | 作らない | — |

## 7. タスク（backpc）と受入条件

| ID | 内容 | 依存 | 受入条件（決定論的） | 状態 |
|:--|:--|:--|:--|:--|
| A-B-01 | `GET /customers/sync` | — | 済（20de0a2）。追補: `gender/mobile/fax/is_active` を含む、`carry_forward_balance` を含まない | 追補中 |
| A-B-02 | migration 030、`POST /vouchers/sync` の請求済み受信、ロック拡張 | — | `test_vouchers_billed_lock.php`: (1) `access_billed_flag=1, status='approved'` で PUT/PATCH/DELETE・明細変更が 409 (2) `POST /invoices` の `voucher_ids` に含めると 409 (3) `DELETE /invoices/{id}`・`POST /history/{id}/restore` が当該伝票の `status`/`access_billed_flag` を変えない (4) `GET /vouchers/sync` に `access_billed_flag`。Beaver_beta に 030 適用（`PRAGMA table_info`） | todo |
| A-B-03 | `GET/POST /vouchers/sync` に `lines[]` | — | `test_vouchers_sync_lines.php`: 5 列が往復で一致、`lines_mode` の replace/merge | todo |
| A-B-04 | migration 031/032、`POST /invoices/sync`・`POST /payments/sync` | A-B-02 | `test_invoices_sync.php`/`test_payments_sync.php`: upsert 冪等、`access_cancelled_at`、`customer_access_no`→`customer_id` 解決、未知の得意先は 422 | todo |
| A-B-05 | `BILLING_EDIT_ENABLED` と API 409、UI 非表示、繰越残高の表示専用化 | — | `test_billing_edit_disabled.php`: flag=false で上記 6 経路が 409、true で従来どおり。vitest: flag=false で描画されない。Beaver_beta で curl 照合 | todo |
| A-B-06 | 同期バッジ・ロック表示・`sync-state`・`/sync/status`・`/sync/heartbeat` | A-B-02 | vitest: バッジ 3 状態・ロック表示・確認待ちバナー。`test_sync_state.php`・`test_sync_status.php` | todo |
| A-B-07 | `GET /projects/sync` に `deleted_at` | — | `test_projects_sync.php`: 削除済み案件が `deleted_at` 付きで返る | done（21f7c3f、Beaver_betaにmigration034適用済み） |
| A-B-08 | 同期 API の認証（完全一致免除＋`SYNC_API_TOKEN`＋`SYNC_TOKEN_REQUIRED`、`/sync/status` は通常認証） | — | `test_auth_gate_sync.php`: (1) `/vouchers/synchronize` が免除されない (2) `SYNC_TOKEN_REQUIRED=true` でトークン無しの `/vouchers/sync` が 401 (3) 正しいトークンで 200 (4) `/sync/status` は `df_session` 無しで 401。Beaver_beta で true にして curl 照合 | done（cd981d7、Beaver_betaでSYNC_TOKEN_REQUIRED=true・curl照合済み） |
| A-B-09 | push系応答（`POST /vouchers/sync`・`POST /projects/{id}/vouchers/sync`・`PATCH /projects/{id}/vouchers/{no}/shipped`・`PATCH /projects/{id}/customer`・`POST /customers`）に`last_synced_at`（サーバJST時刻）を必ず含める | A-B-08 | `test_push_responses_last_synced_at.php`: 上記5経路の応答に`last_synced_at`がありDBの同列と一致。`POST /customers`更新後に`customers.last_synced_at`が更新されている | todo |

## 8. 運用ルール

- 台帳の「依存が済で状態 todo」の行を上から取る。依存なしは A-B-02・03・05・07・08（並行可）。
- 実装は Codex に委譲し、指揮役が `php api/tests/*.php`・`.claude/regression-suite.sh`・vitest・Beaver_beta の curl を**自分で再実行**して合否を決める。
- 緑ならコミット・push・本書の状態を `done` に更新し、Dodaikun セッションへ `SendMessage`。赤なら本書の行に原因を追記して次へ（同じ行で 2 回失敗したら人間へ）。
- **本番 Beaver には配置しない**（Beaver_beta のみ）。本番切替は Dodaikun 側の合図（人間ゲート）。
- 各 migration は Beaver_beta へ適用したら `scripts/reset_beta_db.ps1` の `$betaOnlyMigrations` に追加する。
