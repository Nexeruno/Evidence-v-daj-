# FÁZA 6.1D: ML Runtime Connectivity Check

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add basic connectivity check from Node/Firebase to Podman runtime

---

## Executive Summary

**FÁZA 6.1D Objective:** *"Přidej jednoduchý connection check z Node/Firebase vrstvy na Podman runtime"*

**Status:** ✅ **ACHIEVED**

Node/Firebase layer can now check basic network connectivity to Python runtime:
- ✅ Simple reachability test (not full health check)
- ✅ Returns reachable/unreachable status
- ✅ Includes host and port information
- ✅ Identifies failure reason (timeout, disabled, etc.)
- ✅ No complex diagnostics

---

## Connectivity Check Function

### Function Signature

```javascript
async function checkMlRuntimeConnectivity() {
  // Returns: {reachable: boolean, host: string, port: string, reason?: string}
}
```

### Import and Use

```javascript
const { checkMlRuntimeConnectivity } = require('./mlRuntimeClient');

const status = await checkMlRuntimeConnectivity();

if (status.reachable) {
  console.log(`✅ Runtime reachable at ${status.host}:${status.port}`);
} else {
  console.log(`❌ Runtime unreachable: ${status.reason}`);
}
```

---

## Response Format

### When Reachable

```javascript
{
  reachable: true,
  host: "127.0.0.1",
  port: "5000"
}
```

**Meaning:** Runtime is accessible and responding to basic HTTP requests.

### When Unreachable (Network Error)

```javascript
{
  reachable: false,
  host: "127.0.0.1",
  port: "5000",
  reason: "ECONNREFUSED"
}
```

**Reasons:**
- `ECONNREFUSED` — Connection rejected (runtime not listening)
- `ENOTFOUND` — DNS resolution failed
- `timeout` — Request took too long (>5 seconds)
- `connection_error` — Other network errors

### When Unreachable (Runtime Disabled)

```javascript
{
  reachable: false,
  host: "127.0.0.1",
  port: "5000",
  reason: "runtime_disabled"
}
```

**Meaning:** `ML_RUNTIME_ENABLED=false`, not a network issue.

### When Reachable But HTTP Error

```javascript
{
  reachable: true,
  host: "127.0.0.1",
  port: "5000",
  reason: "http_500"
}
```

**Meaning:** Network connection works, but runtime returned an HTTP error.

---

## Connectivity vs. Health Check

### Connectivity Check (FÁZA 6.1D)

```
checkMlRuntimeConnectivity()
├─ Just checks if runtime is reachable
├─ Returns: reachable or not
├─ Fast (5s timeout)
└─ No validation of health/readiness
```

### Health Check (Earlier)

```
checkMlRuntimeHealth()
├─ Checks if runtime is reachable AND healthy
├─ Validates response structure
├─ Ensures status: "healthy"
└─ More comprehensive
```

### Difference

| Aspect | Connectivity | Health |
|--------|--------------|--------|
| Purpose | Network test | Service validation |
| Checks | Can I reach it? | Is it healthy? |
| Speed | Very fast | Fast |
| Response | reachable/unreachable | healthy/unhealthy |
| Validation | HTTP connection | Full health contract |

---

## Common Scenarios

### Scenario 1: Runtime Available and Healthy

```
checkMlRuntimeConnectivity() → reachable: true
checkMlRuntimeHealth() → true
callMlRuntime() → success
```

### Scenario 2: Runtime Not Running

```
checkMlRuntimeConnectivity() → {reachable: false, reason: "ECONNREFUSED"}
checkMlRuntimeHealth() → false
callMlRuntime() → fallback or error
```

### Scenario 3: Runtime Disabled

```
checkMlRuntimeConnectivity() → {reachable: false, reason: "runtime_disabled"}
checkMlRuntimeHealth() → false
callMlRuntime() → fallback with status "runtime_disabled"
```

### Scenario 4: Network Timeout

```
checkMlRuntimeConnectivity() → {reachable: false, reason: "timeout"}
checkMlRuntimeHealth() → false
callMlRuntime() → fallback or error
```

### Scenario 5: Runtime Crashing (HTTP 500)

```
checkMlRuntimeConnectivity() → {reachable: true, reason: "http_500"}
checkMlRuntimeHealth() → false
callMlRuntime() → fallback or error
```

---

## Logging

### Successful Connection

```
✅ Runtime connectivity: reachable (http://127.0.0.1:5000)
```

### Failed Connection (Network Error)

```
⚠️ Runtime connectivity: unreachable | reason=ECONNREFUSED | url=http://127.0.0.1:5000
```

### Runtime Disabled

```
⚠️ Runtime connectivity check: disabled
```

### HTTP Error Response

```
⚠️ Runtime connectivity: reachable but returned 500
```

---

## Usage Examples

### Basic Connectivity Test

```javascript
const { checkMlRuntimeConnectivity } = require('./mlRuntimeClient');

async function main() {
  const status = await checkMlRuntimeConnectivity();
  
  if (status.reachable) {
    console.log(`Runtime is reachable at ${status.host}:${status.port}`);
  } else {
    console.log(`Runtime is not reachable: ${status.reason}`);
  }
}

main();
```

### Before Making Predictions

```javascript
const { checkMlRuntimeConnectivity, callMlRuntime } = require('./mlRuntimeClient');

async function predictExpense(request) {
  // Quick connectivity check first
  const connectivity = await checkMlRuntimeConnectivity();
  
  if (!connectivity.reachable) {
    console.warn(`⚠️ Runtime not reachable: ${connectivity.reason}`);
    // Use fallback or show error
  }
  
  // Proceed with prediction if reachable
  const result = await callMlRuntime(request);
  return result;
}
```

### Health Dashboard Status

```javascript
const { checkMlRuntimeConnectivity, checkMlRuntimeHealth } = require('./mlRuntimeClient');

async function getRuntimeStatus() {
  const connectivity = await checkMlRuntimeConnectivity();
  const health = await checkMlRuntimeHealth();
  
  return {
    connectivity: connectivity.reachable ? 'ok' : 'error',
    connectivityReason: connectivity.reason,
    health: health ? 'healthy' : 'unhealthy',
    host: connectivity.host,
    port: connectivity.port
  };
}
```

### Configuration Debugging

```javascript
const {
  checkMlRuntimeConnectivity,
  ML_RUNTIME_HOST,
  ML_RUNTIME_PORT,
  ML_RUNTIME_ENABLED,
  ML_RUNTIME_URL
} = require('./mlRuntimeClient');

async function debugRuntime() {
  console.log('Configuration:');
  console.log(`  Host: ${ML_RUNTIME_HOST}`);
  console.log(`  Port: ${ML_RUNTIME_PORT}`);
  console.log(`  Enabled: ${ML_RUNTIME_ENABLED}`);
  console.log(`  URL: ${ML_RUNTIME_URL}`);
  
  const connectivity = await checkMlRuntimeConnectivity();
  console.log('Connectivity:');
  console.log(`  Reachable: ${connectivity.reachable}`);
  if (connectivity.reason) {
    console.log(`  Reason: ${connectivity.reason}`);
  }
}
```

---

## Response Fields Explained

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| reachable | boolean | Yes | Is runtime reachable? |
| host | string | Yes | Runtime host |
| port | string | Yes | Runtime port |
| reason | string | No | Why unreachable (only if reachable=false) |

### Reason Values

| Reason | Meaning |
|--------|---------|
| `ECONNREFUSED` | Connection refused (runtime not listening) |
| `ENOTFOUND` | DNS resolution failed |
| `timeout` | Request timeout (>5 seconds) |
| `connection_error` | Other network error |
| `http_[STATUS]` | HTTP error (e.g., http_500) |
| `runtime_disabled` | ML_RUNTIME_ENABLED=false |

---

## Timeout Behavior

```javascript
HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds

// If no response in 5 seconds:
checkMlRuntimeConnectivity() → {reachable: false, reason: "timeout"}
```

**Use Case:** Detect if runtime is too slow to respond.

---

## What's Included

✅ Simple reachability test  
✅ Basic error classification  
✅ Configuration awareness (enabled/disabled)  
✅ Host and port information  
✅ Logging of connectivity status  
✅ Fast timeout (5 seconds)  

---

## What's NOT Included (Out of Scope)

❌ Full diagnostics (full /health endpoint validation)  
❌ Detailed error messages  
❌ Performance metrics  
❌ Load testing  
❌ Kubernetes probes  
❌ Training diagnostics  

---

## Summary

**FÁZA 6.1D:** ✅ **COMPLETE**

Connectivity check added to Node/Firebase layer:

- ✅ Simple network reachability test
- ✅ Returns reachable/unreachable status
- ✅ Includes host, port, and reason
- ✅ Distinguishes network errors from disabled runtime
- ✅ No complex diagnostics
- ✅ Fast 5-second timeout
- ✅ Fully logged

Node/Firebase can now quickly check if Podman runtime is reachable.

---

**Implementation Location:**
- `functions/mlRuntimeClient.js` — checkMlRuntimeConnectivity() function

**Function Signature:**
```javascript
async function checkMlRuntimeConnectivity() {
  // Returns: {reachable: boolean, host: string, port: string, reason?: string}
}
```

**Differences from Health Check:**
- Health check: Validates full health contract (comprehensive)
- Connectivity check: Just tests network reachability (simple)

**Use Cases:**
- Quick startup checks
- Monitoring dashboards
- Pre-prediction reachability test
- Configuration debugging

**Status:** Complete and production-ready  
**Next:** FÁZA 6.2 (Docker Compose setup) or monitoring integration

