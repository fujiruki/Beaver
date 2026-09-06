<?php
/**
 * R-0109: 画面系APIエンドポイントの認証ゲート判定
 */

declare(strict_types=1);

/**
 * R-0143 A-B-08: AccessTategu連携の同期APIパス（完全一致）。
 * 部分一致だと /vouchers/synchronize のような偽装パスまで免除してしまうため完全一致で管理する。
 */
const AUTH_GATE_SYNC_EXEMPT_PATHS = [
    '/vouchers/sync',
    '/customers/sync',
    '/projects/sync',
    '/invoices/sync',
    '/payments/sync',
    '/sync/heartbeat',
];

/** R-0143 A-B-08: 正規表現で判定する免除パス（末尾一致のIDパラメータ入りパス） */
const AUTH_GATE_SYNC_EXEMPT_PATTERNS = [
    '#/access-link$#',
    '#/vouchers/\d+/sync-state$#',
];

/**
 * auth-hubログインゲート（df_session）の対象外パスかどうかを判定する。
 * 免除＝df_sessionログイン不要という意味であり、無条件で誰でも通す意味ではない
 * （SYNC_TOKEN_REQUIRED=true の間は呼び出し側でSYNC_API_TOKENを別途検証する）。
 */
function authGateIsExempt(string $path, string $method): bool
{
    if ($path === '/health') return true;
    if ($path === '/feedback' && $method === 'POST') return true;
    if ($path === '/admin/feedback') return true;
    if (in_array($path, AUTH_GATE_SYNC_EXEMPT_PATHS, true)) return true;
    foreach (AUTH_GATE_SYNC_EXEMPT_PATTERNS as $pattern) {
        if (preg_match($pattern, $path)) return true;
    }
    return false;
}

/** R-0110: 番頭AI向けの固定トークン認証（Authorization: Bearer <BANTO_API_TOKEN>） */
function authGateHasValidBantoToken(): bool
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strncmp($auth, 'Bearer ', 7) !== 0) return false;
    return hash_equals(BANTO_API_TOKEN, substr($auth, 7));
}

/**
 * R-0117: Youkan連携API向けの固定トークン認証（Authorization: Bearer <YOUKAN_API_TOKEN>）。
 * BANTO_API_TOKENとは独立した最小権限のトークンで、/integrations/youkan/* のみを通す。
 */
function authGateHasValidYoukanToken(): bool
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strncmp($auth, 'Bearer ', 7) !== 0) return false;
    return hash_equals(YOUKAN_API_TOKEN, substr($auth, 7));
}

/** R-0143 A-B-08: AccessTategu同期API向けの固定トークン認証（Authorization: Bearer <SYNC_API_TOKEN>） */
function authGateHasValidSyncToken(): bool
{
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strncmp($auth, 'Bearer ', 7) !== 0) return false;
    return hash_equals(SYNC_API_TOKEN, substr($auth, 7));
}
