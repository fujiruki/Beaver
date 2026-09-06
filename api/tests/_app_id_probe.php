<?php
declare(strict_types=1);
require dirname(__DIR__) . '/config.php';
echo json_encode(['app_id' => APP_ID, 'base_path' => BASE_PATH]);
