# 社内システム共通認証基盤 設計提案（Fable、2026-08-06）

藤田建具店の社内システム全体（勤怠管理・Beaver・Wiki・Youkan・catalog-system）を見据えた認証基盤について、Fableに設計相談した結果の記録。**Beaverリポジトリの範囲外の内容を含むが、相談の起点がBeaverだったためここに記録する。実際の認証アプリは別リポジトリで実装する想定。**

## 結論（推奨アーキテクチャ）

```
[認証専用アプリ]（別リポジトリ、/contents/auth/、PHP+SQLite）
  ├ users / auth_identities（password・google 両対応、招待制）
  ├ セッション管理: df_session Cookie（path=/、HttpOnly、Secure、SameSite=Lax）
  │   長寿命スライディング延長（例90日）＋管理画面から失効可能
  ├ ログイン画面（Googleボタン＋パスワード）/ パスワードリセット（当初は管理者発行運用可）
  └ 認証連携インターフェース仕様書（Cookie名・検証契約・ユーザー最小形・リダイレクト規約・AUTH_DRIVER規約の5点）

[各アプリ]（Beaver・勤怠・Wiki・Youkan・catalog-system）
  ├ AUTH_DRIVER = none | local | shared（config切替、デフォルトnoneで現状互換）
  ├ 単一エントリーポイントで currentUser() を解決（サーバー側。フロントからuser_idは受け取らない）
  ├ created_by / updated_by（NULL許容＋表示名スナップショット）
  └ フロントは GET /me と401ハンドリング1箇所のみ
```

### 導入順序案
① 本番API無防備公開の暫定措置（Basic認証等、即時）→ **R-0099として実施済み**
② 認証アプリ新設（password認証＋招待制＋失効管理）
③ Beaverに`shared`ドライバー＋`created_by`
④ Googleログイン追加
⑤ 他アプリへ横展開
⑥（受注が見えたら）`local`ドライバー（Beaver単体配布向け）

## 1. 現状確認
Beaverには認証機構が一切ない（`/admin/feedback`のトークン認証のみ例外）。`api/index.php`のCORSも全開。**本番APIが認証なしで公開されている問題は2026-08-06にR-0099として暫定対応済み**（`.htaccess` Basic認証）。

## 2. 複数アプリ共有認証の方式比較
- **案A（推奨）**: 認証専用アプリ＋ドメイン共有Cookie＋サーバー側セッション。即時失効可能、「ずっとログイン」要件と相性が良い
- 案B: JWT — 失効困難なため非推奨
- 案C: 各アプリ個別ログイン — 低フリクション要件に反するため非推奨
- 案D: 既製IdP（Keycloak等）— ConoHa WING（共有レンタルサーバー）では常駐プロセスが動かせないため非推奨

## 3. 持続ログイン設計
スライディング延長の長寿命セッション（例90日）。管理画面からの失効機能を必須とする（退職・端末紛失対応）。

## 4. パスワードリセット
`random_bytes(32)`トークン（DBはハッシュ保存・15〜60分・単回使用）→ URLメール送信 → 全セッション失効。メールはConoHa WINGのSMTP+PHPMailerが第一候補。当面「管理者が手動でリセットURLを発行」する運用から始める選択肢もあり。

## 5. Beaver「誰が登録したか」記録（created_by）
- 対象テーブルに`created_by INTEGER NULL`（＋`created_by_name TEXT`の表示名スナップショット）を追加。外部キー制約は張らない（ユーザーは別アプリのDBに住むため）
- **user_idはフロントから送らせない**。`api/index.php`冒頭の認証チェックがセッションから解決し、サーバー側でINSERT/UPDATEに埋める
- 実装は認証導入後でよい。Beaver側で今やることはない

## 6. Beaver単体配布と社内認証連携の両立（プラガブル認証ドライバー）
Beaver本体は「現在のユーザーは誰か」という1つの問い（`currentUser(): ?array`）にのみ依存する構造にする。

| ドライバー | 用途 | 中身 |
|---|---|---|
| `none` | 現状互換・開発・デモ | 常にnull。認証チェック素通し |
| `local` | 単体配布 | Beaver自身にusersテーブル＋ログイン画面＋独自セッション（`bvr_session`、path=/contents/Beaver/） |
| `shared` | 藤田建具店社内 | `df_session`を共有セッションDB/`/auth/verify`で検証 |

- 共通エンドポイント`GET /me`（ユーザー情報 or 401+loginUrl）
- フロントは`api/client.ts`の401ハンドリング1箇所のみでドライバーの違いを意識しない
- `local`ドライバーはパスワード認証のみで開始（Googleログインは配布先ごとのOAuth設定が必要になり単体配布の手離れを悪化させるため含めない）

## 7. Googleログイン対応
- `users`と`auth_identities`（provider: password/google）をテーブル分離。Google側の識別は`sub`（不変ID）で行い、emailは初回紐づけのみに使う
- **自動サインアップは無効**。管理者が事前登録したメールアドレスのユーザーにのみ、初回Googleログイン時にidentityを紐づける招待制・ホワイトリスト方式
- OIDC Authorization Code Flow（state/nonce必須、PKCE推奨）。ConoHa WINGでcomposerが使えるか要確認
- Google Cloud Console: OAuth同意画面（社員がGoogle Workspaceなら「内部」、個人Gmailなら「外部」+アプリ側ホワイトリスト）、OAuthクライアントID発行、リダイレクトURI登録。費用なし、通常審査不要

## 8. 複数プロジェクト共通の「認証連携インターフェース標準」
以下5点を1枚の仕様書として認証アプリのリポジトリに置く:
1. Cookie名とスコープ（`df_session`、path=/、既存の隔離ルールの明文化された例外）
2. 検証方法の契約（共有セッションDBスキーマ or `/auth/verify` APIの入出力）
3. ユーザー表現の最小形（`{id, name}`必須、email/role等は任意拡張）
4. 未認証時のリダイレクト規約（`.../contents/auth/login?redirect=<元URL>`）
5. 各アプリの切替規約（`AUTH_DRIVER = none|local|shared`）

共通ライブラリはPHPアプリ間なら単一ファイル`auth_client.php`のコピー配布で十分（composer/npm化は現規模では過剰）。role/権限モデルは時期尚早、拡張余地だけ残す。

## 9. 藤田晴樹さんの回答（2026-08-06）

1. 認証専用アプリは**別リポジトリで新設**（勤怠アプリに同居させない）
2. 認証Cookieのみ`path=/`共有の例外を`C:\Fujiruki\CLAUDE.md`に**明文化済み**
3. セッション失効機能は**後回し**（スライディング90日の持続ログインは先行、管理画面からの失効は後日）
4. パスワードリセットのメール送信基盤は**ConoHa WINGのSMTP+PHPMailerを最初から構築**
5. `local`ドライバー（単体配布向け）も**最初から作る**（抽象層だけ先行という提案は不採用）
6. 認証連携インターフェース仕様書は**成果物に含める**
7. `local`ドライバーのパスワードリセットも**最初からメール送信対応**（管理者手動再設定案は不採用）
8. 社員のGoogleアカウントは**個人Gmail**（Google Workspaceではない）→ 同意画面は「外部」選択、退職時はアプリ側ホワイトリストから削除する運用
9. （Googleログインの併用/推奨に関する回答は未収集）

## 10. 藤田晴樹さんに判断してもらうべき論点（未回答分）
1. 認証専用アプリを別リポジトリで新設する方針の承認（vs 勤怠アプリに同居）
2. 認証Cookieのみpath=/共有とする隔離ルール例外の`C:\Fujiruki\CLAUDE.md`への明文化
3. セッション寿命ポリシー（スライディング90日案）と管理画面からの失効機能を初期スコープに含めるか
4. メール送信基盤の選択（ConoHa SMTP / 外部サービス / 当面は管理者手動発行で開始）
5. 単体配布の現実度と時期（抽象層だけ先に入れてlocalドライバーは受注が見えてから作る、という順序でよいか）
6. インターフェース仕様書を認証アプリ設計の成果物に含めることの承認
7. `local`ドライバーのパスワードリセットを「管理者再設定」開始でよいか
8. 社員のGoogleアカウントは Google Workspace（社用）か個人Gmailか（退職時の統制方法が変わる重要な分岐）
9. Googleログインを「パスワードと併用」か「Google推奨・パスワードは予備」か

## 参照
主要参照ファイル: `api/index.php` / `api/config.php` / `api/routes/feedback.php`（設計提案時点のBeaverコード調査に基づく）
