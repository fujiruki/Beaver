<?php
/**
 * R-0118 テスト用 Youkan capacity-check スタブ（php -S のルータースクリプト）。
 * リクエストの external_project_id の値でレスポンスを切り替える。
 *   1 → 200 Y1契約形（message に「前回同期値で判定」注記付き）
 *   2 → 404 reason=excluded_status
 *   3 → 404 reason=not_found
 *   4 → 401
 *   その他 → 500
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'method not allowed']);
    exit;
}

// Beaverが正しいトークンとJSONボディで呼んでいることをスタブ側で検証する
if (($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer dev-beaver-capacity-token-change-me') {
    http_response_code(401);
    echo json_encode(['error' => 'stub: bad token']);
    exit;
}

$body = json_decode((string)file_get_contents('php://input'), true);
$id = (int)(($body['external_project_id'] ?? 0));

switch ($id) {
    case 1:
        echo json_encode([
            'external_project_id'      => 1,
            'feasible'                 => false,
            'deadline'                 => '2026-09-10',
            'required_minutes'         => 780,
            'placed_minutes'           => 300,
            'unplaced_minutes'         => 480,
            'shortage_minutes'         => 180,
            'earliest_completion_date' => '2026-09-12',
            'saturated_through'        => '2026-09-05',
            'message'                  => '9/10納期では3h不足（9/12なら入る）（Beaver再取得失敗・前回同期値で判定）',
            'evaluated_at'             => '2026-08-26T10:00:00+09:00',
        ], JSON_UNESCAPED_UNICODE);
        break;
    case 2:
        http_response_code(404);
        echo json_encode(['error' => 'excluded', 'reason' => 'excluded_status']);
        break;
    case 3:
        http_response_code(404);
        echo json_encode(['error' => 'not found', 'reason' => 'not_found']);
        break;
    case 4:
        http_response_code(401);
        echo json_encode(['error' => 'unauthenticated']);
        break;
    default:
        http_response_code(500);
        echo json_encode(['error' => 'boom']);
        break;
}
