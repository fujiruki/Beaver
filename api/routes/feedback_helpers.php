<?php
/**
 * feedback ルートの共通ロジック（テスト容易性のため routes/feedback.php から分離）
 */

const FEEDBACK_ALLOWED_IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
const FEEDBACK_MAX_IMAGES = 5;
const FEEDBACK_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/**
 * $_FILES['images'] （単数/複数どちらの形式でも）を単一ファイル情報の配列に正規化する。
 */
function feedbackNormalizeFiles(?array $files): array {
    if (!$files || !isset($files['name'])) return [];

    if (is_array($files['name'])) {
        $count = count($files['name']);
        $out = [];
        for ($i = 0; $i < $count; $i++) {
            if (($files['error'][$i] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) continue;
            $out[] = [
                'name'     => $files['name'][$i],
                'type'     => $files['type'][$i],
                'tmp_name' => $files['tmp_name'][$i],
                'error'    => $files['error'][$i],
                'size'     => $files['size'][$i],
            ];
        }
        return $out;
    }

    if (($files['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) return [];
    return [$files];
}

function feedbackIsAllowedImage(array $file): bool {
    $ext = strtolower(pathinfo((string)$file['name'], PATHINFO_EXTENSION));
    return in_array($ext, FEEDBACK_ALLOWED_IMAGE_EXT, true);
}

function feedbackIsFileTooLarge(array $file): bool {
    return (int)$file['size'] > FEEDBACK_MAX_IMAGE_BYTES;
}

/**
 * move_uploaded_file は実際のHTTPアップロードでしか成功しないため、
 * CLIテスト等（is_uploaded_file が false）では copy にフォールバックする。
 */
function feedbackMoveUploadedFile(string $tmpName, string $dest): bool {
    if (is_uploaded_file($tmpName)) {
        return move_uploaded_file($tmpName, $dest);
    }
    return copy($tmpName, $dest);
}

function feedbackFind(PDO $pdo, int $id): ?array {
    $stmt = $pdo->prepare('SELECT * FROM feedback WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) return null;
    $row['image_paths'] = feedbackImagePaths($pdo, $id);
    return $row;
}

function feedbackImagePaths(PDO $pdo, int $feedbackId): array {
    $stmt = $pdo->prepare('SELECT file_path FROM feedback_images WHERE feedback_id = ? ORDER BY display_order, id');
    $stmt->execute([$feedbackId]);
    return array_column($stmt->fetchAll(), 'file_path');
}

/**
 * @param array $imageFiles feedbackNormalizeFiles() 済みのファイル配列
 */
function feedbackCreate(PDO $pdo, string $message, ?string $pagePath, ?string $userAgent, array $imageFiles, string $uploadBaseDir): array {
    $stmt = $pdo->prepare('INSERT INTO feedback (message, page_path, user_agent) VALUES (?,?,?)');
    $stmt->execute([$message, $pagePath, $userAgent]);
    $feedbackId = (int)$pdo->lastInsertId();

    if (!empty($imageFiles)) {
        $uploadDir = rtrim($uploadBaseDir, '/') . '/' . $feedbackId . '/';
        if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

        $order = 0;
        $insertImage = $pdo->prepare('INSERT INTO feedback_images (feedback_id, file_name, file_path, display_order) VALUES (?,?,?,?)');
        foreach ($imageFiles as $file) {
            $order++;
            $uuid     = bin2hex(random_bytes(8));
            $fileName = $uuid . '_' . basename((string)$file['name']);
            $relPath  = 'uploads/feedback/' . $feedbackId . '/' . $fileName;
            feedbackMoveUploadedFile($file['tmp_name'], $uploadDir . $fileName);
            $insertImage->execute([$feedbackId, $fileName, $relPath, $order]);
        }
    }

    return feedbackFind($pdo, $feedbackId);
}

function feedbackAdminList(PDO $pdo): array {
    $rows = $pdo->query('SELECT * FROM feedback ORDER BY id DESC')->fetchAll();
    foreach ($rows as &$row) {
        $row['image_paths'] = feedbackImagePaths($pdo, (int)$row['id']);
    }
    unset($row);
    return $rows;
}
