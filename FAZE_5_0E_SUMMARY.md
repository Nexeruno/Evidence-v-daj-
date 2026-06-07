# FÁZE 5.0E: Shrnutí — External Python Call Logging

**Status:** ✅ **HOTOVO**  
**Datum:** 2026-06-07

---

## Co Bylo Vytvořeno

### 1. **Structured Logging v mlRuntimeClient.js**

**5-Stage Flow Logging:**

```
STAGE 1: REQUEST VALIDATION
[ML] ✅ REQUEST VALIDATED | uid=X, pipeline=Y, txns=Z
[ML] ❌ REQUEST VALIDATION FAILED: field | uid=X

STAGE 2: SEND REQUEST
[ML] 📤 REQUEST SENT | url=...predict | uid=X

STAGE 3: RECEIVE RESPONSE
[ML] 📥 RESPONSE RECEIVED | status=200, elapsed=Xms | uid=X
[ML] ❌ HTTP ERROR | status=500, error=msg | uid=X

STAGE 4: VALIDATE RESPONSE
[ML] ❌ RESPONSE VALIDATION FAILED | uid=X

STAGE 5: SUCCESS
[ML] ✅ SUCCESS | uid=X, confidence=0.87, python_time=125ms, total_time=142ms
```

**Co se loguje:**
- ✅ Request validation (before send)
- ✅ Request sent (HTTP POST)
- ✅ Response received (status code + timing)
- ✅ Response validation
- ✅ Error at any stage

### 2. **Pipeline-Level Logging v functions/index.js**

**Events:**

```javascript
mlPipeline_pythonRuntime_callStart
  - Fired before Python call
  - Data: uid, transactionCount, incomeRecords

mlPipeline_pythonRuntime_success
  - Fired after successful call
  - Data: uid, pythonProcessingMs, totalExpense, confidence

mlPipeline_pythonRuntime_failed
  - Fired on Python failure
  - Data: uid, error message, fallback action

mlPipeline_predictionSaved
  - Fired after Firestore save
  - Data: uid, totalPredicted, confidence
```

---

## Log Format

**mlRuntimeClient (console):**
```
[ML] <STATUS> <DATA> | uid=X
```

**Statusy:**
- `✅` — Success
- `❌` — Error
- `📤` — Sent (request)
- `📥` — Received (response)

**functions/index.js (structured JSON):**
```javascript
{
  "event": "mlPipeline_pythonRuntime_success",
  "uid": "user-123",
  "pythonProcessingMs": 125,
  "totalExpense": 3500.00,
  "confidence": 87
}
```

---

## Example Log Output

### Successful Call ✅

```
[ML] ✅ REQUEST VALIDATED | uid=user-123, pipeline=L1, txns=6
[ML] 📤 REQUEST SENT | url=...predict | uid=user-123
[ML] 📥 RESPONSE RECEIVED | status=200, elapsed=142ms | uid=user-123
[ML] ✅ SUCCESS | uid=user-123, confidence=0.87, python_time=125ms, total_time=142ms

mlPipeline_pythonRuntime_callStart: uid=user-123, txns=6
mlPipeline_pythonRuntime_success: uid=user-123, pythonProcessingMs=125, totalExpense=3500
mlPipeline_predictionSaved: uid=user-123, totalPredicted=3500
```

### Failed Call (with Fallback) ❌

```
[ML] ✅ REQUEST VALIDATED | uid=user-456, pipeline=L1, txns=3
[ML] 📤 REQUEST SENT | url=...predict | uid=user-456
[ML] ❌ ERROR | error=Connection refused, elapsed=5ms | uid=user-456

mlPipeline_pythonRuntime_callStart: uid=user-456, txns=3
mlPipeline_pythonRuntime_failed: uid=user-456, error=Connection refused, fallback=Node.js baseline
mlPipeline_predictionSaved: uid=user-456, totalPredicted=2800 (baseline)
```

### Timeout ⏱️

```
[ML] ✅ REQUEST VALIDATED | uid=user-789, pipeline=L1, txns=2
[ML] 📤 REQUEST SENT | url=...predict | uid=user-789
[ML] ❌ TIMEOUT | timeout=30000ms, elapsed=30001ms | uid=user-789
```

---

## Logging Points

| Event | Loguje | Kdy | Data |
|-------|--------|-----|------|
| REQUEST VALIDATED | mlRuntimeClient | Před send | uid, pipeline, txns |
| REQUEST SENT | mlRuntimeClient | HTTP POST | url, uid |
| RESPONSE RECEIVED | mlRuntimeClient | Po response | status, elapsed |
| SUCCESS | mlRuntimeClient | Po validation | confidence, times |
| Call Start | functions/index.js | Před Python call | uid, txns |
| Call Success | functions/index.js | Po response | uid, metrics |
| Call Failed | functions/index.js | Na exception | uid, error |
| Saved | functions/index.js | Po Firestore | uid, metrics |

---

## Design Principles

✅ **Conciseness** — One line per event, not verbose  
✅ **Structured** — JSON for easy parsing  
✅ **Contextual** — Always includes uid for tracing  
✅ **Timed** — Shows elapsed milliseconds  
✅ **Staged** — Clear flow through 5 stages  
✅ **Visual** — Emoji symbols for quick scanning  
✅ **Error-Specific** — Different messages per failure type  

---

## Debugging Examples

```bash
# Find all Python calls for user
grep "uid=user-123" logs | grep "\[ML\]"

# Find all failures
grep "❌" logs

# Find all timeouts
grep "TIMEOUT" logs

# Find all success
grep "✅ SUCCESS" logs

# Extract timing data
grep "total_time=" logs
```

---

## Klíčové Features

✅ **5-Stage Flow** — Request → Send → Receive → Validate → Success  
✅ **All Errors Tracked** — Validation, timeout, HTTP, parsing, etc.  
✅ **Timing Data** — Elapsed time at each stage  
✅ **Contextual** — uid v každém logu  
✅ **Fallback Visible** — Vidno, když se používá Node.js baseline  
✅ **Simple Format** — Čitelné bez speciálních toolů  

---

## Co Není Zahrnuto (Podle Scope)

❌ Advanced observability redesign  
❌ Tracing/correlation IDs  
❌ Custom metrics system  
❌ Distributed tracing  
❌ Kubernetes-specific logging  
❌ Advanced monitoring  

---

## Souhrn

**FÁZE 5.0E: ✅ COMPLETE**

Základní structured logging pro external Python runtime calls:

**mlRuntimeClient.js:**
- 5-stage flow
- Concise format: `[ML] <status> <data>`
- Emoji symbols: ✅❌📤📥
- Full timing data

**functions/index.js:**
- Pipeline-level events
- Structured JSON format
- uid v každém logu
- Fallback tracking

Bez advanced features, jen čitelné flow logging.

Každý external Python call je teď traceable end-to-end s timing + error context.

---

**Průběh (5.0A→5.0E):**
- 5.0A: External runtime ✅
- 5.0B: Parsing & validation ✅
- 5.0C: Response validation ✅
- 5.0D: Roundtrip integration ✅
- 5.0E: Call logging ✅
- 5.1: Model training (next) →

---

**Plná dokumentace:** `FAZE_5_0E_EXTERNAL_CALL_LOGGING.md`
