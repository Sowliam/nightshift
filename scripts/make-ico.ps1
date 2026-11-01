Add-Type -AssemblyName System.Drawing
$pngPath = Join-Path (Get-Location) "apps/desktop/public/logo.png"
$icoPath = Join-Path (Get-Location) "apps/desktop/build/icon.ico"

$bmp = [System.Drawing.Bitmap]::FromFile($pngPath)
$thumb = New-Object System.Drawing.Bitmap($bmp, 256, 256)
$hIcon = $thumb.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()

$icon.Dispose()
$thumb.Dispose()
$bmp.Dispose()

Write-Host "Created icon.ico successfully! Size:" (Get-Item $icoPath).Length
