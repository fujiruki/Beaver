<?php
/**
 * /settings エンドポイント
 * GET  /settings   自社情報取得
 * PUT  /settings   自社情報更新
 */

switch ($method) {
    case 'GET':
        $stmt = $pdo->query('SELECT * FROM company_settings WHERE id = 1');
        echo json_encode($stmt->fetch());
        break;

    case 'PUT':
        $data = json_decode(file_get_contents('php://input'), true) ?? [];
        $fields = ['company_name','company_name_kana','postal_code','address1','address2',
                   'tel','fax','email','invoice_registration_no','bank_info',
                   'invoice_header_note','quantity_decimal_digits','tax_decimal_digits',
                   'default_profit_rate','default_labor_rate'];
        $sets = [];
        $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $data)) {
                $sets[] = "$f = :$f";
                $params[":$f"] = $data[$f];
            }
        }
        if (empty($sets)) { http_response_code(400); echo json_encode(['error' => 'No fields']); exit; }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $pdo->prepare('UPDATE company_settings SET ' . implode(', ', $sets) . ' WHERE id = 1')->execute($params);
        $stmt = $pdo->query('SELECT * FROM company_settings WHERE id = 1');
        echo json_encode($stmt->fetch());
        break;

    default:
        http_response_code(405);
        echo json_encode(['error' => 'Method not allowed']);
}
