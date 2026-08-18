# R-0110: 番頭AI向けAPIトークン認証の追加

## 背景

`docs/requests.md` -8（原文、2026-08-17、藤田晴樹よりPWA経由）:

> Beaverに案件登録できる？できないならAIが得意先や案件、見積もりを登録できるようにしてほしい

番頭（`C:\claude-workspace`で動作するAIセッション）が、会話中に「〇〇さんの見積もりをBeaverに登録して」等の指示を受けたときに、Beaver APIを直接叩いて得意先・案件・見積伝票を作成できるようにしたい、という要望。

R-0109でBeaver全体を auth-hub 経由のブラウザCookieセッション認証必須にしたが、番頭AIはブラウザを持たないサーバー間連携のため、この認証方式では通せない。DotLogの「番頭AI用APIキー」（`dl_api_keys`、`Authorization: Bearer`ヘッダー）と同種の、サーバー間連携用の別認証手段が必要。

参照: `C:\Fujiruki\Projects\DotLog\api\ApiKeysController.php`（先行実装、SHA-256ハッシュ照合パターン）

## 方針（指揮役が妥当なデフォルトで決定）

DotLogは複数ユーザーがそれぞれAPIキーを発行・失効できる管理画面付きの`dl_api_keys`テーブル方式だが、Beaverには複数ユーザーという概念も管理画面もなく、番頭AIという単一のシステムからの接続を許可できればよい。そのため、Beaver既存の`ADMIN_FEEDBACK_TOKEN`（`GET /admin/feedback`用の固定トークン）と同じ、**単一の固定トークンをheaderで照合する方式**を採用する。DBテーブルや発行・失効UIは作らない（過剰）。

- トークン名: `BANTO_API_TOKEN`（`api/config.php`に定数追加、`config.local.php`で未定義なら開発用フォールバック値、既存パターンを踏襲）
- ヘッダー: `Authorization: Bearer <token>`（DotLogと同じ形式。番頭AI側の実装のしやすさを優先）
- 認証ゲート（`api/auth_gate.php`）の判定順序を拡張する:
  1. 対象外パス（`/health`, `POST /feedback`, `/admin/feedback`, sync系, `access-link`）→ 素通し（R-0109のまま変更なし）
  2. `Authorization: Bearer <BANTO_API_TOKEN>` が一致 → 通す（今回追加）
  3. auth-hubログイン済み（`currentUser()`が非null）→ 通す（R-0109のまま）
  4. どれも満たさない → 401 + loginUrl

「誰が登録したか」の記録（`created_by`）は今回のスコープ外（R-0109と同じ判断。将来、認証基盤全体の話として別要望で扱う）。

## スコープ

### 含む
- `api/config.php`: `BANTO_API_TOKEN`定数の追加
- `api/auth_gate.php`または`api/index.php`: `Authorization: Bearer`ヘッダーでのトークン照合を認証ゲートに追加
- 本番用トークンの発行（`random_bytes`由来の値を`config.local.php`に設定）
- 番頭AI（claude-workspace）側に伝える連携情報をまとめたMarkdownファイルの作成（別ファイル、Beaverリポジトリ内に置く。claude-workspace側の実装作業そのものは対象外）

### 含まない（将来対応）
- 複数トークンの発行・失効管理、管理画面
- `created_by`記録
- claude-workspace側のAPIクライアント実装・`.env`設定（番頭AI側のタスク、このリポジトリの範囲外）

## 実装

- `api/config.php`: `ADMIN_FEEDBACK_TOKEN`と同じパターンで追加
  ```php
  if (!defined('BANTO_API_TOKEN')) define('BANTO_API_TOKEN', 'dev-local-banto-token-change-me');
  ```
- `api/auth_gate.php`: トークン照合を担う関数を追加（`hash_equals()`使用、タイミング攻撃対策）
  ```php
  function authGateHasValidBantoToken(): bool {
      $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
      if (strncmp($auth, 'Bearer ', 7) !== 0) return false;
      return hash_equals(BANTO_API_TOKEN, substr($auth, 7));
  }
  ```
- `api/index.php`の認証ゲート部分（R-0109で追加した箇所）を以下のように拡張する:
  ```php
  if (AUTH_DRIVER !== 'none' && !authGateIsExempt($path, $method) && !authGateHasValidBantoToken()) {
      auth_require_user(json: true);
  }
  ```

## 番頭AI側への申し送り

実装完了後、`docs/wiki/knowledge/banto_ai_beaver_integration.md`（新規）に、番頭AI（claude-workspace）側で必要な接続情報（ベースURL・トークンの受け渡し方法・エンドポイント一覧・リクエスト例）をまとめる。本番トークンの値そのものはこのMarkdownには書かず、安全な経路（藤田晴樹さんが直接コピー等）で渡す前提とし、ファイルには「トークンは別途受け取ってください」とだけ記載する。

## 受け入れ条件

- `Authorization: Bearer <BANTO_API_TOKEN>` を付けて `POST /customers`, `POST /projects`, `POST /vouchers` 等を呼ぶと、未ログインでも201/200で成功する
- トークンなし・不一致のリクエストは引き続き401（auth-hubログインへ誘導）
- auth-hub経由のブラウザログインは今まで通り動作する（既存のR-0109の挙動に影響なし）
- sync系・feedback・admin/feedback・healthは引き続き対象外のまま
- ローカル開発（`AUTH_DRIVER=none`）は引き続き認証なしで動作する
