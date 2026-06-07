# FÁZA 6.1B: Node/Firebase Fallback Behavior

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add fallback behavior when Podman Python runtime is unavailable

---

## Executive Summary

**FÁZA 6.1B Objective:** *"Přidej fallback chování: pokud Podman runtime není dostupný, vrať čitelnou chybu nebo fallback status"*

**Status:** ✅ **ACHIEVED**

Node/Firebase layer now handles unavailable runtime gracefully:
- ✅ Detects when runtime is unavailable
- ✅ Returns readable fallback response
- ✅ Maintains data structure for UI compatibility
- ✅ Includes clear status and reason
- ✅ Optional (can throw if needed)

---

## Fallback Behavior

### When Runtime Is Unavailable

**Scenario:** Python runtime at http://127.0.0.1:5000 is down

**Before 6.1B:**
```
Error thrown to caller
Caller must handle error
UI breaks or shows error
```

**After 6.1B:**
```
Fallback response returned
status: "fallback"
reason: "runtime_unavailable"
UI shows degraded status gracefully
```

---

## Fallback Response Format

### Success Response (Normal)

```json
{
  "status": "success",
  "uid": "user-123",
  "result": {
    "predictedExpense": 360.0,
    "confidence": 0.3
  }
}
```

### Fallback Response (Runtime Down)

```json
{
  "status": "fallback",
  "uid": "user-123",
  "reason": "runtime_unavailable",
  "message": "ML Runtime unavailable - using fallback response",
  "fallback": {
    "predictedExpense": null,
    "confidence": 0.0,
    "confidenceFactors": {
      "dataFrequency": 0,
      "transactionCount": 0,
      "expenseRatio": 0,
      "incomeConstraint": 0
    }
  },
  "debugMetadata": {
    "processingTimeMs": 45,
    "fallbackReason": "runtime_not_available",
    "timestamp": "2026-06-07T20:58:05.000Z"
  }
}
```

---

## Unavailable Runtime Detection

### Error Types That Trigger Fallback

```javascript
ECONNREFUSED     // Connection refused
ENOTFOUND        // DNS resolution failed
getaddrinfo      // Address resolution error
Connection refused // Explicit connection error
```

**Logs:**
```
[ML] ❌ UNAVAILABLE | reason=ECONNREFUSED, elapsed=45ms | uid=user-123
[ML] ⚠️ FALLBACK | uid=user-123, returning fallback status
```

---

## Usage in Node/Firebase

### Option 1: With Fallback (Default)

```javascript
const { callMlRuntime } = require('./mlRuntimeClient');

try {
  // Returns fallback if runtime unavailable
  const result = await callMlRuntime(request);
  
  if (result.status === 'fallback') {
    // Runtime is down, use fallback
    console.log('Using fallback:', result.message);
    // UI can show "Unavailable - try again later"
  } else if (result.status === 'success') {
    // Normal prediction
    console.log('Prediction:', result.result.predictedExpense);
  }
} catch (error) {
  // Only thrown for non-availability errors
  console.error('Unexpected error:', error);
}
```

### Option 2: Without Fallback (Throw)

```javascript
const result = await callMlRuntime(request, { allowFallback: false });

// Throws error if runtime unavailable
// Use this if you want to handle it differently
```

---

## Fallback Response Fields

### Top-Level

| Field | Type | Meaning |
|-------|------|---------|
| status | string | "fallback" (instead of "success") |
| uid | string | Request UID for tracking |
| reason | string | "runtime_unavailable" |
| message | string | Human-readable explanation |

### Fallback Object

| Field | Type | Value | Meaning |
|-------|------|-------|---------|
| predictedExpense | number | null | No prediction available |
| confidence | number | 0.0 | No confidence score |
| confidenceFactors | object | all 0 | All factors zero |

### Debug Metadata

| Field | Type | Value | Meaning |
|-------|------|-------|---------|
| processingTimeMs | number | elapsed | Time until failure detected |
| fallbackReason | string | "runtime_not_available" | Why fallback used |
| timestamp | string | ISO-8601 | When fallback occurred |

---

## UI Integration

### Detect Fallback Status

```javascript
if (result.status === 'fallback') {
  // Show degraded UI
  return (
    <div className="degraded-state">
      <p>{result.message}</p>
      <p>Status: {result.reason}</p>
      <button onClick={retryPrediction}>Try Again</button>
    </div>
  );
}
```

### Display Messages

```
Normal: "Prediction: $360/month"
Fallback: "Service unavailable - try again later"
Fallback: "Prediction service temporarily down"
```

---

## Logging

### When Fallback Triggers

```
[ML] ❌ UNAVAILABLE | reason=ECONNREFUSED, elapsed=45ms | uid=user-123
[ML] ⚠️ FALLBACK | uid=user-123, returning fallback status
```

### Trace in Logs

```
uid=user-123
├─ Request validated ✓
├─ Runtime unavailable ✗
├─ Fallback returned ✓
└─ Time: 45ms
```

---

## Test Scenarios

### Scenario 1: Runtime Available

```
Request → Python runtime running
→ Normal response with prediction
→ status: "success"
```

### Scenario 2: Runtime Down

```
Request → Python runtime not responding (ECONNREFUSED)
→ Fallback response returned
→ status: "fallback"
→ Message: "ML Runtime unavailable"
```

### Scenario 3: Runtime Timeout

```
Request → Python runtime doesn't respond in 30 seconds
→ Error thrown (not caught by availability check)
→ Can be handled separately or return fallback
```

---

## Fallback Guarantees

✅ **UID Preserved** — Request UID always included in response  
✅ **Readable Message** — Clear explanation of what happened  
✅ **Structure Maintained** — Same top-level fields as normal response  
✅ **Safe Defaults** — null predictions, 0 confidence  
✅ **Logging** — All fallbacks logged with reason  
✅ **Traceable** — Complete audit trail via UID  

---

## What's NOT Included (Out of Scope)

❌ **Retry logic** — Just fallback, no automatic retries  
❌ **Health monitoring** — Just detects on-demand  
❌ **Circuit breakers** — No state tracking  
❌ **Fallback caching** — Returns new fallback each time  
❌ **Service mesh** — Just HTTP-level detection  
❌ **Orchestration** — Works with manual restart  

---

## Configuration

### Fallback Control

```javascript
// Option 1: Use fallback (default)
const result = await callMlRuntime(request);

// Option 2: Throw on unavailable
const result = await callMlRuntime(request, {
  allowFallback: false  // Will throw instead
});
```

### Runtime Configuration

```javascript
// Default
ML_RUNTIME_URL = 'http://127.0.0.1:5000'

// Customizable
export ML_RUNTIME_URL=http://ml-runtime:5000
```

---

## Implementation Details

### Detection Logic

```javascript
if (
  error.message.includes('ECONNREFUSED') ||
  error.message.includes('Connection refused') ||
  error.message.includes('ENOTFOUND') ||
  error.message.includes('getaddrinfo')
) {
  // Runtime unavailable
  if (allowFallback) {
    return fallbackResponse;
  }
  throw error;
}
```

### Fallback Response Generation

```javascript
return {
  status: 'fallback',
  uid: uid,
  reason: 'runtime_unavailable',
  message: 'ML Runtime unavailable - using fallback response',
  fallback: {
    predictedExpense: null,
    confidence: 0.0,
    confidenceFactors: { /* all zeros */ }
  },
  debugMetadata: {
    processingTimeMs: elapsedMs,
    fallbackReason: 'runtime_not_available',
    timestamp: new Date().toISOString()
  }
};
```

---

## Summary

**FÁZA 6.1B:** ✅ **COMPLETE**

Fallback behavior added to Node/Firebase layer:

- ✅ Detects unavailable runtime
- ✅ Returns readable fallback response
- ✅ Maintains UI compatibility
- ✅ Includes clear status and reason
- ✅ Optional (can throw if needed)
- ✅ Fully logged with UID tracing
- ✅ No complex retry logic

**Status:** Simple, reliable fallback for degraded runtime.

---

**Implementation Location:**
- `functions/mlRuntimeClient.js` — callMlRuntime() with fallback

**Configuration:**
- Default: `allowFallback: true`
- Override: `allowFallback: false` to throw

**Fallback Status:** Complete and production-ready  
**Next:** FÁZA 6.2 (Docker Compose) or monitoring integration

