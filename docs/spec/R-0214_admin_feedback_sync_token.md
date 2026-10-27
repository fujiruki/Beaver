# R-0214: 改善要望の一覧（/admin/feedback）を管理用トークンだけで読めるようにする

- 依頼: 2026-10-27 指揮役が見つけた不具合。晴樹さん「dodai-back と時期を合わせて入れる約束のやつにあわせていれたらいいよ」
- 状態: 仕様確定

## 不具合

- 本番は 10/19 から `SYNC_TOKEN_REQUIRED=true`。`/admin/feedback` は認証ゲートの免除パス（`authGateIsExempt`）にあるため、免除パスの分岐で同期トークンを求められ、`X-Admin-Token` だけでは401になる
- そのため `/readyoubou` が本番の改善要望を読めない

## 直し方

- `api/index.php` の免除パスの分岐で、`/admin/feedback` は同期トークンを求めない。認証は今までどおり `api/routes/feedback.php` の `X-Admin-Token` だけで行う
- ほかの免除パス（同期の窓口）の扱いは変えない

## テスト

- `api/tests/test_auth_gate_sync.php`（`SYNC_TOKEN_REQUIRED=true`）に足す: `GET /admin/feedback` は正しい `X-Admin-Token` で200、トークン無し・不一致は401

## デプロイ

- R-0200 (A)(C) と同じ日に入れる（dodai-back と時期を合わせる約束）
