# 01_export_from_access.ps1
# AccessバックエンドDBからJSON形式でデータをエクスポート
# 使用方法: powershell -ExecutionPolicy Bypass -File 01_export_from_access.ps1

# config.txt から BE パスを読み込む（UTF-8エンコーディングで明示的に読む）
$ConfigPath = Join-Path $PSScriptRoot "config.txt"
if (-not (Test-Path $ConfigPath)) {
    Write-Error "config.txt が見つかりません: $ConfigPath"
    exit 1
}
$BePath = ([System.IO.File]::ReadAllText($ConfigPath, [System.Text.Encoding]::UTF8)).Trim()

if (-not (Test-Path $BePath)) {
    Write-Error "バックエンドDBが見つかりません: $BePath"
    exit 1
}

$ExportDir = Join-Path $PSScriptRoot "export"
New-Item -ItemType Directory -Force -Path $ExportDir | Out-Null

$conn = New-Object -ComObject "ADODB.Connection"
$conn.Open("Provider=Microsoft.ACE.OLEDB.12.0;Data Source=$BePath;Mode=Read;Persist Security Info=False;")

Write-Host "エクスポート開始: $BePath"
Write-Host ""

function ConvertFieldValue($value) {
    if ($null -eq $value -or $value -is [DBNull] -or $value -is [System.DBNull]) {
        return $null
    }
    if ($value -is [bool]) {
        if ($value) { return 1 } else { return 0 }
    }
    if ($value -is [DateTime]) {
        if ($value.TimeOfDay.TotalSeconds -eq 0) {
            return $value.ToString("yyyy-MM-dd")
        }
        return $value.ToString("yyyy-MM-ddTHH:mm:ss")
    }
    return $value
}

function Export-Table($Conn, $Sql, $OutPath) {
    $rs = New-Object -ComObject "ADODB.Recordset"
    $rs.Open($Sql, $Conn, 3, 1)

    $rows = [System.Collections.Generic.List[object]]::new()

    while (-not $rs.EOF) {
        $row = [ordered]@{}
        for ($i = 0; $i -lt $rs.Fields.Count; $i++) {
            $f = $rs.Fields.Item($i)
            $row[$f.Name] = ConvertFieldValue $f.Value
        }
        $rows.Add($row)
        $rs.MoveNext()
    }
    $rs.Close()

    if ($rows.Count -eq 0) {
        $json = "[]"
    } else {
        $arr = @($rows.ToArray())
        $json = ConvertTo-Json -InputObject $arr -Depth 3
    }

    [System.IO.File]::WriteAllText($OutPath, $json, (New-Object System.Text.UTF8Encoding $false))

    $name = Split-Path $OutPath -Leaf
    Write-Host "  $name ($($rows.Count)件)"
}

Export-Table $conn "SELECT * FROM [tbl得意先M]"         "$ExportDir\tokuisaki.json"
Export-Table $conn "SELECT * FROM [tbl建具台帳]"         "$ExportDir\tategu.json"
Export-Table $conn "SELECT * FROM [tbl建具台帳_本体]"    "$ExportDir\tategu_honbai.json"
Export-Table $conn "SELECT * FROM [tbl建具台帳_金物]"    "$ExportDir\tategu_kanamono.json"
Export-Table $conn "SELECT * FROM [tbl建具台帳_硝子]"    "$ExportDir\tategu_garasu.json"
Export-Table $conn "SELECT * FROM [tbl建具台帳_労務費]"  "$ExportDir\tategu_romuhi.json"
Export-Table $conn "SELECT * FROM [tbl見積]"             "$ExportDir\mitsumori.json"
Export-Table $conn "SELECT * FROM [tbl見積明細]"         "$ExportDir\mitsumori_meisai.json"
Export-Table $conn "SELECT * FROM [tbl売上]"             "$ExportDir\uriage.json"
Export-Table $conn "SELECT * FROM [tbl売上明細]"         "$ExportDir\uriage_meisai.json"

$conn.Close()

Write-Host ""
Write-Host "完了: $ExportDir"
