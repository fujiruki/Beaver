# R-0109: auth-hub連携によるログイン基盤の導入

## 背景

`docs/requests.md` -7（原文、2026-08-13 Youkan側の会話で発生、意訳）:

> Youkan・DotLog・Beaver・catalog-systemなど、ログイン機能の有無がバラバラなサービス全部を、共通の認証で連携できないか。どこか1つでGoogleログインすれば、他の藤田建具店のサービスもログイン状態を維持できるようにしたい

起点は `docs/wiki/knowledge/auth_architecture_proposal_20260806.md`（2026-08-06設計提案）。認証専用アプリ `auth-hub` は Youkan R-096 / auth-hub R-0001 として新規構築され、**2026-08-14に本番稼働済み**（`https://door-fujita.com/contents/auth/`）。Youkan・DotLogは既にauth-hub連携済み（DotLog: `docs/spec/08_auth-hub連携.md`）。

Beaverは現状ログイン機構が一切なく（`GET /admin/feedback`のトークン認証のみ例外）、本番APIは `.htaccess` Basic認証（R-0099、staffアカウント共有）でのみ暫定保護されている。本要望は、`auth_architecture_proposal_20260806.md` の導入順序案③「Beaverに`shared`ドライバー」に相当する。

参照:
- `C:\Fujiruki\Projects\auth-hub\docs\SPEC\01_認証仕様.md`（連携インターフェース標準は§6が正本）
- `C:\Fujiruki\Projects\DotLog\docs\spec\08_auth-hub連携.md`（先行導入の参考実装）

## 発注者確認済み事項（2026-08-17）

1. **Beaver全体を全画面ログイン必須にする**。未ログインでアクセスすると auth-hub のログイン画面へ自動転送する。現行のBasic認証（誰でもURLを知れば同一パスワードで入れる状態）から、個人単位のアカウント管理へ切り替える
2. **今回のスコープはログイン基盤のみ**。「誰が登録したか」（`created_by`）の記録は別要望として今回は対応しない
3. **AccessTategu連携用の同期API群は対象外**。人間のログインではなくAccess（VBA）からのシステム間連携のため、auth-hubのブラウザCookie認証は適さない。従来通り`.htaccess` Basic認証のみで保護し、Access側の実装は一切変更しない

## スコープ

### 含む
- `auth_client.php` の導入（auth-hub正本からのコピー配布、`driver=shared`固定）
- バックエンド: 画面系APIエンドポイントを未認証時401にするゲート
- フロントエンド: 未ログイン時にauth-hubログイン画面へリダイレクトする全画面ガード
- ログアウト導線（サイドバーにボタン追加）
- ローカル開発環境での認証バイパス（開発生産性のため）

### 含まない（将来対応）
- `created_by` / `created_by_name` の記録（別要望として`docs/requests.md`に起票する）
- AccessTategu同期APIへの認証追加
- Basic認証（R-0099）の撤去（本仕様の受け入れ条件を参照。即時撤去はしない）

## 認証対象外パス（画面系ゲートから除外）

以下は本仕様のログインゲートの対象外とし、既存の認証方式のまま変更しない。

| パス | 既存の保護 | 理由 |
|:--|:--|:--|
| `GET /health` | なし | ヘルスチェック |
| `POST /feedback` | なし（匿名可、既存仕様） | 改善要望フォームは未ログインでも送信可能な仕様（R-0080） |
| `GET /admin/feedback` | `X-Admin-Token` | 既存の別建て認証を維持 |
| `GET /projects/sync`、`POST /projects/{id}/vouchers/sync` | Basic認証のみ | AccessTategu連携（システム間） |
| `GET /vouchers/sync`、`POST /vouchers/sync`、`PATCH /vouchers/{id}/access-link` | Basic認証のみ | 同上 |
| `POST /aggregation-categories/sync` | Basic認証のみ | 同上 |
| 将来 `customers/sync`（R-038実装時） | Basic認証のみ | 同上 |

判定ルール: パスのセグメントに `sync` を含む、または末尾が `access-link` のリクエストは対象外とする（`strpos($path, '/sync') !== false || preg_match('#/access-link$#', $path)`）。

## バックエンド実装

- `api/auth_client.php`（新規）: auth-hub正本（`C:\Fujiruki\Projects\auth-hub\auth_client.php`、配布時点 `AUTH_CLIENT_VERSION = 1.1.0`）をコピー配布
- `api/index.php`:
  - 冒頭で `auth_configure(['driver' => AUTH_DRIVER, 'base' => 'https://door-fujita.com/contents/auth'])` を呼ぶ
  - ルーティング直前に認証ゲートを追加: 上記「認証対象外パス」に該当しない場合、`auth_require_user(json: true)` を呼ぶ（未ログインなら401 + `loginUrl`を返して終了）
  - `GET /me` エンドポイントを新設: `currentUser()` の結果をそのまま返す（未ログインは`auth_require_user`により401で処理済みなので、ここに到達するのはログイン済みのみ）
- `api/config.php`:
  - `AUTH_DRIVER` 定数を追加。`config.local.php` で未定義の場合のみ `'none'` にフォールバック（ローカル開発のデフォルトは認証スキップ、本番は `config.local.php` で `'shared'` に上書きする運用。既存の `ADMIN_FEEDBACK_TOKEN` と同じパターン）

## フロントエンド実装

- `frontend/src/api/client.ts`: 401応答を受けたら、応答ボディの `loginUrl` へ `window.location.href` で遷移する共通ハンドリングを1箇所に追加（DotLog `08_auth-hub連携.md` の「フロントは401ハンドリング1箇所のみ」方針に合わせる）
- `AppLayout.tsx`（サイドバー）:
  - `GET /me` の結果からログイン中のユーザー名を表示
  - ログアウトボタン: `https://door-fujita.com/contents/auth/logout?redirect=<現在のBeaver URLをrawurlencode>` へ遷移するだけでよい（Beaver自身はセッションを持たないため、DotLogのような二重セッション破棄は不要）

## ローカル開発環境の扱い

- `AUTH_DRIVER` のデフォルトは `'none'`（開発サーバーでは認証チェックを素通しする、既存動作を維持）
- ログイン込みの動作確認をしたい場合は、auth-hubのローカルサーバー（`http://localhost:5186/contents/auth/`、`docs/development_env.md`参照）を別途起動し、`config.local.php` で `AUTH_DRIVER='shared'` かつ `base` をローカルのauth-hubに向けて上書きする
- クロスアプリでのCookie共有はサブディレクトリ方式が有効な本番相当環境でしか実証できない（auth-hub仕様§9と同じ制約）。ローカルでは単体動作確認までとし、本番デプロイ後に実機確認する

## 移行手順（本番デプロイ時、安全のため段階的に）

1. 本番へ今回の変更をデプロイする時点では `.htaccess` Basic認証（R-0099）は**残したまま**にする（二重保護）
2. デプロイ後、藤田晴樹さんが実機でauth-hub経由ログイン→Beaver操作→ログアウトの一連を確認する
3. 問題なければ、後続の別対応として `.htaccess` Basic認証を撤去する（本要望のスコープには含めない。撤去は別途、藤田晴樹さんの確認を得てから行う）

## 受け入れ条件

- 未ログインで `https://door-fujita.com/contents/Beaver/` の任意画面へアクセスすると、auth-hubのログイン画面（`redirect`パラメータにBeaverの元URL付き）へ転送される
- auth-hubでログイン成功すると、Beaverの元の画面に戻り、通常通り閲覧・操作できる
- サイドバーのログアウトボタンを押すと、auth-hubのログアウト確認画面に遷移し、実行後は再度Beaverへアクセスするとログイン画面に戻る
- `POST /feedback` は引き続き未ログインで送信できる
- `GET /admin/feedback` は引き続き既存の `X-Admin-Token` で動作する（変更なし）
- AccessTategu連携の同期API（`/projects/sync`, `/vouchers/sync`, `/aggregation-categories/sync`, `/vouchers/{id}/access-link`）は、認証まわりの変更による影響を受けず、Access側は無改修で従来通り動作する
- ローカル開発環境（`AUTH_DRIVER=none`）では、これまで通りログインなしで全画面・全APIにアクセスできる
