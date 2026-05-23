Add-Type -AssemblyName System.Drawing
$srcPath = "c:\Users\jimmy\Dashboard Data Base\src\assets\logo-so-mot-new-01.png"
$destPath = "c:\Users\jimmy\Dashboard Data Base\src\assets\logo-so-mot-favicon.png"
$srcImg = [System.Drawing.Image]::FromFile($srcPath)
$maxSize = [System.Math]::Max($srcImg.Width, $srcImg.Height)
$bmp = New-Object System.Drawing.Bitmap($maxSize, $maxSize)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::Transparent)
$x = ($maxSize - $srcImg.Width) / 2
$y = ($maxSize - $srcImg.Height) / 2
$g.DrawImage($srcImg, $x, $y, $srcImg.Width, $srcImg.Height)
$bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
$srcImg.Dispose()
Write-Output "Favicon generated successfully at $destPath"
