# R-0239 入金の種類・請求日印字・引用日を Access と同期する

出どころ: dodai-back の同期項目の棚卸し（AccessTategu `docs/R-同期項目の棚卸し_20261102.md`、65f385f）と晴樹さんの答え。(a) line_type は R-0238 追記で実装済み（3fc2b38）、性別と行の順番の Access 側は dodai-back。(d) Access だけの項目は、dodai-back の経緯の調べのあとで別に決める。

## 1. 入金の種類（payments.payment_type）
- 受け口（`api/routes/payments.php` の Access からの入金の取り込み）: `payment_type` のキーがあればその値。無ければ、追加は今どおり '現金'、更新は今の値を残す。
- 値は自由な文字列のまま受ける（DB の制約は無い）。画面の選択肢（振込・現金・小切手・手形・相殺）に無い値も、そのまま保存して一覧に出す。選択肢に足すかは、Access の値の一覧が届いてから決める。
- 返り値（Access が入金を読む窓口）に `payment_type` が無ければ足す。

## 2. 得意先の請求日印字（customers.billing_date_print）
- `GET /customers/sync` の返り値と、Access からの得意先の受け口の両方で扱う。受け口では、キーがあればその値（0/1）、無ければ今の値を残す。

## 3. 伝票の引用日（vouchers.quoted_at）
- 伝票の同期の返り値（`VOUCHER_SYNC_SELECT_COLUMNS`）と受け口（`sync_helpers.php` の伝票の upsert）の両方で扱う。受け口では、キーがあればその値（null なら空）、無ければ今の値を残す。

## 受け入れ条件（PHP テスト、本物の SQLite）
- 入金: キーありで追加・更新すると値が入る。キーなしの追加は '現金'、キーなしの更新は前の値のまま。
- 得意先: 返り値に billing_date_print がある。キーありで更新、キーなしは前の値のまま。
- 伝票: 返り値に quoted_at がある。キーありで更新、null で空、キーなしは前の値のまま。
- DB のスキーマは変えない。本番は R-0236/R-0238 と同じ版で、dodai-back と日を合わせて Beaver が先に入れる。
