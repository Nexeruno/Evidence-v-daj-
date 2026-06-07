# FÁZA 6.2D: Shrnutí — Startup Order & Dependency Check

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07

---

## Co Bylo Uděláno

### Startup Order & Dependency Sanity Check

```
Backend Server Startup
├─ Check ML Runtime configuration
├─ Check ML Runtime connectivity
├─ Detect missing/unreachable runtime
├─ Log readable error messages
└─ Suggest solutions
```

---

## Nové Funkce

### 1. Startup Dependency Check

```
[STARTUP] Checking dependencies...

[STARTUP] Dependency: ML Runtime
  ✅ Status: HEALTHY
  
[STARTUP] ✅ All dependencies satisfied
```

**Pokud runtime chybí:**

```
[STARTUP] Dependency: ML Runtime
  ❌ Status: UNREACHABLE
  Reason: ECONNREFUSED
  
  Solution 1: If using docker-compose
    podman-compose down
    podman-compose up
    
  Solution 2: If running standalone
    cd ml-runtime
    python app.py
```

### 2. Dependency Status Endpoint

```bash
GET /status/dependencies
```

**Odpověď:**
```json
{
  "status": "ready",
  "dependencies": {
    "backend": {"status": "healthy"},
    "mlRuntime": {
      "status": "healthy",
      "reachable": true,
      "host": "ml-runtime",
      "reason": null
    }
  }
}
```

**Pokud missing:**
```json
{
  "status": "degraded",
  "mlRuntime": {
    "status": "unhealthy",
    "reachable": false,
    "reason": "ECONNREFUSED"
  }
}
```

### 3. Startup Order Check Script

```bash
bash check-startup-order.sh
```

**Výstup (Success):**
```
✅ All startup order checks passed!

Services in correct order:
  1. ML Runtime (Python Flask) ✓
  2. Backend (Node Express) ✓
  3. Dependencies satisfied ✓
  4. Request/response flow ✓

Status: READY FOR TESTING
```

**Výstup (Failure):**
```
❌ Some startup checks failed!

  ✗ ML Runtime: UNREACHABLE
    Reason: ECONNREFUSED
    
Troubleshooting:
  1. podman-compose logs -f
  2. podman-compose ps
  3. podman-compose down && podman-compose up
```

---

## Error Messages

### ECONNREFUSED

```
Reason: ML Runtime not listening

Solution:
  1. Check: ps aux | grep python
  2. Start: cd ml-runtime && python app.py
  3. Verify: curl http://127.0.0.1:5000/health
```

### ENOTFOUND

```
Reason: Hostname not found

Solution (docker-compose):
  ML_RUNTIME_HOST=ml-runtime

Solution (standalone):
  ML_RUNTIME_HOST=127.0.0.1
```

### Timeout

```
Reason: Service not responding in time

Solution:
  1. Wait for startup: podman-compose logs -f
  2. Check resources: podman stats
  3. Restart: podman-compose restart
```

---

## Verifikace

### Check startup order:

```bash
bash check-startup-order.sh
```

### Check dependencies:

```bash
curl http://localhost:3000/status/dependencies
```

### View startup logs:

```bash
podman-compose logs -f
```

---

## Soubory

### Nové/Upravené:

1. **backend/server.js** (updated)
   - New endpoint: GET /status/dependencies
   - Improved startup logging
   - Dependency sanity check

2. **check-startup-order.sh** (new)
   - Automated startup verification
   - Dependency health checks
   - Clear error messages

---

## Summary

**FÁZA 6.2D: ✅ COMPLETE**

Startup order & dependency check:

- ✅ Backend detects missing runtime at startup
- ✅ Readable error messages with solutions
- ✅ Dependency status endpoint
- ✅ Automated check script
- ✅ Error classification & troubleshooting
- ✅ Graceful degraded mode

Lokální Podman setup nyní **rozpozná chybějící runtime dependency** a poskytne jasné pokyny.

---

**Usage:**
- Manual check: `bash check-startup-order.sh`
- API check: `curl http://localhost:3000/status/dependencies`
- Logs: `podman-compose logs -f`

**Status:** Complete and ready  
**Next:** FÁZA 6.3 (Advanced) or deployment

