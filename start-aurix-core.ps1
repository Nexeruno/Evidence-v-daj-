# AURIX Core - Desktop Application Launcher for Windows (PowerShell)
# Spustí lokální vývojový server + Electron aplikaci

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " AURIX Core - Startup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# ==========================================
# 1. Zkontroluj Node.js
# ==========================================
Write-Host "[1/3] Checking Node.js installation..." -ForegroundColor Yellow

$nodeVersion = try {
    node --version 2>$null
} catch {
    $null
}

if (-not $nodeVersion) {
    Write-Host ""
    Write-Host "ERROR: Node.js is not installed or not in PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "Download Node.js from: https://nodejs.org/" -ForegroundColor Yellow
    Write-Host "After installation, restart this script." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[OK] Node.js $nodeVersion found" -ForegroundColor Green
Write-Host ""

# ==========================================
# 2. Zkontroluj desktop-app složku
# ==========================================
Write-Host "[2/3] Checking desktop-app directory..." -ForegroundColor Yellow

if (-not (Test-Path "desktop-app")) {
    Write-Host ""
    Write-Host "ERROR: desktop-app folder not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Make sure you run this script from the Evidence výdajů root directory" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Set-Location "desktop-app"
Write-Host "[OK] Desktop-app directory found" -ForegroundColor Green
Write-Host ""

# ==========================================
# 3. Instaluj dependencies (pokud chybí)
# ==========================================
Write-Host "[3/3] Installing dependencies..." -ForegroundColor Yellow

if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "Installing npm packages (first run)..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "ERROR: npm install failed" -ForegroundColor Red
        Write-Host ""
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-Host "[OK] Dependencies already installed" -ForegroundColor Green
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Starting AURIX Core..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Dev server will open at: http://localhost:5173" -ForegroundColor Cyan
Write-Host "Electron app will launch in a few seconds..." -ForegroundColor Cyan
Write-Host ""
Write-Host "Press Ctrl+C to stop the application" -ForegroundColor Yellow
Write-Host ""

# Spusť dev server + Electron
npm run dev

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: Failed to start AURIX Core" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}
