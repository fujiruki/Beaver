<?php
// 使い方: ホームに置いて php rc1_copy_prod_db_to_beta.php <YYYYMMDD_HHMM> 。詳細は docs/wiki/ops/rc1_beta_db_from_prod_20261015.md。作業ファイルを手で mv して入れ替える
// rc1 手順1: Beaver_beta の現DBを退避し、本番DBを読み取り専用で写しを作り、スキーマ差分を出す（本番には書き込まない）
$base = getenv('HOME') . '/public_html/door-fujita.com/contents';
$prod = "$base/Beaver/api/database.sqlite";
$beta = "$base/Beaver_beta/api/database.sqlite";
$ts = $argv[1];
$backup = "$base/Beaver_beta/api/backups/database_beta_{$ts}_pre_rc1_prod_copy.sqlite";
$work = "$base/Beaver_beta/api/database_rc1_work.sqlite";
$ro = [PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION];
foreach ([$backup, $work] as $f) if (file_exists($f)) { fwrite(STDERR, "exists: $f\n"); exit(1); }
$prodMtimeBefore = filemtime($prod); $prodSizeBefore = filesize($prod); $prodHashBefore = md5_file($prod);
$t0 = microtime(true);
(new PDO("sqlite:$beta", null, null, $ro))->exec("VACUUM INTO " . (new PDO('sqlite::memory:'))->quote($backup));
echo "beta退避: $backup (" . filesize($backup) . " bytes, " . round(microtime(true) - $t0, 2) . "s)\n";
$t0 = microtime(true);
(new PDO("sqlite:$prod", null, null, $ro))->exec("VACUUM INTO " . (new PDO('sqlite::memory:'))->quote($work));
echo "本番の写し: $work (" . filesize($work) . " bytes, " . round(microtime(true) - $t0, 2) . "s)\n";
clearstatcache();
echo "本番DB不変: " . ((filemtime($prod) === $prodMtimeBefore && filesize($prod) === $prodSizeBefore && md5_file($prod) === $prodHashBefore) ? 'OK' : 'NG') . "\n";
function schema(string $f): array {
    $p = new PDO("sqlite:$f", null, null, [PDO::SQLITE_ATTR_OPEN_FLAGS => PDO::SQLITE_OPEN_READONLY]);
    $out = [];
    foreach ($p->query("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name") as $r) {
        if ($r['type'] === 'table') {
            foreach ($p->query("PRAGMA table_info(\"{$r['name']}\")") as $c) {
                $out["column {$r['name']}.{$c['name']}"] = "{$c['type']} notnull={$c['notnull']} default={$c['dflt_value']} pk={$c['pk']}";
            }
        } else {
            $out["{$r['type']} {$r['name']}"] = preg_replace('/\s+/', ' ', (string)$r['sql']);
        }
    }
    return $out;
}
$b = schema($backup); $w = schema($work);
echo "--- betaにあって本番の写しに無い／違う\n";
foreach ($b as $k => $v) if (!isset($w[$k]) || $w[$k] !== $v) echo "$k :: beta=$v :: prod=" . ($w[$k] ?? '(なし)') . "\n";
echo "--- 本番の写しにだけある\n";
foreach ($w as $k => $v) if (!isset($b[$k])) echo "$k :: $v\n";
$p = new PDO("sqlite:$work");
foreach (['customers', 'projects', 'vouchers', 'voucher_lines'] as $t) echo "$t: " . $p->query("SELECT COUNT(*) FROM $t")->fetchColumn() . "\n";
echo "integrity: " . $p->query("PRAGMA integrity_check")->fetchColumn() . "\n";
