Option Explicit

' =====================================================
' 01_export_from_access.vbs
' AccessバックエンドDBからJSON形式でデータをエクスポート
' 使用方法: cscript 01_export_from_access.vbs
' 出力先: export\ ディレクトリ
' =====================================================

Const BE_PATH = "C:\Users\doorf\藤田建具店\建具システム202403\tate202403_be.accdb"

Dim fso, scriptDir, exportDir
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
exportDir = scriptDir & "\export\"

If Not fso.FolderExists(exportDir) Then
    fso.CreateFolder exportDir
End If

If Not fso.FileExists(BE_PATH) Then
    WScript.Echo "エラー: バックエンドDBが見つかりません: " & BE_PATH
    WScript.Quit 1
End If

Dim conn
Set conn = CreateObject("ADODB.Connection")
On Error Resume Next
conn.Open "Provider=Microsoft.ACE.OLEDB.12.0;Data Source=" & BE_PATH & ";Mode=Read;Persist Security Info=False;"
If Err.Number <> 0 Then
    WScript.Echo "エラー: DB接続失敗: " & Err.Description
    WScript.Quit 1
End If
On Error GoTo 0

WScript.Echo "エクスポート開始: " & BE_PATH
WScript.Echo ""

ExportTable conn, "SELECT * FROM [tbl得意先M]", exportDir & "tokuisaki.json"
ExportTable conn, "SELECT * FROM [tbl建具台帳]", exportDir & "tategu.json"
ExportTable conn, "SELECT * FROM [tbl建具台帳_本体]", exportDir & "tategu_honbai.json"
ExportTable conn, "SELECT * FROM [tbl建具台帳_金物]", exportDir & "tategu_kanamono.json"
ExportTable conn, "SELECT * FROM [tbl建具台帳_硝子]", exportDir & "tategu_garasu.json"
ExportTable conn, "SELECT * FROM [tbl建具台帳_労務費]", exportDir & "tategu_romuhi.json"
ExportTable conn, "SELECT * FROM [tbl見積]", exportDir & "mitsumori.json"
ExportTable conn, "SELECT * FROM [tbl見積明細]", exportDir & "mitsumori_meisai.json"
ExportTable conn, "SELECT * FROM [tbl売上]", exportDir & "uriage.json"
ExportTable conn, "SELECT * FROM [tbl売上明細]", exportDir & "uriage_meisai.json"

conn.Close
Set conn = Nothing

WScript.Echo ""
WScript.Echo "完了: " & exportDir

' =====================================================
' テーブルをJSONファイルにエクスポート
' =====================================================
Sub ExportTable(conn, sql, outPath)
    Dim rs
    Set rs = conn.Execute(sql)

    Dim fieldCount, i
    fieldCount = rs.Fields.Count

    Dim fieldNames()
    ReDim fieldNames(fieldCount - 1)
    For i = 0 To fieldCount - 1
        fieldNames(i) = rs.Fields(i).Name
    Next

    Dim rows()
    ReDim rows(9999)
    Dim rowCount
    rowCount = 0

    Do While Not rs.EOF
        Dim parts()
        ReDim parts(fieldCount - 1)
        For i = 0 To fieldCount - 1
            parts(i) = Chr(34) & EscapeJson(fieldNames(i)) & Chr(34) & ":" & ToJsonValue(rs.Fields(i).Value)
        Next

        If rowCount > UBound(rows) Then
            ReDim Preserve rows(UBound(rows) + 10000)
        End If
        rows(rowCount) = "  {" & Join(parts, ",") & "}"
        rowCount = rowCount + 1
        rs.MoveNext
    Loop

    rs.Close
    Set rs = Nothing

    Dim content
    If rowCount = 0 Then
        content = "[]"
    Else
        ReDim Preserve rows(rowCount - 1)
        content = "[" & Chr(10) & Join(rows, "," & Chr(10)) & Chr(10) & "]"
    End If

    WriteUtf8NoBom outPath, content
    WScript.Echo "  " & fso.GetFileName(outPath) & " (" & rowCount & "件)"
End Sub

' =====================================================
' UTF-8（BOMなし）でファイル書き込み
' =====================================================
Sub WriteUtf8NoBom(filePath, content)
    Dim us, bs
    Set us = CreateObject("ADODB.Stream")
    us.Open
    us.Type = 2
    us.Charset = "UTF-8"
    us.WriteText content
    us.Position = 3 ' UTF-8 BOM（EF BB BF）をスキップ

    Set bs = CreateObject("ADODB.Stream")
    bs.Open
    bs.Type = 1
    us.CopyTo bs
    bs.SaveToFile filePath, 2

    bs.Close
    us.Close
    Set bs = Nothing
    Set us = Nothing
End Sub

' =====================================================
' JSON値変換（型別に適切なJSON表現を返す）
' =====================================================
Function ToJsonValue(v)
    Dim vt
    vt = VarType(v)
    Select Case vt
        Case 0, 1 ' vbEmpty, vbNull
            ToJsonValue = "null"
        Case 2, 3 ' vbInteger, vbLong
            ToJsonValue = CStr(CLng(v))
        Case 4, 5 ' vbSingle, vbDouble
            If CDbl(v) = Int(CDbl(v)) Then
                ToJsonValue = CStr(CLng(CDbl(v)))
            Else
                ToJsonValue = Replace(CStr(CDbl(v)), ",", ".")
            End If
        Case 6 ' vbCurrency
            Dim c
            c = CDbl(CCur(v))
            If c = Int(c) Then
                ToJsonValue = CStr(CLng(c))
            Else
                ToJsonValue = Replace(CStr(c), ",", ".")
            End If
        Case 7 ' vbDate
            Dim d
            d = CDate(v)
            If Hour(d) = 0 And Minute(d) = 0 And Second(d) = 0 Then
                ToJsonValue = Chr(34) & Pad4(Year(d)) & "-" & Pad2(Month(d)) & "-" & Pad2(Day(d)) & Chr(34)
            Else
                ToJsonValue = Chr(34) & Pad4(Year(d)) & "-" & Pad2(Month(d)) & "-" & Pad2(Day(d)) & "T" & Pad2(Hour(d)) & ":" & Pad2(Minute(d)) & ":" & Pad2(Second(d)) & Chr(34)
            End If
        Case 8 ' vbString
            ToJsonValue = Chr(34) & EscapeJson(v) & Chr(34)
        Case 11 ' vbBoolean
            If CBool(v) Then ToJsonValue = "1" Else ToJsonValue = "0"
        Case Else
            If IsNull(v) Then
                ToJsonValue = "null"
            ElseIf IsNumeric(v) Then
                ToJsonValue = CStr(CDbl(v))
            Else
                ToJsonValue = Chr(34) & EscapeJson(CStr(v)) & Chr(34)
            End If
    End Select
End Function

Function EscapeJson(s)
    s = Replace(s, "\", "\\")
    s = Replace(s, Chr(34), "\" & Chr(34))
    s = Replace(s, Chr(10), "\n")
    s = Replace(s, Chr(13), "\r")
    s = Replace(s, Chr(9), "\t")
    EscapeJson = s
End Function

Function Pad2(n)
    Pad2 = Right("00" & CStr(n), 2)
End Function

Function Pad4(n)
    Pad4 = Right("0000" & CStr(n), 4)
End Function
