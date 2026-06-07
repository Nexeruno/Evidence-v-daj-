# FÁZE 5.5B: Runtime Readiness Check

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add simple readiness check for Python runtime

---

## Executive Summary

**FÁZA 5.5B Objective:** *"Přidej simple readiness check: valid request accepted, valid response returned"*

**Status:** ✅ **ACHIEVED**

Runtime readiness check now verifies:
- ✅ Valid requests are accepted
- ✅ Valid responses are returned
- ✅ Complete request/response cycle works

---

## What Was Implemented

### /readiness Endpoint

**Purpose:** Verify runtime can handle actual requests and return valid responses

**Tests Performed:**
1. Request validation — Can accept a valid request
2. Request parsing — Can parse and normalize input
3. Prediction generation — Can process and generate prediction
4. Response structure — Response contains all required fields

**Response:**
```json
{
  "status": "ready|not_ready",
  "reason": "all_checks_passed|request_validation_failed|processing_failed|invalid_response|unexpected_error",
  "message": "Human-readable status",
  "testsPerformed": ["request_validation", "request_parsing", "prediction_generation", "response_structure"],
  "timestamp": "2026-06-07T15:30:00.000Z"
}
```

---

## Ready vs Not Ready

### Status: "ready" ✅
```json
{
  "status": "ready",
  "reason": "all_checks_passed",
  "message": "Runtime accepts valid requests and returns valid responses",
  "testsPerformed": [
    "request_validation",
    "request_parsing",
    "prediction_generation",
    "response_structure"
  ]
}
```
**Meaning:** Runtime is fully operational and ready to handle requests

### Status: "not_ready" ⚠️
```json
{
  "status": "not_ready",
  "reason": "request_validation_failed",
  "message": "Cannot accept valid request: [error detail]"
}
```
**Possible reasons:**
- request_validation_failed — Cannot validate requests
- processing_failed — Cannot process valid requests
- invalid_response — Response structure incorrect
- unexpected_error — Unexpected error during checks

---

## Test Sequence

### Step 1: Request Validation
```
Input: Valid test request
  {
    uid: 'readiness-check',
    pipelineLevel: 'L1',
    modelVersion: '1.0',
    transactions: [3 valid transactions],
    income: 5000.0
  }

Process: RequestContract.validate()
Output: Pass/Fail
```

### Step 2: Request Parsing
```
Input: Valid request
Process: RequestParser.parse()
Output: Parsed and normalized data
```

### Step 3: Prediction Generation
```
Input: Parsed data
Process: calculate_baseline_prediction()
Output: Prediction with totalPredictedExpense
```

### Step 4: Response Validation
```
Input: Generated prediction
Check: Has 'totalPredictedExpense' field
Output: Pass/Fail
```

---

## Health vs Readiness

### /health (FÁZA 5.5A)
- **Checks:** Is runtime available? Are endpoints implemented?
- **Level:** Infrastructure readiness
- **Response:** available/unavailable, contract_ready/not_ready

### /readiness (FÁZA 5.5B)
- **Checks:** Can runtime handle requests? Does it return valid responses?
- **Level:** Application readiness
- **Response:** ready/not_ready with test details

**Combined:** Use both for complete runtime validation

---

## Use Cases

### 1. Kubernetes Readiness Probe
```yaml
readinessProbe:
  httpGet:
    path: /readiness
    port: 5000
  initialDelaySeconds: 10
  periodSeconds: 5
```
**Effect:** Don't send traffic until runtime is truly ready

### 2. Startup Verification
```
On app start:
  1. GET /health → check availability
  2. GET /readiness → check request handling
  3. IF both pass → start accepting requests
```

### 3. Deployment Validation
```
After deploying new version:
  1. Health check passes
  2. Readiness check passes
  3. Gradually shift traffic
```

### 4. Auto-Recovery
```
Periodic checks:
  IF readiness == "not_ready" THEN
    Log error
    Alert monitoring
    Consider restart
```

---

## Example Scenarios

### Scenario 1: Runtime Ready
```
GET /readiness
→ status: "ready"
→ reason: "all_checks_passed"
→ Action: Accept traffic
```

### Scenario 2: Runtime Available but Not Ready
```
GET /readiness
→ status: "not_ready"
→ reason: "processing_failed"
→ message: "Cannot process valid request: [error]"
→ Action: Do not accept traffic, investigate error
```

### Scenario 3: Request Validation Broken
```
GET /readiness
→ status: "not_ready"
→ reason: "request_validation_failed"
→ message: "Cannot accept valid request: [error]"
→ Action: Bug in validation layer, needs fix
```

### Scenario 4: Invalid Response Structure
```
GET /readiness
→ status: "not_ready"
→ reason: "invalid_response"
→ message: "Response missing required fields"
→ Action: Bug in prediction, needs fix
```

---

## Readiness vs Health Flow

```
App starts
  ↓
GET /health
  ↓ (if not healthy, stop here)
runtime is available + contract ready
  ↓
GET /readiness
  ↓ (if not ready, stop here)
runtime can handle requests
  ↓
Start accepting traffic
```

---

## Test Data

Readiness check uses minimal but complete test data:
```python
{
  'uid': 'readiness-check',
  'pipelineLevel': 'L1',
  'modelVersion': '1.0',
  'transactions': [
    {'category': 'food', 'amount': 100.0, 'date': '2026-01-05'},
    {'category': 'food', 'amount': 100.0, 'date': '2026-01-15'},
    {'category': 'food', 'amount': 100.0, 'date': '2026-02-05'},
  ],
  'income': 5000.0,
}
```

This is a valid request with:
- 3 transactions (enough for analysis)
- 1 category type (simple case)
- Valid values (all positive amounts, valid dates)
- Income constraint (for confidence calculation)

---

## Logging

**Readiness check logs:**
```
[INFO] Readiness check requested
[INFO] Readiness check: All checks passed - runtime is ready
```

**If checks fail:**
```
[WARN] Readiness check: Request validation failed - [error]
[WARN] Readiness check: Processing failed - [error]
[ERROR] Readiness check error: [unexpected error]
```

---

## Tests Performed

| Test | Purpose | Failure Reason |
|------|---------|----------------|
| request_validation | Can accept valid input | request_validation_failed |
| request_parsing | Can parse and normalize | processing_failed |
| prediction_generation | Can compute prediction | processing_failed |
| response_structure | Response is valid | invalid_response |

---

## Monitoring Integration

### Option 1: Health Only
```
GET /health
→ Basic runtime availability
```

### Option 2: Health + Readiness
```
GET /health
→ Infrastructure ready?

GET /readiness
→ Application ready?

Both OK → Accept traffic
```

### Option 3: Continuous Monitoring
```
Every 5 seconds:
  GET /readiness
  IF status != "ready":
    Alert + log reason
```

---

## What This Enables

✅ **Application Readiness** — Know if runtime can handle requests  
✅ **Deployment Safety** — Verify version is ready before traffic shift  
✅ **Auto-Recovery** — Detect and restart failed instances  
✅ **Progressive Deployment** — Shift traffic only when ready  
✅ **Operational Insights** — Know exactly why runtime isn't ready  

---

## What This Is NOT

❌ **Load Testing** — Just basic functionality, not performance  
❌ **Detailed Diagnostics** — Just pass/fail, not detailed debugging  
❌ **Continuous Monitoring** — Just point-in-time check  
❌ **Auto-Healing** — Just reporting, not fixing  

---

## Files Modified

**Backend:**
- `ml-runtime/app.py`
  - Added /readiness endpoint
  - Performs 4-step readiness test
  - Returns ready/not_ready with reason

---

## Summary

**FÁZA 5.5B:** ✅ **COMPLETE**

Runtime readiness check implemented:

- ✅ /readiness endpoint
- ✅ Valid request acceptance test
- ✅ Valid response return test
- ✅ 4-step verification process
- ✅ Detailed failure reasons
- ✅ Ready/not_ready status

Simple but comprehensive readiness checking.

---

**Implementation Location:**
- `ml-runtime/app.py` (/readiness endpoint)

**Status:** Complete and production-ready  
**Deployment:** Now with runtime readiness validation

