# AURIX Core - Create Desktop Shortcut for Windows
# Vytvoří zástupce na ploše pro spuštění AURIX Core

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AURIX Core - Create Desktop Shortcut" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Zjisti cestu k ploše
$desktopPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Desktop"))
$shortcutPath = [System.IO.Path]::Combine($desktopPath, "AURIX Core.lnk")

# Zjisti cestu k aktuální složce
$scriptPath = Split-Path -Parent -Path $MyInvocation.MyCommand.Definition
$batPath = [System.IO.Path]::Combine($scriptPath, "start-aurix-core.bat")

Write-Host "[1/2] Creating shortcut..." -ForegroundColor Yellow
Write-Host "  Source: $batPath" -ForegroundColor Gray
Write-Host "  Target: $shortcutPath" -ForegroundColor Gray
Write-Host ""

# Zkontroluj, jestli soubor existuje
if (-not (Test-Path $batPath)) {
    Write-Host "ERROR: start-aurix-core.bat not found!" -ForegroundColor Red
    Write-Host "Make sure you run this script from the repository root folder." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Vytvoř COM objekt pro shortcut
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)

# Nastav parametry zástupce
$shortcut.TargetPath = $batPath
$shortcut.WorkingDirectory = $scriptPath
$shortcut.Description = "AURIX Core - Admin & ML Control Center"
$shortcut.IconLocation = "cmd.exe,0"  # Defaultní CMD ikona (lze později změnit)

# Ulož zástupce
$shortcut.Save()

Write-Host "[OK] Shortcut created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "[2/2] Shortcut details:" -ForegroundColor Yellow
Write-Host "  Name: AURIX Core.lnk" -ForegroundColor Gray
Write-Host "  Location: $desktopPath" -ForegroundColor Gray
Write-Host "  Target: $batPath" -ForegroundColor Gray
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Done!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "You can now:" -ForegroundColor Green
Write-Host "  1. Double-click 'AURIX Core' on your desktop to start the app" -ForegroundColor White
Write-Host "  2. Right-click the shortcut > Properties to customize the icon" -ForegroundColor White
Write-Host ""

Write-Host "To customize the icon (optional):" -ForegroundColor Yellow
Write-Host "  1. Right-click 'AURIX Core' shortcut > Properties" -ForegroundColor Gray
Write-Host "  2. Click 'Change Icon'" -ForegroundColor Gray
Write-Host "  3. Browse to 'desktop-app/public/icon.png' or similar" -ForegroundColor Gray
Write-Host ""

Read-Host "Press Enter to exit"
