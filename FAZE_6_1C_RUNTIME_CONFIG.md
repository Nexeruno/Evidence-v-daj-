# FÁZA 6.1C: ML Runtime Configuration

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add simple runtime configuration (host, port, enable flag)

---

## Executive Summary

**FÁZA 6.1C Objective:** *"Přidej simple runtime config místo hardcoded hodnot"*

**Status:** ✅ **ACHIEVED**

ML Runtime now configurable via environment variables:
- ✅ Runtime host (default: 127.0.0.1)
- ✅ Runtime port (default: 5000)
- ✅ Runtime enabled flag (default: true)
- ✅ Backward compatible with existing ML_RUNTIME_URL

---

## Configuration

### Environment Variables

```bash
# Runtime location
ML_RUNTIME_HOST=127.0.0.1     # Default: 127.0.0.1
ML_RUNTIME_PORT=5000          # Default: 5000

# Enable/disable runtime
ML_RUNTIME_ENABLED=true       # Default: true (any value except "false")

# (Optional) Override entire URL
ML_RUNTIME_URL=http://ml-runtime:5000  # Takes precedence if set
```

---

## Configuration Examples

### Local Development (Default)

No environment variables needed:
```bash
npm run serve
# Uses: http://127.0.0.1:5000
```

### Docker Compose (Internal Network)

```bash
export ML_RUNTIME_HOST=ml-runtime
export ML_RUNTIME_PORT=5000
npm run serve
# Uses: http://ml-runtime:5000
```

### Custom Host and Port

```bash
export ML_RUNTIME_HOST=ml.example.com
export ML_RUNTIME_PORT=8080
npm run serve
# Uses: http://ml.example.com:8080
```

### Disable Runtime (Fallback Only)

```bash
export ML_RUNTIME_ENABLED=false
npm run serve
# Runtime calls return fallback response
# reason: "runtime_disabled"
```

### Override URL Directly

```bash
export ML_RUNTIME_URL=http://custom-runtime:9000
npm run serve
# Uses: http://custom-runtime:9000
# Takes precedence over HOST/PORT
```

---

## Runtime Enabled Flag

### What Happens When Disabled

If `ML_RUNTIME_ENABLED=false`:

1. **checkMlRuntimeHealth()** returns `false` immediately
   ```
   ⚠️ ML Runtime disabled (ML_RUNTIME_ENABLED=false)
   ```

2. **callMlRuntime()** returns fallback response
   ```json
   {
     "status": "fallback",
     "uid": "user-123",
     "reason": "runtime_disabled",
     "message": "ML Runtime is disabled",
     "fallback": {
       "predictedExpense": null,
       "confidence": 0.0,
       "confidenceFactors": { /* all zeros */ }
     }
   }
   ```

### Use Cases

✅ **Testing** — Disable runtime to test fallback paths  
✅ **Maintenance** — Disable runtime during upgrades  
✅ **Feature Flags** — Enable/disable ML predictions  
✅ **Debugging** — Compare normal vs. fallback behavior  

---

## Logging

### Configuration Checks

```
✅ Configuration loaded from environment
⚠️ ML Runtime disabled (ML_RUNTIME_ENABLED=false)
```

### When Runtime Disabled

```
[ML] ⚠️ DISABLED | ML_RUNTIME_ENABLED=false | uid=user-123
```

### When Runtime Enabled

```
[ML] ✅ REQUEST VALIDATED | uid=user-123, pipeline=L1, txns=3
[ML] 📤 REQUEST SENT | url=http://127.0.0.1:5000/predict | uid=user-123
[ML] 📥 RESPONSE RECEIVED | status=200, elapsed=2ms
[ML] ✅ SUCCESS | uid=user-123
```

---

## Configuration Priority

When deciding what URL to use:

```
1. ML_RUNTIME_URL (if set) — Explicit URL takes precedence
   └─ Example: ML_RUNTIME_URL=http://custom:9000

2. ML_RUNTIME_HOST + ML_RUNTIME_PORT (if ML_RUNTIME_URL not set)
   └─ Example: ML_RUNTIME_HOST=ml-runtime, ML_RUNTIME_PORT=5000
      Result: http://ml-runtime:5000

3. Defaults
   └─ ML_RUNTIME_HOST=127.0.0.1
   └─ ML_RUNTIME_PORT=5000
   └─ Result: http://127.0.0.1:5000
```

---

## Exporting Configuration

Configuration values are exported from `mlRuntimeClient.js`:

```javascript
const {
  ML_RUNTIME_URL,      // Full URL (computed)
  ML_RUNTIME_HOST,     // Just the host
  ML_RUNTIME_PORT,     // Just the port
  ML_RUNTIME_ENABLED   // Enable/disable flag
} = require('./mlRuntimeClient');

// Check current configuration
console.log(`Runtime: ${ML_RUNTIME_URL}`);
console.log(`Enabled: ${ML_RUNTIME_ENABLED}`);
```

---

## Docker Compose Example

```yaml
services:
  ml-runtime:
    image: ml-runtime:latest
    ports:
      - "5000:5000"
    networks:
      - ml-network

  node-app:
    image: node-app:latest
    environment:
      ML_RUNTIME_HOST: ml-runtime
      ML_RUNTIME_PORT: 5000
      ML_RUNTIME_ENABLED: "true"
    depends_on:
      - ml-runtime
    networks:
      - ml-network

networks:
  ml-network:
```

---

## Firebase Cloud Functions Example

```javascript
// functions/index.js

const { callMlRuntime, ML_RUNTIME_URL } = require('./mlRuntimeClient');

exports.predictExpense = functions.https.onCall(async (data, context) => {
  console.log(`Using ML Runtime at: ${ML_RUNTIME_URL}`);
  
  const result = await callMlRuntime({
    uid: context.auth.uid,
    pipelineLevel: 'L1',
    modelVersion: '1.0',
    transactions: data.transactions,
    income: data.income
  });
  
  return result;
});
```

**Configuration via Firebase Console:**
```
Environment variable: ML_RUNTIME_HOST = ml-runtime
Environment variable: ML_RUNTIME_PORT = 5000
Environment variable: ML_RUNTIME_ENABLED = true
```

Or `.env.local`:
```
ML_RUNTIME_HOST=ml-runtime
ML_RUNTIME_PORT=5000
ML_RUNTIME_ENABLED=true
```

---

## Testing Configuration

### Test 1: Default Configuration

```javascript
// No environment variables set
const { ML_RUNTIME_URL, ML_RUNTIME_ENABLED } = require('./mlRuntimeClient');

console.assert(ML_RUNTIME_URL === 'http://127.0.0.1:5000');
console.assert(ML_RUNTIME_ENABLED === true);
console.log('✅ Test 1: Default configuration works');
```

### Test 2: Custom Host and Port

```javascript
// ML_RUNTIME_HOST=localhost, ML_RUNTIME_PORT=8080
const { ML_RUNTIME_URL } = require('./mlRuntimeClient');

console.assert(ML_RUNTIME_URL === 'http://localhost:8080');
console.log('✅ Test 2: Custom host/port works');
```

### Test 3: Runtime Disabled

```javascript
// ML_RUNTIME_ENABLED=false
const result = await callMlRuntime({
  uid: 'test-123',
  pipelineLevel: 'L1',
  modelVersion: '1.0',
  transactions: [],
  income: 5000
});

console.assert(result.status === 'fallback');
console.assert(result.reason === 'runtime_disabled');
console.log('✅ Test 3: Disabled runtime returns fallback');
```

### Test 4: URL Override

```javascript
// ML_RUNTIME_URL=http://custom:9000
// (ML_RUNTIME_HOST and ML_RUNTIME_PORT ignored)
const { ML_RUNTIME_URL } = require('./mlRuntimeClient');

console.assert(ML_RUNTIME_URL === 'http://custom:9000');
console.log('✅ Test 4: URL override works');
```

---

## Summary

**FÁZA 6.1C:** ✅ **COMPLETE**

Configuration added to ML Runtime client:

- ✅ Runtime host configurable (ML_RUNTIME_HOST)
- ✅ Runtime port configurable (ML_RUNTIME_PORT)
- ✅ Runtime enabled flag (ML_RUNTIME_ENABLED)
- ✅ Backward compatible with ML_RUNTIME_URL
- ✅ Simple defaults (127.0.0.1:5000)
- ✅ Priority: URL > HOST+PORT > defaults
- ✅ Fully logged when enabled/disabled

**Status:** Simple, production-ready configuration.

---

## What's NOT Included (Out of Scope)

❌ Secret management (API keys, TLS certs)  
❌ Kubernetes configuration  
❌ Training configuration  
❌ Large config file refactor  
❌ Config validation schema  
❌ Environment file encryption  

---

**Implementation Location:**
- `functions/mlRuntimeClient.js` — Configuration and runtime checks

**Environment Variables:**
- `ML_RUNTIME_HOST` (default: 127.0.0.1)
- `ML_RUNTIME_PORT` (default: 5000)
- `ML_RUNTIME_ENABLED` (default: true)
- `ML_RUNTIME_URL` (optional override)

**Configuration Status:** Complete and production-ready  
**Next:** FÁZA 6.2 (Docker Compose setup) or monitoring

