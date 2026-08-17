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
