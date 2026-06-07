# FÁZE 6.0D: Container Runtime Logging

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add basic container runtime logging for request/response tracking

---

## Executive Summary

**FÁZA 6.0D Objective:** *"Přidej základní container runtime logy: container started, request received, response returned, runtime error if failed"*

**Status:** ✅ **ACHIEVED**

Container runtime logging now captures:
- ✅ Container startup events
- ✅ Request reception with metadata
- ✅ Response completion with status
- ✅ Runtime errors with context

---

## Container Runtime Logs Implemented

### 1. Container Startup Logs

**When:** Application initialization  
**Log Format:**
```
[CONTAINER-STARTUP] ML Runtime container initialization starting
[CONTAINER-STARTUP] Flask version: 2.3.2
[CONTAINER-STARTUP] Python runtime: 3.11
[CONTAINER-STARTUP] Environment: production
[CONTAINER-STARTUP] Starting ML Runtime Server on port 5000
[CONTAINER-STARTUP] Available endpoints: (list of 8 endpoints)
[CONTAINER-STARTUP] All endpoints ready
[CONTAINER-STARTUP] Listening for requests...
```

**Purpose:** Verify container initialization successful  
**View:** Check logs immediately after container start

### 2. Request Received Logs

**When:** Each POST /predict request arrives  
**Log Format:**
```
[CONTAINER] Request received: POST /predict from 127.0.0.1
```

**Metadata Captured:**
- Request method (POST)
- Endpoint path (/predict)
- Client IP (127.0.0.1 or actual IP in container)
- Timestamp (automatic)

**Purpose:** Track incoming requests in real-time  
**View:** Inspect request flow for debugging

### 3. Response Returned Logs

**When:** Request successfully processed  
**Log Format:**
```
[CONTAINER] Response returned: HTTP 200, uid=log-test-001, status=success, time=1ms
```

**Metadata Captured:**
- HTTP status code (200, 500, etc.)
- Request UID (for correlation)
- Response status (success/failed)
- Processing time in milliseconds

**Purpose:** Confirm successful responses and measure performance  
**View:** Monitor response times and success rates

### 4. Runtime Error Logs

**When:** Exception occurs during processing  
**Log Format:**
```
[CONTAINER-ERROR] Runtime error occurred: uid=log-test-001, error=<error-message>, time=45ms
```

**Metadata Captured:**
- Request UID (for tracking)
- Error message (what went wrong)
- Processing time until error
- Log level: ERROR

**Purpose:** Track failures and debugging information  
**View:** Investigate errors and root causes

---

## Log Output Example

### Success Flow

```
2026-06-07 20:47:37,340 - app - INFO - [CONTAINER] Request received: POST /predict from 127.0.0.1
2026-06-07 20:47:37,340 - app - DEBUG - Request parsed successfully: {...}
2026-06-07 20:47:37,340 - app - INFO - [DATASET-ACCEPTED] uid=log-test-001, rows=3, level=L1
2026-06-07 20:47:37,340 - app - INFO - [PREDICT] Processing: uid=log-test-001, level=L1, txns=3
2026-06-07 20:47:37,341 - app - INFO - [COMPUTATION-SUCCEEDED] uid=log-test-001, predicted_expense=270.00
2026-06-07 20:47:37,341 - app - INFO - [SUCCESS] Prediction completed: uid=log-test-001
2026-06-07 20:47:37,341 - app - INFO - [CONTAINER] Response returned: HTTP 200, uid=log-test-001, status=success, time=1ms
```

**Key Points:**
- Request received log: Start of flow
- Processing logs: Intermediate steps (existing)
- Response returned log: End of flow with status

---

## Log Levels

### INFO Level (Container Tracking)

```
[CONTAINER] Request received: ...
[CONTAINER] Response returned: ...
[CONTAINER-STARTUP] ...
```

Purpose: Track request/response flow  
Visibility: Always visible in production

### ERROR Level (Error Tracking)

```
[CONTAINER-ERROR] Runtime error occurred: ...
```

Purpose: Track and alert on failures  
Visibility: Always visible, can trigger alerts

### DEBUG Level (Detailed Processing)

```
Request parsed successfully: ...
Prediction generated: ...
```

Purpose: Detailed diagnostics  
Visibility: Can be enabled for troubleshooting

---

## Container Log Viewing

### Docker/Podman Container Logs

```bash
# View logs from running container
docker logs <container-id>
podman logs <container-id>

# Follow logs in real-time
docker logs -f <container-id>
podman logs -f <container-id>

# View last N lines
docker logs --tail 100 <container-id>
podman logs --tail 100 <container-id>

# View logs with timestamps
docker logs --timestamps <container-id>
```

### Log Output Example

```
$ docker logs ml-runtime-container

======================================================================
[CONTAINER-STARTUP] ML Runtime container initialization starting
[CONTAINER-STARTUP] Flask version: 2.3.2
[CONTAINER-STARTUP] Python runtime: 3.11
[CONTAINER-STARTUP] Environment: production
[CONTAINER-STARTUP] Starting ML Runtime Server on port 5000
[CONTAINER-STARTUP] Available endpoints:
[CONTAINER-STARTUP]   GET  /health
[CONTAINER-STARTUP]   GET  /readiness
[CONTAINER-STARTUP]   GET  /status-summary
[CONTAINER-STARTUP]   POST /predict
[CONTAINER-STARTUP]   POST /dataset-info
[CONTAINER-STARTUP]   POST /evaluate
[CONTAINER-STARTUP]   POST /evaluate-summary
[CONTAINER-STARTUP] All endpoints ready
[CONTAINER-STARTUP] Listening for requests...
======================================================================
```

---

## Log Correlation

### Request-Response Correlation via UID

Each request has a unique `uid` that appears in all related logs:

```
[CONTAINER] Request received: ... (uid=test-001)
  ↓
[DATASET-ACCEPTED] ... uid=test-001 ...
  ↓
[PREDICT] Processing: uid=test-001 ...
  ↓
[COMPUTATION-SUCCEEDED] uid=test-001 ...
  ↓
[SUCCESS] Prediction completed: uid=test-001 ...
  ↓
[CONTAINER] Response returned: ... uid=test-001 ...
```

**Usage:** Search logs for UID to trace complete request flow

### Request Lifecycle

```
Timeline:
  T0: [CONTAINER] Request received
  T1: [DATASET-ACCEPTED]
  T2: [PREDICT] Processing started
  T3: [COMPUTATION-SUCCEEDED]
  T4: [SUCCESS] Processing completed
  T5: [CONTAINER] Response returned

Processing time: T5 - T0 (shown in response log)
```

---

## Log Filtering and Analysis

### Find All Container Events

```bash
# All container request/response events
docker logs <container> | grep "\[CONTAINER\]"

# All errors
docker logs <container> | grep "\[CONTAINER-ERROR\]"

# All startup events
docker logs <container> | grep "\[CONTAINER-STARTUP\]"
```

### Track Specific Request

```bash
# Find all logs for uid=test-001
docker logs <container> | grep "uid=test-001"

# Count requests
docker logs <container> | grep "\[CONTAINER\] Request" | wc -l

# Average response time
docker logs <container> | grep "\[CONTAINER\] Response" | grep "time=" | ...
```

### Monitor Performance

```bash
# Extract response times
docker logs <container> | grep "\[CONTAINER\] Response returned" | grep -oP 'time=\d+ms'

# Requests per minute
docker logs <container> | grep "\[CONTAINER\] Request" | wc -l

# Error rate
docker logs <container> | grep "\[CONTAINER-ERROR\]" | wc -l
```

---

## What Logs Show

### Container Startup

```
✅ Container is initialized
✅ Flask server is running
✅ All endpoints are available
✅ Server is listening
```

### Request Flow

```
✅ Request arrived at container
✅ Request was processed
✅ Response was generated
✅ Response was returned to client
```

### Performance Metrics

```
✅ Processing time (ms)
✅ Request timestamp
✅ Response status code
✅ Error messages if failed
```

### Request Traceability

```
✅ Each request has unique UID
✅ UID appears in all related logs
✅ Complete flow can be traced
```

---

## Next Steps for Logging

### Not Implemented (Out of Scope for 6.0D)

❌ Central logging stack (ELK, Splunk) — out of scope  
❌ Structured logging format (JSON) — future phase  
❌ Log aggregation from multiple containers — future phase  
❌ Real-time monitoring dashboard — future phase  
❌ Log retention and rotation policies — future phase  

These can be added in future phases (6.1, 7.0+).

---

## Production Readiness

| Component | Status | Details |
|-----------|--------|---------|
| Startup logging | ✅ | Clear initialization trace |
| Request logging | ✅ | Request arrival tracked |
| Response logging | ✅ | Response completion tracked |
| Error logging | ✅ | Errors captured with context |
| UID correlation | ✅ | Full request flow traceable |
| Timestamp | ✅ | All events timestamped |

**Overall:** ✅ **PRODUCTION READY**

---

## Log Best Practices

### For Developers

1. **Trace Request Flow**
   ```bash
   docker logs <container> | grep "uid=<your-uid>"
   ```

2. **Monitor Performance**
   ```bash
   docker logs <container> | grep "\[CONTAINER\] Response"
   ```

3. **Investigate Errors**
   ```bash
   docker logs <container> | grep "\[CONTAINER-ERROR\]"
   ```

### For Operations

1. **Container Health**
   ```bash
   # Check if startup logs present
   docker logs <container> | grep "\[CONTAINER-STARTUP\]"
   ```

2. **Traffic Flow**
   ```bash
   # Monitor request rate
   docker logs <container> | grep "\[CONTAINER\] Request" | wc -l
   ```

3. **Error Detection**
   ```bash
   # Alert on errors
   docker logs <container> | grep "\[CONTAINER-ERROR\]"
   ```

---

## Summary

**FÁZA 6.0D:** ✅ **COMPLETE**

Container runtime logging implemented:

- ✅ Container startup events logged
- ✅ Request reception logged with metadata
- ✅ Response completion logged with status
- ✅ Runtime errors logged with context
- ✅ UID-based correlation for tracing
- ✅ Timestamps on all events

Basic but effective runtime logging for container monitoring.

---

**Implementation Location:**
- `ml-runtime/app.py` — Container logging added

**Log Patterns:**
- `[CONTAINER-STARTUP]` — Initialization events
- `[CONTAINER]` — Request/response events
- `[CONTAINER-ERROR]` — Error events

**Status:** Complete and production-ready  
**View Logs:** `docker logs <container-id>` or `podman logs <container-id>`

