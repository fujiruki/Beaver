<?php
/**
 * R-0130 テスト用 Youkan project-link スタブ（php -S のルータースクリプト）。
 * URLパス末尾のBeaver案件IDでレスポンスを切り替える。
 *   1 → 200 正常応答
 *   2 → 404 reason=not_found
 *   3 → 401（config縮退の検証用）
 *   その他 → 500（unreachable縮退の検証用）
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

// Beaverが正しいトークンで呼んでいることをスタブ側で検証する
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer dev-beaver-capacity-token-change-me') {
    http_response_code(401);
    echo json_encode(['error' => 'stub: bad token']);
    exit;
}

$path = trim((string)parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH), '/');
$segments = explode('/', $path);
$id = (int)end($segments);

switch ($id) {
    case 1:
        echo json_encode([
            'external_project_id' => 1,
            'youkan_project_id'   => 'yk-001',
            'title'               => 'テスト 案件 確認',
            'tenant_id'           => 'tenant-abc',
        ], JSON_UNESCAPED_UNICODE);
        break;
    case 2:
        http_response_code(404);
        echo json_encode(['error' => 'not found', 'reason' => 'not_found']);
        break;
    case 3:
        http_response_code(401);
        echo json_encode(['error' => 'unauthenticated']);
        break;
    default:
        http_response_code(500);
        echo json_encode(['error' => 'boom']);
        break;
}
