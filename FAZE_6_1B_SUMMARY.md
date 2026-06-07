# FÁZA 6.1B: Shrnutí — Node/Firebase Fallback Behavior

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07

---

## Co Bylo Uděláno

### Fallback Behavior pro Unavailable Runtime

```
Node/Firebase (Request)
        ↓
mlRuntimeClient.callMlRuntime()
        ↓ (Runtime unavailable?)
Fallback Handler
        ↓
Return {status: 'fallback', reason: 'runtime_unavailable'}
```

---

## Implementation Details

### Modified File

**`functions/mlRuntimeClient.js`** (lines 185-214)

```javascript
// FÁZA 6.1B: Return fallback response if allowed
if (allowFallback) {
  return {
    status: 'fallback',
    uid: uid,
    reason: 'runtime_unavailable',
    message: 'ML Runtime unavailable - using fallback response',
    fallback: { /* ... */ }
  };
}
```

### Options Parameter

```javascript
async function callMlRuntime(requestData, options = {}) {
  const allowFallback = options.allowFallback !== false; // Default: true
}
```

---

## Fallback Response

### Example: Runtime Down

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

## Usage

### With Fallback (Default)

```javascript
const result = await callMlRuntime(request);

if (result.status === 'fallback') {
  // Runtime is down, show degraded UI
  console.log('Service unavailable:', result.message);
}
```

### Without Fallback (Throw)

```javascript
const result = await callMlRuntime(request, {
  allowFallback: false
});
```

---

## Logging

### When Fallback Triggers

```
[ML] ❌ UNAVAILABLE | reason=ECONNREFUSED, elapsed=45ms | uid=user-123
[ML] ⚠️ FALLBACK | uid=user-123, returning fallback status
```

---

## Error Types Detected

- ECONNREFUSED → runtime_unavailable
- ENOTFOUND → runtime_unavailable
- Connection refused → runtime_unavailable
- getaddrinfo → runtime_unavailable

---

## Test Scenarios

### Scenario 1: Runtime Available

```
Request → Python runtime running
→ Status: "success"
→ Normal prediction returned
```

### Scenario 2: Runtime Down (With Fallback)

```
Request → Python runtime ECONNREFUSED
→ Status: "fallback"
→ Safe null values returned
→ UI shows degraded state
```

### Scenario 3: Runtime Down (No Fallback)

```
Request → Python runtime ECONNREFUSED
→ allowFallback: false
→ Error thrown to caller
```

---

## What's Included

✅ Fallback response generation  
✅ Graceful degradation  
✅ UID preservation  
✅ Logging with reason  
✅ Optional behavior (can throw)  
✅ Safe default values  

---

## What's NOT Included

❌ Retry logic  
❌ Circuit breakers  
❌ Health monitoring  
❌ Caching fallback responses  
❌ Auto-recovery  

---

## Summary

**FÁZA 6.1B: ✅ COMPLETE**

Fallback behavior added:

- ✅ Detects unavailable runtime (ECONNREFUSED, ENOTFOUND, etc.)
- ✅ Returns readable fallback response instead of throwing
- ✅ Maintains data structure for UI compatibility
- ✅ Includes clear status and reason
- ✅ Optional (can throw if needed)
- ✅ Fully logged with UID tracing
- ✅ No complex retry logic (as requested)

Node/Firebase layer now handles unavailable runtime **gracefully**.

---

**Implementation:** functions/mlRuntimeClient.js  
**Configuration:** Default: `allowFallback: true`  
**Status:** Complete and production-ready  
**Next:** FÁZA 6.2 (Docker Compose) or monitoring integration

