<?php
/**
 * /catalog-proxy - catalog-system API のプロキシ
 * GET /catalog-proxy/items?q=xxxx
 */

$catalogBase = 'http://localhost:8002/contents/catalog-system/api';
$subPath = isset($segments[1]) ? '/' . implode('/', array_slice($segments, 1)) : '';
$query = $_SERVER['QUERY_STRING'] ?? '';
$url = $catalogBase . $subPath . ($query ? '?' . $query : '');

$ctx = stream_context_create(['http' => ['timeout' => 5]]);
$result = @file_get_contents($url, false, $ctx);

if ($result === false) {
    echo json_encode([]);
} else {
    echo $result;
}
