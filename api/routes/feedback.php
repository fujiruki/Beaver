<?php
/**
 * /feedback , /admin/feedback エンドポイント
 * POST /feedback          改善要望の送信（multipart/form-data、認証不要）
 * GET  /admin/feedback    管理者用一覧取得（X-Admin-Token 必須）
 */

require_once __DIR__ . '/feedback_helpers.php';

if ($path === '/admin/feedback') {
    if ($method !== 'GET') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }
    $token = $_SERVER['HTTP_X_ADMIN_TOKEN'] ?? '';
    if (!hash_equals(ADMIN_FEEDBACK_TOKEN, $token)) {
        http_response_code(401);
        echo json_encode(['error' => 'unauthorized']);
        exit;
    }
    echo json_encode(feedbackAdminList($pdo), JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($path === '/feedback') {
    if ($method !== 'POST') {
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
        exit;
    }

    $message = trim($_POST['message'] ?? '');
    if ($message === '') {
        http_response_code(400);
        echo json_encode(['error' => 'message is required']);
        exit;
    }

    $pagePath = $_POST['page_path'] ?? null;
    if (!mb_check_encoding($message, 'UTF-8') || ($pagePath !== null && !mb_check_encoding($pagePath, 'UTF-8'))) {
        http_response_code(400);
        echo json_encode(['error' => 'message must be valid UTF-8']);
        exit;
    }

    $imageFiles = feedbackNormalizeFiles($_FILES['images'] ?? null);
    if (count($imageFiles) > FEEDBACK_MAX_IMAGES) {
        http_response_code(400);
        echo json_encode(['error' => 'images must be ' . FEEDBACK_MAX_IMAGES . ' or fewer']);
        exit;
    }
    foreach ($imageFiles as $file) {
        if (!feedbackIsAllowedImage($file)) {
            http_response_code(400);
            echo json_encode(['error' => 'invalid image type: ' . $file['name']]);
            exit;
        }
        if (feedbackIsFileTooLarge($file)) {
            http_response_code(400);
            echo json_encode(['error' => 'image too large: ' . $file['name']]);
            exit;
        }
    }

    $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? null;

    $result = feedbackCreate($pdo, $message, $pagePath, $userAgent, $imageFiles, FEEDBACK_UPLOAD_DIR);
    http_response_code(201);
    echo json_encode($result, JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE);
    exit;
}

http_response_code(404);
echo json_encode(['error' => 'Not found', 'path' => $path], JSON_INVALID_UTF8_SUBSTITUTE | JSON_UNESCAPED_UNICODE);
