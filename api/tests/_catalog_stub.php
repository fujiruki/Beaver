<?php
header('Content-Type: application/json; charset=utf-8');

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if ($path === '/custom-api/aggregation-categories') {
    echo json_encode([[
        'code' => 'FACTORY_TIME',
        'name' => '工場時間',
        'measureType' => 'time',
        'sortOrder' => 4,
        'isActive' => 1,
    ]], JSON_UNESCAPED_UNICODE);
    exit;
}

echo json_encode(['requested_path' => $path], JSON_UNESCAPED_UNICODE);
