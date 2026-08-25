<?php
/**
 * R-0109: 画面系APIエンドポイントの認証ゲート判定
 */

declare(strict_types=1);

/** AccessTategu連携用の同期APIなど、auth-hubログインゲートの対象外パスかどうかを判定する */
function authGateIsExempt(string $path, string $method): bool
{
    if ($path === '/health') return true;
    if ($path === '/feedback' && $method === 'POST') return true;
    if ($path === '/admin/feedback') return true;
    if (strpos($path, '/sync') !== false) return true;
    if (preg_match('#/access-link$#', $path)) return true;
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
