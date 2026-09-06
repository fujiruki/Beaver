param (
    [switch]$KeepLocalDB,
    # R-0141: ベータ環境（AppID Beaver_beta）へ配置する場合に指定する。省略時は従来通り本番へ配置する
    [switch]$Beta
)

$ErrorActionPreference = "Stop"

$appId       = if ($Beta) { "Beaver_beta" } else { "Beaver" }
$serverHost  = "www1045.conoha.ne.jp"
$serverUser  = "c6924945"
$serverPort  = "8022"
$remoteDir   = "public_html/door-fujita.com/contents/$appId"
$sshKeyPath  = "C:\Fujiruki\Projects\AI_DEVELOP_RULES\UPLOAD\key-2025-11-29-07-10.pem"
$archiveName = "deploy.tar.gz"

Write-Host "Starting Beaver deployment process..."
Write-Host "Server: $serverHost"
Write-Host "Target: $remoteDir"

# 1. Build
Write-Host "`n[1/4] Building frontend..."
Push-Location "$PSScriptRoot\frontend"
$env:VITE_APP_ID = $appId
npm.cmd run build
$buildExitCode = $LASTEXITCODE
Remove-Item Env:\VITE_APP_ID
if ($buildExitCode -ne 0) { Pop-Location; throw "Build failed" }
Pop-Location

# 2. Stage
Write-Host "`n[2/4] Staging files..."
$stagingDir = "$PSScriptRoot\deploy_staging"
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Path $stagingDir | Out-Null

Write-Host "  -> Copying dist..." -ForegroundColor Cyan
Copy-Item "$PSScriptRoot\frontend\dist\*" "$stagingDir\" -Recurse -Force

$htaccess = Get-Content "$PSScriptRoot\.htaccess" -Raw
$htaccess = $htaccess.Replace("/contents/Beaver/", "/contents/$appId/")
$htaccess += "`nSetEnv BEAVER_APP_ID $appId`n"
Set-Content -Path "$stagingDir\.htaccess" -Value $htaccess -NoNewline

Write-Host "  -> Copying api..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path "$stagingDir\api" | Out-Null
Copy-Item "$PSScriptRoot\api\*" "$stagingDir\api\" -Recurse -Force

Write-Host "  -> Excluding local backups directory..." -ForegroundColor Yellow
Remove-Item "$stagingDir\api\backups" -Recurse -Force -ErrorAction SilentlyContinue

if ($KeepLocalDB) {
    Write-Host "  -> WARNING: Uploading local DB. Production data will be OVERWRITTEN!" -ForegroundColor Red
} else {
    Write-Host "  -> Excluding local SQLite DB..." -ForegroundColor Yellow
    Remove-Item "$stagingDir\api\*.sqlite" -ErrorAction SilentlyContinue
    Remove-Item "$stagingDir\api\*.db"     -ErrorAction SilentlyContinue
    Remove-Item "$stagingDir\api\config.local.php" -ErrorAction SilentlyContinue
}

# 3. Archive
Write-Host "`n[3/4] Creating archive..."
tar -czf $archiveName -C $stagingDir .
if ($LASTEXITCODE -ne 0) { throw "tar failed" }

# 4. Upload & extract
Write-Host "`n[4/4] Uploading and extracting..."

$sshOpts   = @("-o", "StrictHostKeyChecking=no", "-p", $serverPort, "-i", $sshKeyPath)
$mkdirCmd  = "mkdir -p $remoteDir"
$deployCmd = "cd $remoteDir && find . -maxdepth 1 ! -name 'api' ! -name '.' ! -name '$archiveName' ! -name '*.sqlite' ! -name '.htpasswd' -exec rm -rf {} + && tar -xf $archiveName && rm $archiveName"
$chmodCmd  = "find $remoteDir -type d -exec chmod 755 {} + && find $remoteDir -type f -exec chmod 644 {} + && if [ -f $remoteDir/api/database.sqlite ]; then chmod 666 $remoteDir/api/database.sqlite; chmod 777 $remoteDir/api; fi"

try {
    Write-Host "  -> Ensuring remote directory..." -ForegroundColor Cyan
    & ssh @sshOpts "$serverUser@$serverHost" $mkdirCmd
    if ($LASTEXITCODE -ne 0) { throw "SSH mkdir failed" }

    Write-Host "  -> Uploading archive..." -ForegroundColor Cyan
    & scp -o StrictHostKeyChecking=no -P $serverPort -i $sshKeyPath $archiveName "$serverUser@${serverHost}:$remoteDir/$archiveName"
    if ($LASTEXITCODE -ne 0) { throw "SCP failed" }

    Write-Host "  -> Extracting on server..." -ForegroundColor Cyan
    & ssh @sshOpts "$serverUser@$serverHost" $deployCmd
    if ($LASTEXITCODE -ne 0) { throw "SSH extract failed" }

    Write-Host "  -> Fixing permissions..." -ForegroundColor Cyan
    & ssh @sshOpts "$serverUser@$serverHost" $chmodCmd

    Write-Host "`n========================================" -ForegroundColor Green
    Write-Host "  DEPLOYMENT COMPLETED SUCCESSFULLY!" -ForegroundColor Green
    Write-Host "  https://door-fujita.com/contents/$appId/" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
}
finally {
    if (Test-Path $archiveName) { Remove-Item $archiveName }
    if (Test-Path $stagingDir)  { Remove-Item $stagingDir -Recurse -Force }
}
