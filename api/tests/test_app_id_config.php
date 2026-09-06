<?php
/** 起動: php api/tests/test_app_id_config.php
 * R-0141: BEAVER_APP_ID環境変数によるAPP_ID/BASE_PATHの切り替えを検証する
 */
declare(strict_types=1);

function probeAppId(?string $envValue): array
{
    $env = null;
    if ($envValue !== null) {
        $env = array_merge(getenv(), ['BEAVER_APP_ID' => $envValue]);
    }
    $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $process = proc_open(['php', __DIR__ . '/_app_id_probe.php'], $descriptors, $pipes, null, $env);
    if (!is_resource($process)) throw new RuntimeException('probeプロセスを起動できません');
    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    $exitCode = proc_close($process);
    if ($exitCode !== 0) throw new RuntimeException("probeが異常終了: $stderr");
    $result = json_decode((string)$stdout, true);
    if (!is_array($result)) throw new RuntimeException("probe出力が不正: $stdout");
    return $result;
}

$default = probeAppId(null);
if ($default['app_id'] !== 'Beaver' || $default['base_path'] !== '/contents/Beaver/api') {
    throw new RuntimeException('BEAVER_APP_ID未指定時に本番AppIDへ後方互換していません: ' . json_encode($default));
}

$beta = probeAppId('Beaver_beta');
if ($beta['app_id'] !== 'Beaver_beta' || $beta['base_path'] !== '/contents/Beaver_beta/api') {
    throw new RuntimeException('BEAVER_APP_ID=Beaver_beta時にAPP_ID/BASE_PATHが切り替わっていません: ' . json_encode($beta));
}

echo "APP_ID/BASE_PATH切替テスト: 2 PASS / 0 FAIL\n";
