# AURIX Core - Full Startup
# 1. Podman machine start
# 2. Build images if missing, start ml-runtime + node-backend containers
# 3. Wait for both /health endpoints
# 4. Start AURIX Core Electron app

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent (Split-Path -Parent $scriptDir)
$desktopApp  = Join-Path $projectRoot "desktop-app"

function Write-Header($text) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  $text" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($n, $text) {
    Write-Host "[$n] $text" -ForegroundColor Yellow
}

function Write-OK($text)  { Write-Host "  [OK] $text" -ForegroundColor Green }
function Write-Err($text) { Write-Host "  [ERR] $text" -ForegroundColor Red }

function Wait-ForHealth($url, $name, $timeoutSec = 90) {
    Write-Host "      Waiting for $name..." -ForegroundColor DarkGray
    $elapsed = 0
    while ($elapsed -lt $timeoutSec) {
        try {
            $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { Write-OK "$name ready ($url)"; return $true }
        } catch {}
        Start-Sleep -Seconds 3
        $elapsed += 3
    }
    Write-Err "$name did not respond in ${timeoutSec}s — check: podman logs $name"
    return $false
}

function Stop-Services {
    Write-Host ""
    Write-Host "Stopping Podman containers..." -ForegroundColor Yellow
    podman stop ml-runtime  2>$null
    podman stop node-backend 2>$null
    Write-Host "Done." -ForegroundColor Green
}

Write-Header "AURIX Core - Startup"

# ── 1. Node.js ──────────────────────────────────────────────────
Write-Step "1/5" "Checking Node.js..."
$nodeVer = node --version 2>$null
if (-not $nodeVer) {
    Write-Err "Node.js not found. Download: https://nodejs.org/"
    Read-Host "Press Enter to exit"; exit 1
}
Write-OK "Node.js $nodeVer"

# ── 2. Podman ───────────────────────────────────────────────────
Write-Step "2/5" "Checking Podman..."
$podmanVer = podman --version 2>$null
if (-not $podmanVer) {
    Write-Err "Podman not found. Download: https://podman.io/getting-started/installation"
    Read-Host "Press Enter to exit"; exit 1
}
Write-OK "$podmanVer"

# ── 3. Podman machine ───────────────────────────────────────────
Write-Step "3/5" "Starting Podman machine (WSL2)..."
podman machine start 2>$null
if ($LASTEXITCODE -ne 0) {
    # Non-zero usually means "already running" — verify by running a test command
    podman info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Podman machine failed to start. Try: podman machine init"
        Read-Host "Press Enter to exit"; exit 1
    }
}
Write-OK "Podman machine running"

# ── 4. ML services (Podman containers) ─────────────────────────
Write-Step "4/5" "Starting ML services..."

Set-Location $projectRoot

# Network
podman network create ml-network 2>$null

# Build images if they don't exist
$images = podman images --format "{{.Repository}}" 2>$null
if ($images -notcontains "evidence-vydaju-ml-runtime") {
    Write-Host "      Building ml-runtime image (first run, ~1min)..." -ForegroundColor Yellow
    podman build -t evidence-vydaju-ml-runtime -f ml-runtime/Containerfile .
    if ($LASTEXITCODE -ne 0) { Write-Err "Build failed: ml-runtime"; Read-Host "Press Enter"; exit 1 }
}
if ($images -notcontains "evidence-vydaju-backend") {
    Write-Host "      Building backend image (first run)..." -ForegroundColor Yellow
    podman build -t evidence-vydaju-backend -f backend/Containerfile .
    if ($LASTEXITCODE -ne 0) { Write-Err "Build failed: backend"; Read-Host "Press Enter"; exit 1 }
}

# Remove old containers if any
podman rm -f ml-runtime  2>$null
podman rm -f node-backend 2>$null

# Start ml-runtime
Write-Host "      Starting ml-runtime container..." -ForegroundColor DarkGray
podman run -d --name ml-runtime `
    --network ml-network `
    -p 5000:5000 `
    evidence-vydaju-ml-runtime
if ($LASTEXITCODE -ne 0) { Write-Err "Failed to start ml-runtime container"; Read-Host "Press Enter"; exit 1 }

# Start node-backend
Write-Host "      Starting node-backend container..." -ForegroundColor DarkGray
podman run -d --name node-backend `
    --network ml-network `
    -p 3000:3000 `
    -e ML_RUNTIME_HOST=ml-runtime `
    -e ML_RUNTIME_PORT=5000 `
    -e ML_RUNTIME_ENABLED=true `
    -e PORT=3000 `
    evidence-vydaju-backend
if ($LASTEXITCODE -ne 0) { Write-Err "Failed to start node-backend container"; Read-Host "Press Enter"; exit 1 }

# Wait for health
$mlOk = Wait-ForHealth "http://localhost:5000/health"  "ml-runtime"  90
$beOk = Wait-ForHealth "http://localhost:3000/health"  "node-backend" 60

if (-not $mlOk -or -not $beOk) {
    Write-Err "Services not healthy. Logs:"
    Write-Host "  podman logs ml-runtime" -ForegroundColor Yellow
    Write-Host "  podman logs node-backend" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"; exit 1
}

Write-OK "ML runtime:   http://localhost:5000"
Write-OK "Node backend: http://localhost:3000"

# ── 5. AURIX Core (Electron) ────────────────────────────────────
Write-Step "5/5" "Starting AURIX Core (Electron)..."

Set-Location $desktopApp

if (-not (Test-Path "node_modules")) {
    Write-Host "      Installing npm packages (first run)..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "  Press Ctrl+C to stop AURIX Core." -ForegroundColor Yellow
Write-Host "  To also stop Podman containers run:" -ForegroundColor DarkGray
Write-Host "    podman stop ml-runtime node-backend" -ForegroundColor DarkGray
Write-Host ""

try {
    npm run electron-dev
} finally {
    Stop-Services
}
