<#
Beaver_beta 環境のDBを本番DBの複製でリセットするスクリプト。
本番側（コピー元）は読み取り専用として扱い、書き込み・chmod変更は一切行わない。
接続設定は upload.ps1 のSSH設定に準拠する。

実行前提: 藤田晴樹さんの実行可否確認を得てから指揮役が実行する（本スクリプトの作成のみでは試走しない）。
#>

$ErrorActionPreference = "Stop"

$serverHost = "www1045.conoha.ne.jp"
$serverUser = "c6924945"
$serverPort = "8022"
$sshKeyPath = "C:\Fujiruki\Projects\AI_DEVELOP_RULES\UPLOAD\key-2025-11-29-07-10.pem"

$prodDir       = "public_html/door-fujita.com/contents/Beaver/api"
$betaDir       = "public_html/door-fujita.com/contents/Beaver_beta/api"
$prodDb        = "$prodDir/database.sqlite"
$betaDb        = "$betaDir/database.sqlite"
$betaBackupDir = "$betaDir/backups"

$sshOpts = @("-o", "StrictHostKeyChecking=no", "-p", $serverPort, "-i", $sshKeyPath)
$target  = "$serverUser@$serverHost"

$logPath = "$PSScriptRoot\reset_beta_db.log"

# Beaver_betaにのみ先行適用するmigration（本番にはまだ適用されていないもの）。増えたら追記する
$betaOnlyMigrations  = @("028_voucher_lines_quantity_real.sql", "034_projects_deleted_at.sql")
$migrationsLocalDir  = Join-Path $PSScriptRoot "..\api\migrations"
$migrationsRemoteTmp = "$betaDir/migrations_tmp"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] [$Level] $Message"
    Write-Host $line
    Add-Content -Path $logPath -Value $line
}

function Invoke-RemoteSsh {
    param([string]$Command)
    $result = & ssh @sshOpts $target $Command
    if ($LASTEXITCODE -ne 0) {
        throw "SSHコマンド失敗 (exit=$LASTEXITCODE): $Command"
    }
    return $result
}

Write-Log "=== Beaver_beta DBリセット開始 ==="

try {
    # 1. Beaver_beta側の現DBをバックアップする（本番側には一切触れない）
    Write-Log "[1/5] Beaver_beta側の現DBをバックアップします"
    $timestamp  = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupName = "database_beta_pre_reset_$timestamp.sqlite"
    Invoke-RemoteSsh "mkdir -p $betaBackupDir && if [ -f $betaDb ]; then cp $betaDb $betaBackupDir/$backupName; else echo 'beta側に既存DBなし。バックアップをスキップします'; fi"
    Write-Log "  -> バックアップ完了: $betaBackupDir/$backupName"

    # 2. 本番DB（コピー元・読み取り専用）をBeaver_betaへ複製する
    #    cp コピー元 コピー先 の順序厳守。コピー元（本番）を書き換えるコマンドはここでは実行しない。
    Write-Log "[2/5] 本番DBをBeaver_betaへ複製します（本番側は読み取り専用で扱う）"
    Invoke-RemoteSsh "cp $prodDb $betaDb"
    Write-Log "  -> 複製完了: $prodDb -> $betaDb"

    # 3. ファイルサイズの一致を確認する（複製が正しく行われたかの確認。この時点ではまだ
    #    beta専用migrationを当てていないため、本番と単純比較できる）
    Write-Log "[3/5] ファイルサイズの一致を確認します"
    $prodSize = (Invoke-RemoteSsh "stat -c%s $prodDb").Trim()
    $betaSize = (Invoke-RemoteSsh "stat -c%s $betaDb").Trim()
    if ($prodSize -ne $betaSize) {
        throw "ファイルサイズ不一致: 本番=$prodSize / beta=$betaSize"
    }
    Write-Log "  -> サイズ一致確認OK (本番=$prodSize / beta=$betaSize バイト)"

    # 4. Beaver_beta専用の先行migrationを再適用する（本番にはまだ適用されていないもの）
    #    複製でDBが本番の状態に巻き戻るため、ここで毎回当て直す
    Write-Log "[4/5] Beaver_beta専用の先行migrationを再適用します ($($betaOnlyMigrations -join ', '))"
    if ($betaOnlyMigrations.Count -gt 0) {
        Invoke-RemoteSsh "mkdir -p $migrationsRemoteTmp"
        foreach ($migration in $betaOnlyMigrations) {
            $localPath = Join-Path $migrationsLocalDir $migration
            if (-not (Test-Path $localPath)) {
                throw "migrationファイルが見つかりません: $localPath"
            }
            $remotePath = "$migrationsRemoteTmp/$migration"

            Write-Log "  -> 転送: $migration"
            & scp -o StrictHostKeyChecking=no -P $serverPort -i $sshKeyPath $localPath "${target}:$remotePath"
            if ($LASTEXITCODE -ne 0) { throw "scp失敗: $migration" }

            # PHPコードをインラインの文字列としてssh経由の`php -r`に渡すと、多重クォートが
            # ネイティブコマンド引数エスケープで壊れるため、一時ファイル転送方式にする
            Write-Log "  -> 適用: $migration"
            $applyPhpLocal  = Join-Path $env:TEMP "beaver_apply_$([guid]::NewGuid()).php"
            $applyPhpRemote = "$migrationsRemoteTmp/apply_$([guid]::NewGuid()).php"
            $applyPhpContent = @"
<?php
`$pdo = new PDO("sqlite:$betaDb");
`$pdo->exec(file_get_contents("$remotePath"));
"@
            [System.IO.File]::WriteAllText($applyPhpLocal, $applyPhpContent, (New-Object System.Text.UTF8Encoding $false))
            try {
                & scp -o StrictHostKeyChecking=no -P $serverPort -i $sshKeyPath $applyPhpLocal "${target}:$applyPhpRemote"
                if ($LASTEXITCODE -ne 0) { throw "scp失敗: $migration 適用用PHP" }
                Invoke-RemoteSsh "php $applyPhpRemote"
                Invoke-RemoteSsh "rm -f $applyPhpRemote"
            } finally {
                Remove-Item -Path $applyPhpLocal -ErrorAction SilentlyContinue
            }
        }

        # ponytail: 型確認は現状の唯一の対象migration（028）に合わせてvoucher_lines.quantityを直接見ている。
        # 対象が増えたら確認先カラムもあわせて増やす（配列化は今は1件のみのためYAGNI）
        $checkPhpLocal  = Join-Path $env:TEMP "beaver_check_$([guid]::NewGuid()).php"
        $checkPhpRemote = "$migrationsRemoteTmp/check_$([guid]::NewGuid()).php"
        $checkPhpContent = @"
<?php
`$pdo = new PDO("sqlite:$betaDb");
foreach (`$pdo->query("PRAGMA table_info(voucher_lines)") as `$col) {
    if (`$col["name"] === "quantity") {
        echo `$col["type"];
    }
}
"@
        [System.IO.File]::WriteAllText($checkPhpLocal, $checkPhpContent, (New-Object System.Text.UTF8Encoding $false))
        try {
            & scp -o StrictHostKeyChecking=no -P $serverPort -i $sshKeyPath $checkPhpLocal "${target}:$checkPhpRemote"
            if ($LASTEXITCODE -ne 0) { throw "scp失敗: 型確認用PHP" }
            $quantityType = (Invoke-RemoteSsh "php $checkPhpRemote").Trim()
            Invoke-RemoteSsh "rm -f $checkPhpRemote"
        } finally {
            Remove-Item -Path $checkPhpLocal -ErrorAction SilentlyContinue
        }
        Invoke-RemoteSsh "rm -rf $migrationsRemoteTmp"

        if ($quantityType -ne "REAL") {
            throw "voucher_lines.quantityの型がREALになっていません（実際: $quantityType）"
        }
        Write-Log "  -> 型確認OK: voucher_lines.quantity = $quantityType"
    } else {
        Write-Log "  -> 対象migrationなし。スキップします"
    }

    # 5. projects/sync API（認証不要）のレコード一致を確認する
    Write-Log "[5/5] projects/sync APIのレコード一致を確認します"
    $prodUrl = "https://door-fujita.com/contents/Beaver/api/projects/sync?limit=1"
    $betaUrl = "https://door-fujita.com/contents/Beaver_beta/api/projects/sync?limit=1"

    $prodJson = curl.exe -s $prodUrl | ConvertFrom-Json
    $betaJson = curl.exe -s $betaUrl | ConvertFrom-Json

    $prodId = $prodJson.projects[0].id
    $betaId = $betaJson.projects[0].id

    if ($null -eq $prodId -or $null -eq $betaId) {
        throw "projects/syncのレスポンスからidを取得できません (本番=$($prodJson | ConvertTo-Json -Compress) / beta=$($betaJson | ConvertTo-Json -Compress))"
    }
    if ($prodId -ne $betaId) {
        throw "projects/syncのレコード不一致: 本番id=$prodId / beta id=$betaId"
    }
    Write-Log "  -> レコード一致確認OK (id=$prodId)"

    Write-Log "=== Beaver_beta DBリセット完了 ==="
}
catch {
    Write-Log "リセット失敗: $($_.Exception.Message)" "ERROR"
    throw
}
