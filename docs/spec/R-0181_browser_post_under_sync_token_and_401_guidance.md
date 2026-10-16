# R-0181: 同期トークン必須の環境で画面から得意先を登録できない／401のときの案内

- 受付: 2026-10-16 藤田晴樹さんがBeaver_betaの受入確認（S4）で報告（dodai-back経由）。得意先「かどたぐみ」を新規保存すると`POST /contents/Beaver_beta/api/customers`が401 `{"error":"unauthenticated"}`、画面は`Uncaught (in promise)`で何も案内が出なかった
- 状態: 仕様確定（本番切替（A-X-02）の前に必ず入れる）

## 原因（指揮役の調査）

- ログインのセッションはauth-hub（`df_session` Cookie、`/contents/auth`）にあり、BeaverのDBには無い。rc1〜rc4のDB入れ替えでは消えない
- `api/auth_gate.php`の`authGateIsExempt()`は`POST /customers`と`POST /feedback`を「ログイン不要」の免除対象にしている（R-0143 A-B-13: Accessが同期トークンで`POST /customers`を呼ぶため）
- 免除対象は、`SYNC_TOKEN_REQUIRED=true`のとき同期トークン（Bearer）が無いと、ログインしていても理由を問わず401（`loginUrl`なし）にしている（`api/index.php`）
- Beaver_betaは2026-09-18から`SYNC_TOKEN_REQUIRED=true`。このため画面からの得意先の新規登録と改善要望の送信が、ログインしていても必ず401になる。本番もA-X-02でトークンを有効にすると同じことが起きる
- 画面側は、401に`loginUrl`が無いと`ApiError`を投げるが、`CustomerDetail.tsx`の`onSubmit`が`mutateAsync`の例外を受けていないため`Uncaught (in promise)`になり、何も表示されない。また`loginUrl`がある401では、すぐログイン画面へ移るので入力が消える

## API（api/index.php・api/auth_gate.php）

1. 免除対象のパスで、`SYNC_TOKEN_REQUIRED=true`かつ同期トークンが無い・合わないときは、401で止めずに通常の認証ゲート（番頭トークン、`AUTH_DRIVER`が`none`以外ならauth-hubのログイン）にかける。ログインしていれば通す。ログインしていなければ、ほかのAPIと同じ401（`loginUrl`つき）にする
2. 同期トークンが正しければ、今までどおりログインなしで通す（Accessの同期は変わらない）
3. Youkan連携（`/integrations/youkan`）の扱いは変えない

## 画面

1. 書き込み（POST・PUT・PATCH・DELETE）で401が返ったときは、ログイン画面へすぐには移らない。`ApiError(401)`を投げ、画面上部に固定で「ログインが切れました。ログインし直してください」と「ログインし直す」ボタンを出す（全画面共通。`Layout`に置く）。ボタンはログイン画面を**別のタブ**で開く（`loginUrl`、無ければ`/contents/auth/login?redirect=<今のURL>`）。今の画面と入力はそのまま残る
2. ログインし直した後は、元のタブで保存をもう一度押せば保存できる。案内は、次の書き込みが成功したら消す（または閉じるボタンで消せる）
3. 読み込み（GET）で401が返ったときは、今までどおりログイン画面へ移る（入力中の内容が無いため）
4. 得意先詳細（`CustomerDetail.tsx`）と案件画面の新規得意先モーダル（`NewCustomerModal.tsx`）の保存は、例外を受けて画面に出す（`Uncaught (in promise)`にしない）。401のときは赤い生エラーを出さず、上の共通の案内だけにする。入力は残し、R-0180の「未保存」表示も残す

## 受け入れ条件（テスト）

PHP:

1. `SYNC_TOKEN_REQUIRED=true`・`AUTH_DRIVER=shared`で、同期トークンなし・ログイン済み（テスト用verifier）の`POST /customers`は201
2. 同じ設定で、同期トークンなし・未ログインの`POST /customers`は401で、`loginUrl`がある
3. 正しい同期トークンつきなら、ログインなしで`POST /customers`が201（今までどおり）
4. 誤った同期トークン・未ログインなら401
5. `POST /feedback`も1〜2と同じ
6. 既存の認証ゲートのテスト（test_auth_gate*.php）が通る

vitest:

7. 書き込みで401（`loginUrl`つき）が返ると、ページを移らず、画面上部に「ログインが切れました。ログインし直してください」と「ログインし直す」が出る。ボタンは`window.open(loginUrl, '_blank')`を呼ぶ
8. 読み込みで401（`loginUrl`つき）なら、今までどおり`location.href`を移す
9. 得意先の新規登録で保存が401のとき、入力値が残り、赤い生エラーが出ず、未処理の例外にならない
10. その後の書き込みが成功すると案内が消える
11. 既存のテストと回帰スイートが通る
