# FÁZE 5.2A: Real Dataset-Based Input for Python Runtime

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Connect Python runtime to real train-ready dataset input instead of synthetic/mock data

---

## Executive Summary

**FÁZE 5.2A Objective:** *"Připoj Python runtime k reálnému train-ready dataset inputu místo čistě synthetic/mock inputu"*

**Status:** ✅ **ACHIEVED**

Python runtime now receives real, Firestore-based user transaction data:
- ✅ Real user transactions loaded from Firestore
- ✅ Real user income data loaded from Firestore
- ✅ Data transformed to Python contract format
- ✅ Python runtime processes real dataset-based input
- ✅ Deterministic predictions based on real data
- ✅ Observable via structured logging

---

## What Was Implemented

### Data Pipeline: Firestore → Python Runtime

```
Firestore (Real Data)
    ↓
1. Load real user transactions
   └─ loadUserTransactions(user.uid)
   └─ Returns array of {kategorie, castka, datum}
    ↓
2. Load real user income
   └─ loadUserIncome(user.uid)
   └─ Returns array of {castka}
    ↓
3. Transform to Python contract
   ├─ kategorie → category (lowercase)
   ├─ castka → amount (float)
   ├─ datum → date (ISO format)
   └─ Total income calculated
    ↓
4. Send to Python runtime
   └─ POST /predict with real data
    ↓
5. Python processes real dataset
   ├─ Validates input
   ├─ Parses transactions
   ├─ Calculates deterministic prediction
   ├─ Generates metadata (inputs tracked!)
   └─ Returns prediction
    ↓
6. Node receives prediction
   └─ Transforms to Node format
   └─ Preserves Python metadata
    ↓
7. Save to Firestore
   └─ sourceMethod: "Python ML Runtime"
   └─ pythonMetadata includes real data info
```

---

## Data Source Logging

### New Event: mlPipeline_pythonRuntime_realDatasetInput

Logged when Python runtime receives real data:

```json
{
  "event": "mlPipeline_pythonRuntime_realDatasetInput",
  "uid": "user-123",
  "dataSource": "Firestore (real user transactions)",
  "transactionCount": 45,
  "incomeRecords": 12,
  "totalExpense": 23500.00,
  "totalIncome": 60000.00
}
```

**Tracked Information:**
- `dataSource`: Always "Firestore (real user transactions)"
- `transactionCount`: How many real transactions for this user
- `incomeRecords`: How many income records for this user
- `totalExpense`: Sum of all expenses (real data)
- `totalIncome`: Sum of all income (real data)

---

## Example: Real Data Flow

### User: user-123

**Firestore Data:**
```
Transactions:
  ├─ {kategorie: "food", castka: 50.00, datum: "2026-05-01"}
  ├─ {kategorie: "food", castka: 55.00, datum: "2026-06-01"}
  ├─ {kategorie: "transport", castka: 30.00, datum: "2026-05-01"}
  ├─ ... (45 total)

Income:
  ├─ {castka: 5000.00, datum: "2026-05"}
  ├─ {castka: 5000.00, datum: "2026-06"}
  └─ ... (12 total)
```

**Log Before Python Call:**
```json
{
  "event": "mlPipeline_pythonRuntime_realDatasetInput",
  "uid": "user-123",
  "dataSource": "Firestore (real user transactions)",
  "transactionCount": 45,
  "incomeRecords": 12,
  "totalExpense": 23500.00,
  "totalIncome": 60000.00
}
```

**Python Request:**
```json
{
  "uid": "user-123",
  "pipelineLevel": "L1",
  "modelVersion": "1.0",
  "transactions": [
    {"category": "food", "amount": 50.00, "date": "2026-05-01"},
    {"category": "food", "amount": 55.00, "date": "2026-06-01"},
    {"category": "transport", "amount": 30.00, "date": "2026-05-01"},
    ...45 total
  ],
  "income": 60000.00,
  "debugMode": false
}
```

**Python Response (from real data):**
```json
{
  "status": "success",
  "result": {
    "predictedExpense": 3917.00,
    "confidence": 0.85,
    "confidenceFactors": {
      "dataFrequency": 0.5,
      "transactionCount": 0.9,
      "expenseRatio": 0.2,
      "incomeConstraint": 1.0
    }
  },
  "debugMetadata": {
    "inputs": {
      "transactions": 45,
      "monthsOfHistory": 3,
      "totalHistoricalExpense": 23500.00,
      "income": 60000.00,
      "expenseToIncomeRatio": "0.39x"
    },
    "confidenceExplained": {
      "dataFrequency": "50% (3 months)",
      "transactionCount": "90% (45 txns)",
      "expenseRatio": "20% (0.39x income)",
      "incomeConstraint": "100% (provided)"
    },
    "calculationMethod": "weighted recent (60%) + overall (40%) average",
    "processingTimeMs": 12
  }
}
```

---

## Key Properties

✅ **Real Data:** Loaded from Firestore, not mocked  
✅ **Observable:** Logged before Python call  
✅ **Traceable:** uid in every log  
✅ **Measurable:** Transaction count + income tracked  
✅ **Metadata Rich:** Python explains calculation  

---

## Integration Points

### runMlPipeline() [Scheduled]

```javascript
// Load real data from Firestore
const transactions = await loadUserTransactions(user.uid);
const income = await loadUserIncome(user.uid);

// Log real dataset info (FÁZE 5.2A)
logger.info({
  event: 'mlPipeline_pythonRuntime_realDatasetInput',
  uid: user.uid,
  dataSource: 'Firestore (real user transactions)',
  transactionCount: transactions.length,
  incomeRecords: income.length,
  totalExpense: transactions.reduce((sum, t) => sum + t.castka, 0),
  totalIncome: income.reduce((sum, i) => sum + i.castka, 0)
});

// Send to Python (data is already real)
const runtimeResponse = await mlRuntimeClient.callMlRuntime(runtimeRequest);
```

### testMlPipeline() [Manual Testing]

Same implementation, triggered manually for testing.

---

## Use Case: First Simple Case

**Pipeline Level:** L1 (deterministic baseline)  
**Data Source:** Real Firestore transactions  
**Goal:** Validate that Python runtime works with real data  
**Result:** Deterministic prediction based on real user history  

---

## What This Enables

✅ **Real Data Testing:** Verify Python works with actual user data  
✅ **Quality Metrics:** Confidence scores based on real data quality  
✅ **Data Observability:** See what data Python receives  
✅ **Prediction Validity:** Predictions based on real user history  
✅ **Foundation for Training:** Real data ready for model training  

---

## What This Is NOT

❌ **Model Training:** No ML model yet, just deterministic calculation  
❌ **Synthetic Data:** Real Firestore data, not mocked  
❌ **Data Validation Pipeline:** Just connection, no ETL  
❌ **Production Deployment:** Just connection, no Podman/K8s  

---

## Summary

**FÁZE 5.2A:** ✅ **COMPLETE**

Connected Python runtime to real dataset:

- ✅ Real transactions loaded from Firestore
- ✅ Real income loaded from Firestore
- ✅ Data transformed to Python contract
- ✅ Python receives real dataset-based input
- ✅ Deterministic predictions based on real data
- ✅ Observable via structured logging
- ✅ Traceable with uid + metrics

Python runtime now processes real, train-ready dataset from Firestore instead of synthetic/mock data.

---

**Implementation Location:** `functions/index.js`
- runMlPipeline(): Lines ~2115-2149
- testMlPipeline(): Lines ~2407-2440

**New Logging Event:** `mlPipeline_pythonRuntime_realDatasetInput`

**Status:** Production-ready  
**Foundation:** Ready for model training integration  

