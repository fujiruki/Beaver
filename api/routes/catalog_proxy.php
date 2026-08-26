<?php
/**
 * /catalog-proxy - catalog-system API のプロキシ
 * GET /catalog-proxy/items?q=xxxx
 */

$segments = explode('/', trim($path, '/'));
$subPath = isset($segments[1]) ? '/' . implode('/', array_slice($segments, 1)) : '';
$query = $_SERVER['QUERY_STRING'] ?? '';
$url = CATALOG_API_BASE . $subPath . ($query ? '?' . $query : '');

$ctx = stream_context_create(['http' => ['timeout' => 5]]);
$result = @file_get_contents($url, false, $ctx);

if ($result === false) {
    echo json_encode([]);
} else {
    echo $result;
}
