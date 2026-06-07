# FÁZA 6.2E: Orchestration Event Logging

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add readable orchestration logs for local multi-service setup

---

## Executive Summary

**FÁZA 6.2E Objective:** *"Přidej stručný lokální orchestration log: services starting, services ready, dependency missing, runtime connected"*

**Status:** ✅ **ACHIEVED**

Orchestration event logging system added:
- ✅ Services starting/ready events logged
- ✅ Dependency missing events logged
- ✅ Runtime connected events logged
- ✅ Orchestration status endpoint
- ✅ Local log files (text + JSON)
- ✅ Simple, readable format

---

## Orchestration Logging

### New Component: OrchestrationLogger

**File:** `backend/orchestration-logger.js`

```javascript
const OrchestrationLogger = require('./orchestration-logger');
const log = new OrchestrationLogger('./logs');

// Log events
log.serviceStarting('Backend', 3000);
log.runtimeConnected('ML Runtime', 'http://ml-runtime:5000');
log.orchestrationReady(2);
```

### Log Methods

```javascript
// Service events
log.serviceStarting(serviceName, port)
log.serviceReady(serviceName, status)

// Dependency events
log.dependencyMissing(dependencyName, reason)
log.runtimeConnected(runtimeName, url, version)

// Orchestration events
log.orchestrationReady(servicesCount)
log.orchestrationDegraded(reason)

// Generic event
log.log(eventType, message, metadata)
```

---

## Log Output Examples

### Text Log: `logs/orchestration.log`

```
[2026-06-07T20:58:05.000Z] [SERVICE_STARTING] Service starting: Backend (Node Express) (port 3000)
[2026-06-07T20:58:05.100Z] [RUNTIME_CONNECTED] Runtime connected: ML Runtime (Python Flask) (http://ml-runtime:5000)
[2026-06-07T20:58:05.200Z] [SERVICE_READY] Service ready: Backend (Node Express) (healthy)
[2026-06-07T20:58:05.300Z] [ORCHESTRATION_READY] Orchestration ready: 2 services
```

### JSON Log: `logs/orchestration.json`

```json
{
  "events": [
    {
      "timestamp": "2026-06-07T20:58:05.000Z",
      "eventType": "SERVICE_STARTING",
      "message": "Service starting: Backend (Node Express) (port 3000)",
      "metadata": {
        "service": "Backend (Node Express)",
        "port": 3000
      }
    },
    {
      "timestamp": "2026-06-07T20:58:05.100Z",
      "eventType": "RUNTIME_CONNECTED",
      "message": "Runtime connected: ML Runtime (Python Flask) (http://ml-runtime:5000)",
      "metadata": {
        "runtime": "ML Runtime (Python Flask)",
        "url": "http://ml-runtime:5000"
      }
    },
    {
      "timestamp": "2026-06-07T20:58:05.200Z",
      "eventType": "SERVICE_READY",
      "message": "Service ready: Backend (Node Express) (healthy)",
      "metadata": {
        "service": "Backend (Node Express)",
        "status": "healthy"
      }
    },
    {
      "timestamp": "2026-06-07T20:58:05.300Z",
      "eventType": "ORCHESTRATION_READY",
      "message": "Orchestration ready: 2 services",
      "metadata": {
        "servicesCount": 2
      }
    }
  ]
}
```

---

## Event Types

### Service Events

```
SERVICE_STARTING
  → Service is initializing
  → Includes service name and port
  → Example: "Service starting: Backend (port 3000)"

SERVICE_READY
  → Service initialized and ready
  → Includes status (healthy/unhealthy/degraded)
  → Example: "Service ready: Backend (healthy)"
```

### Dependency Events

```
DEPENDENCY_MISSING
  → Required service not available
  → Includes reason (ECONNREFUSED, ENOTFOUND, timeout)
  → Example: "Dependency missing: ML Runtime (ECONNREFUSED)"

RUNTIME_CONNECTED
  → Runtime successfully connected
  → Includes URL and optionally version
  → Example: "Runtime connected: ML Runtime (http://ml-runtime:5000)"
```

### Orchestration Events

```
ORCHESTRATION_READY
  → All services running and dependencies satisfied
  → Includes service count
  → Example: "Orchestration ready: 2 services"

ORCHESTRATION_DEGRADED
  → System running but with issues
  → Includes reason
  → Example: "Orchestration degraded: ML Runtime unavailable"

RUNTIME_DISABLED
  → Runtime disabled via configuration
  → Example: "ML Runtime disabled via configuration"

RUNTIME_UNHEALTHY
  → Runtime reachable but health check failed
  → Example: "ML Runtime reachable but health check failed"
```

---

## Orchestration Logs Endpoint

### Get Logs Programmatically

**Endpoint:** `GET /logs/orchestration`

```bash
curl http://localhost:3000/logs/orchestration
```

**Response:**
```json
{
  "status": "ok",
  "eventCount": 4,
  "events": [
    {
      "timestamp": "2026-06-07T20:58:05.000Z",
      "eventType": "SERVICE_STARTING",
      "message": "Service starting: Backend (port 3000)",
      "metadata": {
        "service": "Backend",
        "port": 3000
      }
    },
    {
      "timestamp": "2026-06-07T20:58:05.100Z",
      "eventType": "RUNTIME_CONNECTED",
      "message": "Runtime connected: ML Runtime (http://ml-runtime:5000)",
      "metadata": {
        "runtime": "ML Runtime",
        "url": "http://ml-runtime:5000"
      }
    },
    {
      "timestamp": "2026-06-07T20:58:05.200Z",
      "eventType": "SERVICE_READY",
      "message": "Service ready: Backend (healthy)",
      "metadata": {
        "service": "Backend",
        "status": "healthy"
      }
    },
    {
      "timestamp": "2026-06-07T20:58:05.300Z",
      "eventType": "ORCHESTRATION_READY",
      "message": "Orchestration ready: 2 services",
      "metadata": {
        "servicesCount": 2
      }
    }
  ],
  "timestamp": "2026-06-07T20:58:10.000Z"
}
```

---

## Startup Flow with Logging

### Normal Startup (All Healthy)

```
[2026-06-07T20:58:00.000Z] [SERVICE_STARTING] Service starting: Backend (Node Express) (port 3000)
[2026-06-07T20:58:01.000Z] [RUNTIME_CONNECTED] Runtime connected: ML Runtime (http://ml-runtime:5000)
[2026-06-07T20:58:01.500Z] [SERVICE_READY] Service ready: Backend (Node Express) (healthy)
[2026-06-07T20:58:01.600Z] [ORCHESTRATION_READY] Orchestration ready: 2 services
```

### Degraded Startup (ML Runtime Missing)

```
[2026-06-07T20:58:00.000Z] [SERVICE_STARTING] Service starting: Backend (Node Express) (port 3000)
[2026-06-07T20:58:05.000Z] [DEPENDENCY_MISSING] Dependency missing: ML Runtime (Python) (ECONNREFUSED)
[2026-06-07T20:58:05.100Z] [SERVICE_READY] Service ready: Backend (Node Express) (healthy)
[2026-06-07T20:58:05.200Z] [ORCHESTRATION_DEGRADED] Orchestration degraded: ML Runtime not available
```

### Disabled Runtime

```
[2026-06-07T20:58:00.000Z] [SERVICE_STARTING] Service starting: Backend (Node Express) (port 3000)
[2026-06-07T20:58:00.500Z] [RUNTIME_DISABLED] ML Runtime disabled via configuration
[2026-06-07T20:58:00.600Z] [SERVICE_READY] Service ready: Backend (Node Express) (healthy)
[2026-06-07T20:58:00.700Z] [ORCHESTRATION_READY_DEGRADED] Orchestration ready but runtime disabled
```

---

## View Logs

### Text Logs

```bash
# View all events
cat logs/orchestration.log

# Follow logs
tail -f logs/orchestration.log

# Search for specific events
grep DEPENDENCY_MISSING logs/orchestration.log
grep RUNTIME_CONNECTED logs/orchestration.log
```

### JSON Logs

```bash
# View structured events
cat logs/orchestration.json | jq .

# Get event count
cat logs/orchestration.json | jq '.events | length'

# Filter by event type
cat logs/orchestration.json | jq '.events[] | select(.eventType=="ORCHESTRATION_READY")'
```

### API Endpoint

```bash
# Get via REST API
curl http://localhost:3000/logs/orchestration | jq .

# Pretty print
curl -s http://localhost:3000/logs/orchestration | jq '.'

# Count events
curl -s http://localhost:3000/logs/orchestration | jq '.eventCount'

# Get last event
curl -s http://localhost:3000/logs/orchestration | jq '.events[-1]'
```

---

## Log File Locations

```
logs/
├── orchestration.log       # Text format, line by line
└── orchestration.json      # JSON format, structured events
```

### In Docker Compose

With volume mount in docker-compose.yml:
```yaml
volumes:
  - ./logs:/app/logs
```

**Access logs from host:**
```bash
cat logs/orchestration.log
cat logs/orchestration.json
```

---

## What's Included ✅

✅ OrchestrationLogger class  
✅ Services starting/ready events  
✅ Dependency missing events  
✅ Runtime connected events  
✅ Orchestration status events  
✅ Text log file (readable)  
✅ JSON log file (structured)  
✅ REST API endpoint  
✅ Event metadata tracking  
✅ Automatic log rotation (100 event limit)  

---

## What's NOT Included ❌

❌ Central logging stack (ELK, Splunk, etc.)  
❌ Kubernetes integration  
❌ Training pipeline logging  
❌ Advanced monitoring metrics  
❌ External log forwarding  
❌ Log encryption  

---

## Use Cases

### Monitoring

```bash
# Watch orchestration in real-time
watch -n 1 'curl -s http://localhost:3000/logs/orchestration | jq'
```

### Debugging

```bash
# Check what happened during startup
tail -20 logs/orchestration.log

# Find when runtime connected
grep RUNTIME_CONNECTED logs/orchestration.log
```

### Integration

```bash
# Use logs in scripts
curl -s http://localhost:3000/logs/orchestration | \
  jq '.events[] | select(.eventType=="DEPENDENCY_MISSING")'
```

---

## Summary

**FÁZA 6.2E:** ✅ **COMPLETE**

Orchestration event logging system implemented:

- ✅ Services starting/ready events
- ✅ Dependency missing events
- ✅ Runtime connected events
- ✅ Orchestration status events
- ✅ Text and JSON log files
- ✅ REST API endpoint
- ✅ Simple, readable format
- ✅ Automatic log rotation

Local Podman setup now has **readable orchestration logs**.

---

**Files Created/Modified:**
- `backend/orchestration-logger.js` — New logging class
- `backend/server.js` — Integrated logging
- `logs/orchestration.log` — Text events
- `logs/orchestration.json` — JSON events

**New Endpoint:**
- `GET /logs/orchestration` — Orchestration events

**Usage:**
```bash
# View logs
curl http://localhost:3000/logs/orchestration

# Follow text logs
tail -f logs/orchestration.log

# Check specific events
grep ORCHESTRATION_READY logs/orchestration.log
```

**Status:** Complete and production-ready  
**Next:** FÁZA 6.3 (Advanced features) or production deployment

