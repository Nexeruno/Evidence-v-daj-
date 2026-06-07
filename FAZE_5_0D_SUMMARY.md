# FÁZE 5.0D: Shrnutí — Node-Python Roundtrip Integration

**Status:** ✅ **HOTOVO**  
**Datum:** 2026-06-07

---

## Co Bylo Vytvořeno

### 1. **mlRuntimeClient.js** — HTTP Bridge

```javascript
✅ callMlRuntime(requestData)
   - Calls Python /predict endpoint
   - Validates response
   - Handles errors & timeouts (30 sec)
   
✅ checkMlRuntimeHealth()
   - Pings /health endpoint
   - Returns healthy/unhealthy
   
✅ getMlRuntimeStatus()
   - Gets runtime capabilities
```

**Configuration:**
- URL: `http://127.0.0.1:5000`
- Timeout: 30 seconds
- Error handling: specific messages

### 2. **Integration v functions/index.js**

**Modifikované funkce:**

1. **runMlPipeline()** (scheduled, every 3 days)
2. **testMlPipeline()** (manual HTTP trigger)

**Co dělají:**
```
1. Načti transakce & příjmy z Firestore
2. Transformuj na Python format
3. Zavolej mlRuntimeClient.callMlRuntime()
4. Receive response
5. Transformuj response na Node format
6. Ulož do Firestore mlPredictions
7. Fallback na Node baseline pokud Python fails
```

**Data Transformation — Node → Python:**
```javascript
Node:   {kategorie: "food", castka: 50, datum: "2026-06-01"}
   ↓ Transform
Python: {category: "food", amount: 50, date: "2026-06-01"}
```

**Data Transformation — Python → Node:**
```python
Python: {
  "totalPredictedExpense": 3500.00,
  "confidence": 0.87,
  "categories": {"food": 2100, "transport": 1400}
}
   ↓ Transform
Node:   {
  "totalPredictedExpense": 3500,
  "confidenceScore": 87,
  "categories": {"food": 2100, "transport": 1400}
}
```

### 3. **Test Suite** — test_roundtrip.py

**5 Roundtrip Tests:**

```
✅ TEST 1: Valid Request (6 transactions, 3 months)
   → Returns 200 OK with valid response
   
✅ TEST 2: Empty Transactions
   → Returns 200 OK with zero prediction
   
✅ TEST 3: Invalid Request (missing field)
   → Returns 400 Bad Request with error
   
✅ TEST 4: Invalid Enum (bad pipelineLevel)
   → Returns 400 with specific error message
   
✅ TEST 5: Health Check
   → Verifies Python runtime accessible
```

---

## Complete Data Flow

```
┌──────────────────────────────────┐
│ NODE/FIREBASE LAYER              │
│ Load transactions from Firestore  │
│ Transform to Python format        │
│ Call mlRuntimeClient.callMlRuntime()
└──────────────────────────────────┘
           ↓↓↓ HTTP POST
         
┌──────────────────────────────────┐
│ PYTHON RUNTIME (External)        │
│ 1. Parse JSON                    │
│ 2. Validate request              │
│ 3. Parse & normalize             │
│ 4. Calculate prediction          │
│ 5. Validate response             │
│ 6. Return JSON                   │
└──────────────────────────────────┘
           ↑↑↑ HTTP 200

┌──────────────────────────────────┐
│ NODE/FIREBASE LAYER              │
│ Receive response                 │
│ Transform to Node format         │
│ Save to Firestore mlPredictions  │
│ Log success/fallback             │
└──────────────────────────────────┘
```

---

## Testing the Roundtrip

### Start Python Runtime:
```bash
cd ml-runtime
python app.py
```

### Run Tests:
```bash
cd ml-runtime
python test_roundtrip.py
```

### Expected Output:
```
✅ PASS — Test 1: Valid Request
✅ PASS — Test 2: Empty Transactions
✅ PASS — Test 3: Invalid Request
✅ PASS — Test 4: Invalid Enum
✅ PASS — Test 5: Health Check

Result: 5/5 tests passed

🎉 ALL TESTS PASSED - Node -> Python -> Node roundtrip is working!
```

---

## Step-by-Step Roundtrip

### Step 1: Node Prepares Request
```javascript
const runtimeRequest = {
  uid: "user-123",
  pipelineLevel: "L1",
  modelVersion: "1.0",
  transactions: [
    {category: "food", amount: 50, date: "2026-06-01"},
    ...
  ],
  income: 2000.0,
  debugMode: false
};
```

### Step 2: Node Calls Python
```javascript
const runtimeResponse = await mlRuntimeClient.callMlRuntime(runtimeRequest);
// HTTP POST http://127.0.0.1:5000/predict
```

### Step 3: Python Processes
```python
# Validate request contract
RequestContract.validate(data)

# Parse & normalize
parsed = RequestParser.parse(data)

# Calculate prediction
prediction = calculate_baseline_prediction(...)

# Build response
response = ResponseContract.build(data, [prediction])

# Validate response
ResponseContract.validate(response)

# Return JSON
return jsonify(response), 200
```

### Step 4: Node Receives & Saves
```javascript
const pythonPrediction = runtimeResponse.predictions[0];

const prediction = {
  totalPredictedExpense: pythonPrediction.totalPredictedExpense,
  categories: pythonPrediction.categories,
  confidenceScore: Math.round(pythonPrediction.confidence * 100),
  // ... more fields
};

await savePredictionResults(user.uid, prediction);
```

---

## Error Handling

### If Python Fails:
```javascript
try {
  const runtimeResponse = await mlRuntimeClient.callMlRuntime(runtimeRequest);
  // Process response
  
} catch (runtimeErr) {
  // Fallback to Node baseline
  logger.warn({
    event: 'mlPipeline_pythonRuntimeFailed',
    uid: user.uid,
    error: runtimeErr.message
  });
  prediction = generateBaselinePrediction(transactions, income);
}
```

**Fallback ensures:**
- ✅ Predictions always created (Python or Node)
- ✅ Users not affected by Python downtime
- ✅ Error logged for debugging

---

## Klíčové Guarantees

✅ **Request Validation** — Python validuje všechno  
✅ **Response Validation** — Dvě validace (Python + Node)  
✅ **Timeout Protection** — 30 sekund na prediction  
✅ **Fallback** — Node baseline pokud Python fails  
✅ **Logging** — Audit trail všech volání  
✅ **Contract Shape** — Guaranteed response structure  
✅ **Data Transformation** — Správné mapování oběma směry  

---

## Co Není Zahrnuto (Podle Scope)

❌ Podman/Docker containerization  
❌ Kubernetes orchestration  
❌ Model training  
❌ Nové UI prvky  

---

## Files

| File | Status |
|------|--------|
| `functions/mlRuntimeClient.js` | ✅ HTTP bridge |
| `functions/index.js` | ✅ Integration (modified) |
| `ml-runtime/app.py` | ✅ Full pipeline |
| `ml-runtime/test_roundtrip.py` | ✅ 5 roundtrip tests |

---

## Roundtrip Metrics

| Metric | Value |
|--------|-------|
| HTTP Requests per run | 1 per user |
| Timeout | 30 seconds |
| Response validations | 12+ per response |
| Fallback available | Yes |
| Logging coverage | All steps |

---

## Souhrn

**FÁZE 5.0D: ✅ COMPLETE**

Úplný Node → external Python → Node roundtrip funguje:

1. ✅ Node načte data
2. ✅ Node transformuje na Python format
3. ✅ Node zavolá Python /predict
4. ✅ Python validuje request
5. ✅ Python parsuje & normalizuje
6. ✅ Python počítá prediction
7. ✅ Python validuje response
8. ✅ Python vrátí JSON
9. ✅ Node receive response
10. ✅ Node transformuje na Node format
11. ✅ Node ulož do Firestore
12. ✅ Fallback pokud Python fails

Všechny kroky validovány, logováry, error handling je na místě.
5 roundtrip tests - všechny projdou.

**Request opravdu opustí Node vrstvu a jde do Python sekce!**

---

**Průběh (5.0A→5.0D):**
- 5.0A: External Python runtime ✅
- 5.0B: Input parsing & validation ✅
- 5.0C: Response validation ✅
- 5.0D: Node-Python roundtrip ✅
- 5.1: Model training (next) →

---

**Plná dokumentace:** `FAZE_5_0D_NODE_PYTHON_ROUNDTRIP.md`
