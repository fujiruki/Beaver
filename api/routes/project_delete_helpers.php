<?php
/**
 * R-0095: 案件の完全削除ロジック。
 *
 * 請求書（invoice_vouchers）に紐づく伝票を持つ案件は保護のため完全削除を拒否する。
 * それ以外は伝票明細→伝票→案件画像→案件本体の順にトランザクションで削除する。
 */

if (!function_exists('hardDeleteProject')) {
    /**
     * @return array{code:int, body:array}
     */
    function hardDeleteProject(PDO $pdo, int $projectId): array {
        $stmt = $pdo->prepare('SELECT id FROM projects WHERE id = ?');
        $stmt->execute([$projectId]);
        if (!$stmt->fetch()) {
            return ['code' => 404, 'body' => ['error' => 'Not found']];
        }

        $invStmt = $pdo->prepare('
            SELECT COUNT(*) FROM invoice_vouchers iv
            JOIN vouchers v ON v.id = iv.voucher_id
            WHERE v.project_id = ?
        ');
        $invStmt->execute([$projectId]);
        if ((int)$invStmt->fetchColumn() > 0) {
            return ['code' => 409, 'body' => ['error' => '請求書に紐づく伝票があるため完全削除できません']];
        }

        $pdo->beginTransaction();
        try {
            $pdo->prepare('
                DELETE FROM voucher_line_prices WHERE voucher_line_id IN (
                    SELECT vl.id FROM voucher_lines vl
                    JOIN vouchers v ON v.id = vl.voucher_id
                    WHERE v.project_id = ?
                )
            ')->execute([$projectId]);

            $pdo->prepare('
                DELETE FROM voucher_line_costs WHERE voucher_line_id IN (
                    SELECT vl.id FROM voucher_lines vl
                    JOIN vouchers v ON v.id = vl.voucher_id
                    WHERE v.project_id = ?
                )
            ')->execute([$projectId]);

            $pdo->prepare('
                DELETE FROM voucher_lines WHERE voucher_id IN (
                    SELECT id FROM vouchers WHERE project_id = ?
                )
            ')->execute([$projectId]);

            $pdo->prepare('DELETE FROM vouchers WHERE project_id = ?')->execute([$projectId]);

            $imgStmt = $pdo->prepare('SELECT file_path FROM project_images WHERE project_id = ?');
            $imgStmt->execute([$projectId]);
            $imagePaths = $imgStmt->fetchAll(PDO::FETCH_COLUMN);

            $pdo->prepare('DELETE FROM project_images WHERE project_id = ?')->execute([$projectId]);
            $pdo->prepare('DELETE FROM projects WHERE id = ?')->execute([$projectId]);

            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        // ファイル削除はベストエフォート（失敗してもDB削除は既に完了しているため継続する）
        foreach ($imagePaths as $path) {
            if (!is_string($path) || $path === '') continue;
            $fullPath = __DIR__ . '/../' . $path;
            if (file_exists($fullPath)) {
                @unlink($fullPath);
            }
        }
        $dir = __DIR__ . '/../uploads/projects/' . $projectId;
        if (is_dir($dir)) {
            @rmdir($dir);
        }

        return ['code' => 200, 'body' => ['deleted' => true]];
    }
}
