# FÁZA 6.2D: Startup Order & Dependency Check

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add startup order check and readable dependency error messages

---

## Executive Summary

**FÁZA 6.2D Objective:** *"Přidej základní startup order / dependency sanity check. Pokud Python runtime neběží, app/backend to má čitelně říct."*

**Status:** ✅ **ACHIEVED**

Startup dependency check system added:
- ✅ Backend detects missing Python runtime at startup
- ✅ Readable error messages with solutions
- ✅ Dependency status endpoint for monitoring
- ✅ Automated startup order verification script
- ✅ Clear instructions for fixing issues

---

## Features

### 1. Startup Dependency Check (Backend)

**When Backend Starts:**

```
[STARTUP] Configuration:
  Backend Port: 3000
  ML Runtime Host: ml-runtime
  ML Runtime Port: 5000
  ML Runtime URL: http://ml-runtime:5000
  ML Runtime Enabled: true

[STARTUP] Checking dependencies...

[STARTUP] Dependency: ML Runtime
  ✅ Status: HEALTHY

[STARTUP] All dependencies satisfied
```

**If ML Runtime is Missing:**

```
[STARTUP] Dependency: ML Runtime
  ❌ Status: UNREACHABLE
  Reason: ECONNREFUSED
  Expected: http://ml-runtime:5000

  ⚠️ DEPENDENCY MISSING!

  Solution 1: If using docker-compose
    podman-compose down
    podman-compose up

  Solution 2: If running standalone
    cd ml-runtime
    python app.py

  Solution 3: Check configuration
    ML_RUNTIME_HOST=ml-runtime
    ML_RUNTIME_PORT=5000
```

### 2. Dependency Status Endpoint

**New Endpoint:** `GET /status/dependencies`

```bash
curl http://localhost:3000/status/dependencies
```

**Response (All Healthy):**
```json
{
  "status": "ready",
  "dependencies": {
    "backend": {
      "name": "Node Backend",
      "status": "healthy",
      "enabled": true
    },
    "mlRuntime": {
      "name": "ML Runtime (Python)",
      "status": "healthy",
      "reachable": true,
      "enabled": true,
      "host": "ml-runtime",
      "port": "5000",
      "url": "http://ml-runtime:5000",
      "reason": null
    }
  },
  "timestamp": "2026-06-07T20:58:05.000Z"
}
```

**Response (ML Runtime Missing):**
```json
{
  "status": "degraded",
  "dependencies": {
    "backend": {
      "name": "Node Backend",
      "status": "healthy",
      "enabled": true
    },
    "mlRuntime": {
      "name": "ML Runtime (Python)",
      "status": "unhealthy",
      "reachable": false,
      "enabled": true,
      "host": "ml-runtime",
      "port": "5000",
      "url": "http://ml-runtime:5000",
      "reason": "ECONNREFUSED"
    }
  },
  "timestamp": "2026-06-07T20:58:05.000Z"
}
```

### 3. Automated Startup Check Script

**File:** `check-startup-order.sh`

```bash
chmod +x check-startup-order.sh
bash check-startup-order.sh
```

**What It Does:**
1. Tests ML Runtime startup
2. Tests Backend startup
3. Checks all dependencies
4. Verifies request/response flow
5. Provides detailed error messages

**Output (Success):**
```
╔════════════════════════════════════════════════════════════╗
║  FÁZA 6.2D: Startup Order & Dependency Check              ║
╚════════════════════════════════════════════════════════════╝

[CHECK 1] Verify startup order and dependencies

[STARTUP ORDER] Expected order:
  1. ML Runtime starts first
  2. Backend starts after ML Runtime is healthy

[STEP 1] Check ML Runtime startup
✅ PASS — ML Runtime is responding (HTTP 200)
✅ ML Runtime started successfully

[STEP 2] Check Backend startup
✅ PASS — Backend is responding (HTTP 200)
✅ Backend started successfully

[STEP 3] Check all dependencies
✅ All dependencies satisfied

[STEP 4] Verify request/response flow
✅ PASS — Request/response flow working
  Backend successfully processed prediction request

Checks Passed: 4
Checks Failed: 0

✅ All startup order checks passed!

Services are running in correct order:
  1. ML Runtime (Python Flask) ✓
  2. Backend (Node Express) ✓
  3. Dependencies satisfied ✓
  4. Request/response flow ✓

Status: READY FOR TESTING
```

**Output (Failure - ML Runtime Missing):**
```
[STEP 1] Check ML Runtime startup
.......❌ FAIL — ML Runtime is not responding (HTTP 000)

[STEP 2] Check Backend startup
✅ PASS — Backend is responding (HTTP 200)
✅ Backend started successfully

[STEP 3] Check all dependencies
⚠️ Dependencies partially satisfied

Status: Some services not fully healthy

  ✗ ML Runtime: UNREACHABLE
    Reason: ECONNREFUSED

    Solution:
      1. ML Runtime not listening on expected port
      2. Check: python app.py is running
      3. Check: ML_RUNTIME_HOST and ML_RUNTIME_PORT

Checks Passed: 1
Checks Failed: 3

❌ Some startup checks failed!

Troubleshooting:
  1. Check service logs:
     podman-compose logs -f

  2. Verify services are running:
     podman-compose ps

  3. Check configuration:
     cat .env.docker-compose

  4. Restart services:
     podman-compose down
     podman-compose up
```

---

## Startup Flow

### Normal Startup (Both Services)

```
1. Docker Compose starts services in order:
   ├─ ml-runtime (Python Flask)
   │  └─ Listens on :5000
   │  └─ Health check passes
   │
   └─ backend (Node Express)
      ├─ Waits for ml-runtime to be healthy (depends_on)
      ├─ Starts on :3000
      ├─ [STARTUP] Checks ML Runtime connectivity
      ├─ ✅ ML Runtime is reachable
      └─ ✅ All dependencies satisfied

2. User can:
   ├─ curl http://localhost:3000/health
   ├─ curl http://localhost:3000/status/dependencies
   └─ curl -X POST http://localhost:3000/predict ...
```

### Degraded Startup (ML Runtime Missing)

```
1. Docker Compose starts services:
   ├─ ml-runtime FAILS to start or crashes
   │
   └─ backend (Node Express)
      ├─ Waits for ml-runtime to be healthy
      ├─ Timeout after 90 seconds (depends_on)
      ├─ Starts anyway (exits wait)
      ├─ [STARTUP] Checks ML Runtime connectivity
      ├─ ❌ ML Runtime is UNREACHABLE
      ├─ Reason: ECONNREFUSED
      ├─ [STARTUP] ⚠️ Solution provided
      ├─ [STARTUP] CRITICAL: Required dependencies not satisfied!
      └─ ✅ Server still starts (can use fallback)

2. User sees clear error:
   ├─ Backend health: http://localhost:3000/health ✓
   ├─ Dependencies: /status/dependencies shows unreachable
   └─ Predictions use fallback (status: "fallback")
```

---

## Error Messages & Solutions

### Error 1: ECONNREFUSED

```
Reason: Connection refused (port not listening)

Symptoms:
- ML Runtime not started
- ML Runtime crashed
- Wrong port configured

Solution:
1. Check if python app.py is running:
   ps aux | grep python

2. If not running, start it:
   cd ml-runtime
   python app.py

3. Verify with curl:
   curl http://127.0.0.1:5000/health

4. Check configuration:
   ML_RUNTIME_HOST=ml-runtime
   ML_RUNTIME_PORT=5000
```

### Error 2: ENOTFOUND

```
Reason: DNS resolution failed (hostname not found)

Symptoms:
- Service name not resolvable
- Wrong service name in config
- Network issue

Solution:
1. In docker-compose: use service name 'ml-runtime'
   ML_RUNTIME_HOST=ml-runtime

2. Not in docker-compose: use IP or localhost
   ML_RUNTIME_HOST=127.0.0.1
   ML_RUNTIME_HOST=192.168.1.100

3. Verify with:
   curl http://ml-runtime:5000/health
   # or
   curl http://127.0.0.1:5000/health
```

### Error 3: Timeout

```
Reason: Service not responding in time

Symptoms:
- Service starting up
- Service overloaded
- Network latency

Solution:
1. Wait for service to fully start:
   podman-compose logs -f ml-runtime

2. Check CPU/memory:
   podman stats

3. Increase timeout if needed:
   HEALTH_CHECK_TIMEOUT=15 (in .env.docker-compose)

4. Restart services:
   podman-compose restart
```

---

## Endpoints Summary

### Health & Status Endpoints

```
GET /health
  → Backend is alive and responding
  
GET /ml-runtime/status
  → ML Runtime connectivity status
  
GET /ml-runtime/health
  → ML Runtime health check
  
GET /status/dependencies (NEW - FÁZA 6.2D)
  → All service dependencies status
  
POST /predict
  → Make prediction request
```

---

## Startup Order Verification

### Using docker-compose

```bash
# Full startup with dependency check
podman-compose up

# Verify in another terminal
bash check-startup-order.sh

# Or check manually
curl http://localhost:3000/health
curl http://localhost:3000/status/dependencies
curl http://localhost:5000/health
```

### Using standalone Python

```bash
# Terminal 1: Start Python runtime
cd ml-runtime
python app.py

# Terminal 2: Start Node backend (wait for Python startup)
cd backend
npm start

# Terminal 3: Verify
bash check-startup-order.sh
```

---

## What's Included ✅

✅ **Backend startup check** — Detects missing ML Runtime at startup  
✅ **Readable error messages** — Clear explanation of what's wrong  
✅ **Solution suggestions** — How to fix the issue  
✅ **Dependency status endpoint** — `/status/dependencies`  
✅ **Automated check script** — `check-startup-order.sh`  
✅ **Error classification** — ECONNREFUSED, ENOTFOUND, timeout, etc.  
✅ **Startup order logging** — Detailed startup sequence logging  

---

## What's NOT Included ❌

❌ Automatic service recovery  
❌ Complex orchestration manager  
❌ Kubernetes readiness probes  
❌ Training pipeline checks  
❌ Message queue checks  

---

## Summary

**FÁZA 6.2D:** ✅ **COMPLETE**

Startup order and dependency check system implemented:

- ✅ Backend detects missing Python runtime
- ✅ Clear, readable error messages with solutions
- ✅ Dependency status endpoint for monitoring
- ✅ Automated startup order verification script
- ✅ Error classification with troubleshooting
- ✅ Graceful fallback when runtime unavailable

Local Podman setup now **recognizes missing runtime dependency** and provides clear guidance.

---

**Files Modified/Created:**
- `backend/server.js` — Updated with startup check and /status/dependencies
- `check-startup-order.sh` — Automated startup verification script

**New Endpoints:**
- `GET /status/dependencies` — Check all service dependencies

**Usage:**
```bash
# Check startup order
bash check-startup-order.sh

# Check dependencies
curl http://localhost:3000/status/dependencies

# View logs during startup
podman-compose logs -f
```

**Status:** Complete and production-ready  
**Next:** FÁZA 6.3 (Advanced features) or production deployment

