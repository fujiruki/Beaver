<?php
/**
 * auth_client.php — 各アプリへコピー配布する単一ファイル（docs/SPEC/01_認証仕様.md §6）
 *
 * 正本は auth-hub リポジトリのこのファイル。各アプリへはコピーで配る。
 * アプリが依存してよいのは currentUser(): ?array ただ1つ。
 *
 *   require_once __DIR__ . '/auth_client.php';
 *   auth_configure(['driver' => 'shared', 'base' => 'https://door-fujita.com/contents/auth']);
 *   $user = currentUser();            // ['id' => int, 'name' => string, 'email' => string?] または null
 *
 * ユーザーIDをフロントエンドから受け取ってはならない。INSERT/UPDATE の created_by 等は
 * 必ずサーバー側でこの関数から解決した値を使うこと（§6.2）。
 */

declare(strict_types=1);

const AUTH_CLIENT_VERSION = '1.1.0';

function auth_config(?array $set = null): array
{
    static $cfg = [
        'driver' => 'none',                                     // none | local | shared
        'base' => 'https://door-fujita.com/contents/auth',
        'cookie' => 'df_session',
        'verify_url' => null,                                   // 未指定なら base から導出
        'login_url' => null,                                    // 未指定なら base から導出
        'db_path' => null,                                      // driver=local のときのアプリ自身のDB
        'timeout' => 5,
        'verifier' => null,                                     // テスト用の差し替え口（callable(string $token): ?array）
    ];
    if ($set !== null) {
        $cfg = array_merge($cfg, $set);
    }
    return $cfg;
}

function auth_configure(array $cfg): void
{
    auth_config($cfg);
    auth_reset_cache();
}

/** 1リクエスト内の解決結果をキャッシュする。テストや途中でCookieが変わる場合に破棄する */
function auth_reset_cache(): void
{
    auth_user_cache(true);
}

function auth_user_cache(bool $reset = false, mixed $value = null): mixed
{
    static $cache = false;   // false = 未解決（null は「未ログイン」という確定値）
    if ($reset) {
        $cache = false;
        return null;
    }
    if ($value !== null) {
        $cache = $value['user'];
    }
    return $cache;
}

function auth_login_url(?string $redirectTo = null): string
{
    $cfg = auth_config();
    $base = $cfg['login_url'] ?? rtrim($cfg['base'], '/') . '/login';
    $redirectTo ??= ($_SERVER['REQUEST_URI'] ?? '/');
    return $base . '?redirect=' . rawurlencode($redirectTo);
}

/**
 * 現在のユーザー。未ログインなら null。
 * 検証基盤が落ちていても例外は投げず null を返す（アプリを巻き込まないため）。
 */
function currentUser(): ?array
{
    $cached = auth_user_cache();
    if ($cached !== false) {
        return $cached;
    }

    $cfg = auth_config();
    $user = null;

    if ($cfg['driver'] !== 'none') {
        $token = (string)($_COOKIE[$cfg['cookie']] ?? '');
        if ($token !== '') {
            try {
                $user = $cfg['driver'] === 'local'
                    ? auth_verify_local($token, $cfg)
                    : auth_verify_shared($token, $cfg);
            } catch (Throwable $e) {
                error_log('[auth_client] セッション検証に失敗: ' . $e->getMessage());
                $user = null;
            }
        }
    }

    auth_user_cache(false, ['user' => $user]);
    return $user;
}

/** 未ログインならログイン画面へ送る（HTML）か 401 を返す（API）。戻る場合は必ずユーザーがいる */
function auth_require_user(bool $json = false): array
{
    $user = currentUser();
    if ($user !== null) {
        return $user;
    }
    if ($json) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'unauthenticated', 'loginUrl' => auth_login_url()], JSON_UNESCAPED_SLASHES);
    } else {
        http_response_code(302);
        header('Location: ' . auth_login_url());
    }
    exit;
}

/** driver=shared: auth-hub の POST /auth/verify に問い合わせる（§5.5） */
function auth_verify_shared(string $token, array $cfg): ?array
{
    if (is_callable($cfg['verifier'])) {
        return auth_user_from_response(($cfg['verifier'])($token));
    }
    $url = $cfg['verify_url'] ?? rtrim($cfg['base'], '/') . '/auth/verify';

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => http_build_query(['token' => $token]),
        CURLOPT_TIMEOUT => (int)$cfg['timeout'],
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($status !== 200 || !is_string($body)) {
        return null;
    }
    return auth_user_from_response(json_decode($body, true));
}

/** 検証応答をユーザー表現へ整える。email はサーバーが返した場合だけ通す（§5.2 任意拡張 / §6.2） */
function auth_user_from_response(mixed $data): ?array
{
    if (!is_array($data) || !isset($data['id'], $data['name'])) {
        return null;
    }
    $user = ['id' => (int)$data['id'], 'name' => (string)$data['name']];
    if (isset($data['email'])) {
        $user['email'] = (string)$data['email'];
    }
    return $user;
}

/** driver=local: アプリ自身のDB（auth-hub と同じスキーマ）でセッションを解決する（§6.1） */
function auth_verify_local(string $token, array $cfg): ?array
{
    if ($cfg['db_path'] === null) {
        throw new RuntimeException('driver=local には db_path の設定が必要です');
    }
    $pdo = new PDO('sqlite:' . $cfg['db_path'], null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $st = $pdo->prepare(
        "SELECT u.id, u.name FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'active'"
    );
    $st->execute([hash('sha256', $token), gmdate('Y-m-d\TH:i:s\Z')]);
    $row = $st->fetch();
    return $row ? ['id' => (int)$row['id'], 'name' => (string)$row['name']] : null;
}
