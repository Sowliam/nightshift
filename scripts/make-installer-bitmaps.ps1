Add-Type -AssemblyName System.Drawing

$logoPath = "C:\Users\SOWLI\Desktop\nightshift\apps\desktop\public\logo.png"
$buildDir = "C:\Users\SOWLI\Desktop\nightshift\apps\desktop\build"

if (-not (Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
}

$logo = [System.Drawing.Image]::FromFile($logoPath)

# 1. Create installerSidebar.bmp (164x314)
$sbWidth = 164
$sbHeight = 314
$sbBmp = New-Object System.Drawing.Bitmap($sbWidth, $sbHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($sbBmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Dark gradient background
$brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.Point(0, 0)),
    (New-Object System.Drawing.Point(0, $sbHeight)),
    [System.Drawing.Color]::FromArgb(10, 9, 8),
    [System.Drawing.Color]::FromArgb(22, 21, 20)
)
$g.FillRectangle($brush, 0, 0, $sbWidth, $sbHeight)
$brush.Dispose()

# Accent glow at the top-left
$glowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(40, 82, 183, 136))
$g.FillEllipse($glowBrush, -20, 20, 140, 140)
$glowBrush.Dispose()

# Subtle tech grid / border accent
$penAccent = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(82, 183, 136), 1.5)
$g.DrawLine($penAccent, 0, 0, $sbWidth, 0)
$g.DrawLine($penAccent, $sbWidth - 1, 0, $sbWidth - 1, $sbHeight)
$penAccent.Dispose()

# Draw Logo (centered horizontally, upper half)
$logoSize = 88
$logoX = [int](($sbWidth - $logoSize) / 2)
$logoY = 50
$g.DrawImage($logo, $logoX, $logoY, $logoSize, $logoSize)

# Draw Title "NIGHTSHIFT"
$fontTitle = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$brushWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("NIGHTSHIFT", $fontTitle, $brushWhite, ($sbWidth / 2), 155, $sf)

# Draw Subtitle "ULTRA-LOW LATENCY"
$fontSub = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Bold)
$brushGreen = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 183, 136))
$g.DrawString("VOICE & GAMING MESH", $fontSub, $brushGreen, ($sbWidth / 2), 178, $sf)

# Draw Bottom badge
$fontVer = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Regular)
$brushGray = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(120, 120, 130))
$g.DrawString("v0.1.0 • High-Speed", $fontVer, $brushGray, ($sbWidth / 2), 285, $sf)

$g.Dispose()

$sidebarPath = Join-Path $buildDir "installerSidebar.bmp"
$sbBmp.Save($sidebarPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$uninstallerPath = Join-Path $buildDir "uninstallerSidebar.bmp"
$sbBmp.Save($uninstallerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$sbBmp.Dispose()


# 2. Create installerHeader.bmp (150x57)
$hWidth = 150
$hHeight = 57
$hBmp = New-Object System.Drawing.Bitmap($hWidth, $hHeight, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$gH = [System.Drawing.Graphics]::FromImage($hBmp)
$gH.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gH.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Background
$bgH = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(14, 13, 12))
$gH.FillRectangle($bgH, 0, 0, $hWidth, $hHeight)
$bgH.Dispose()

# Mini Logo on right
$hLogoSize = 42
$hLogoX = $hWidth - $hLogoSize - 8
$hLogoY = [int](($hHeight - $hLogoSize) / 2)
$gH.DrawImage($logo, $hLogoX, $hLogoY, $hLogoSize, $hLogoSize)

# Text on left
$fontHeader = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$brushHeader = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$gH.DrawString("NIGHTSHIFT", $fontHeader, $brushHeader, 12, 12)

$fontHeaderSub = New-Object System.Drawing.Font("Segoe UI", 7, [System.Drawing.FontStyle]::Regular)
$brushHeaderSub = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(82, 183, 136))
$gH.DrawString("Setup Wizard", $fontHeaderSub, $brushHeaderSub, 12, 30)

$gH.Dispose()
$logo.Dispose()

$headerPath = Join-Path $buildDir "installerHeader.bmp"
$hBmp.Save($headerPath, [System.Drawing.Imaging.ImageFormat]::Bmp)
$hBmp.Dispose()

Write-Host "Created installerSidebar.bmp and installerHeader.bmp successfully."

