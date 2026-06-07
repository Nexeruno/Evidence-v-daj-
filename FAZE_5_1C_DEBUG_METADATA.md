# FÁZE 5.1C: Debug Metadata & Confidence Explanation

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add readable debug metadata explaining prediction inputs and confidence calculation

---

## Executive Summary

**FÁZE 5.1C Objective:** *"Rozšiř debug metadata tak, aby stručně říkala: z jakých inputů výsledek vznikl, jak byl spočítán confidence"*

**Status:** ✅ **ACHIEVED**

Debug metadata now explains:
- ✅ What inputs were used (`inputSummary`)
- ✅ How confidence was calculated (`confidenceExplained`)
- ✅ Which calculation method was used (`calculationMethod`)
- ✅ Keep it short and readable

---

## What Was Implemented

### 1. Input Summary in Debug Metadata

**New Field:** `debugMetadata.inputs`

```json
"inputs": {
  "transactions": 45,
  "monthsOfHistory": 6,
  "totalHistoricalExpense": 23500.00,
  "income": 5000.00,
  "expenseToIncomeRatio": "4.7x"
}
```

**Explains:**
- How many transactions were analyzed
- How many months of history available
- Total amount spent historically
- Monthly income (if provided)
- Expense-to-income ratio (for quick context)

### 2. Confidence Explanation in Debug Metadata

**New Field:** `debugMetadata.confidenceExplained`

```json
"confidenceExplained": {
  "dataFrequency": "50% (6 months)",
  "transactionCount": "90% (45 txns)",
  "expenseRatio": "20% (4.7x income)",
  "incomeConstraint": "100% (provided)"
}
```

**Explains Each Factor:**
- What each factor scored
- Why it got that score
- What the condition was

### 3. Calculation Method in Debug Metadata

**New Field:** `debugMetadata.calculationMethod`

```json
"calculationMethod": "weighted recent (60%) + overall (40%) average"
```

**Explains:**
- Simple description of prediction formula
- How recent vs. historical data was weighted

---

## Complete Example Response

```json
{
  "status": "success",
  "uid": "user-123",
  "pipelineLevel": "L1",
  "modelVersion": "1.0",
  "processedAt": "2026-06-07T18:00:00.000Z",
  
  "result": {
    "predictedExpense": 3500.00,
    "confidence": 0.87,
    "confidenceFactors": {
      "dataFrequency": 0.5,
      "transactionCount": 0.9,
      "expenseRatio": 0.2,
      "incomeConstraint": 1.0
    }
  },
  
  "predictions": [{
    "period": "2026-06",
    "totalPredictedExpense": 3500.00,
    "confidence": 0.87,
    "confidenceFactors": {...},
    "categories": {"food": 2100, "transport": 1400},
    "dataPoints": 45,
    "pipelineLevel": "L1"
  }],
  
  "error": null,
  
  "debugMetadata": {
    "processingTimeMs": 12,
    "pythonRuntime": "3.9",
    "frameworkVersion": "Flask/2.3.2",
    
    "inputs": {
      "transactions": 45,
      "monthsOfHistory": 6,
      "totalHistoricalExpense": 23500.00,
      "income": 5000.00,
      "expenseToIncomeRatio": "4.7x"
    },
    
    "confidenceExplained": {
      "dataFrequency": "50% (6 months)",
      "transactionCount": "90% (45 txns)",
      "expenseRatio": "20% (4.7x income)",
      "incomeConstraint": "100% (provided)"
    },
    
    "calculationMethod": "weighted recent (60%) + overall (40%) average",
    
    "parsed": {
      "uid": "user-123",
      "pipelineLevel": "L1",
      "transactionCount": 45,
      "income": 5000.00
    }
  }
}
```

---

## Explanation Examples

### Example 1: Good Data

**Scenario:** User with 6 months of history, 45 transactions

```json
{
  "inputs": {
    "transactions": 45,
    "monthsOfHistory": 6,
    "totalHistoricalExpense": 23500.00,
    "income": 5000.00,
    "expenseToIncomeRatio": "4.7x"
  },
  
  "confidenceExplained": {
    "dataFrequency": "50% (6 months)",
    "transactionCount": "90% (45 txns)",
    "expenseRatio": "20% (4.7x income)",
    "incomeConstraint": "100% (provided)"
  },
  
  "calculationMethod": "weighted recent (60%) + overall (40%) average"
}
```

**What This Says:**
- "You have 45 transactions over 6 months"
- "Total spent: 23,500, income: 5,000"
- "Expense-to-income ratio: 4.7x (spending exceeds income)"
- "Confidence is 87% because:"
  - "6 months of data = 50% of best"
  - "45 transactions = 90% of ideal (50+ is best)"
  - "Spending 4.7x income = only 20% score (concerning)"
  - "Income provided = 100% (good)"
- "Calculation used recent 3 months weighted 60% + historical average 40%"

### Example 2: Limited Data

**Scenario:** User with 2 months history, 10 transactions

```json
{
  "inputs": {
    "transactions": 10,
    "monthsOfHistory": 2,
    "totalHistoricalExpense": 3000.00,
    "income": 3000.00,
    "expenseToIncomeRatio": "1.0x"
  },
  
  "confidenceExplained": {
    "dataFrequency": "17% (2 months)",
    "transactionCount": "20% (10 txns)",
    "expenseRatio": "50% (1.0x income)",
    "incomeConstraint": "100% (provided)"
  },
  
  "calculationMethod": "monthly average (not enough history for trend)"
}
```

**What This Says:**
- "Only 2 months of data, 10 transactions"
- "Spending matches income (1.0x) - balanced"
- "Confidence is lower because:"
  - "Only 2 months = 17% of ideal (need 12 months)"
  - "Only 10 transactions = 20% (need 50+)"
  - "Expense ratio is good = 50%"
  - "Income provided = 100%"
- "Using simple monthly average (not enough months for trend analysis)"

### Example 3: No Data

**Scenario:** User with no transactions

```json
{
  "inputs": {
    "transactions": 0,
    "monthsOfHistory": 0,
    "totalHistoricalExpense": 0.0,
    "income": null,
    "expenseToIncomeRatio": "N/A"
  },
  
  "confidenceExplained": {
    "dataFrequency": "0% (no history)",
    "transactionCount": "0% (no transactions)",
    "expenseRatio": "0% (no data)",
    "incomeConstraint": "20% (not provided)"
  },
  
  "calculationMethod": "no data available"
}
```

**What This Says:**
- "No transaction history"
- "No income provided"
- "Confidence is minimum (10%) because:"
  - "No months of history = 0%"
  - "No transactions = 0%"
  - "No expense data = 0%"
  - "No income = only 20%"

---

## Debug Metadata Structure

```
debugMetadata
├─ processingTimeMs: integer        (existing)
├─ pythonRuntime: string            (existing)
├─ frameworkVersion: string         (existing)
├─ inputs: object                   (NEW in 5.1C)
│  ├─ transactions: integer
│  ├─ monthsOfHistory: integer
│  ├─ totalHistoricalExpense: float
│  ├─ income: float (or null)
│  └─ expenseToIncomeRatio: string
├─ confidenceExplained: object      (NEW in 5.1C)
│  ├─ dataFrequency: string
│  ├─ transactionCount: string
│  ├─ expenseRatio: string
│  └─ incomeConstraint: string
├─ calculationMethod: string        (NEW in 5.1C)
└─ parsed: object                   (existing)
```

---

## Design Principles

✅ **Short:** Each field is 1-2 sentences  
✅ **Readable:** Percentages and counts in parentheses  
✅ **Contextual:** Shows why each factor was scored  
✅ **No Jargon:** Plain language explanations  
✅ **Debuggable:** Enough detail to understand the result  

---

## What Is Exposed

### User Can See:
- "I had 45 transactions over 6 months"
- "My total spending was 23,500"
- "My income is 5,000"
- "I'm spending 4.7x my income"
- "Confidence is 87% because:"
  - "6 months of history (good)"
  - "45 transactions (very good)"
  - "Spending more than I earn (concern)"
  - "Income provided (good)"
- "The prediction uses recent spending weighted 60%, historical average 40%"

### User Cannot See (By Design):
- ❌ Internal algorithm details
- ❌ Machine learning weights
- ❌ Raw confidence factors (0.0-1.0 numbers)
- ❌ Code implementation details

---

## Properties

✅ **Transparent:** Explains what happened  
✅ **Not Complex:** No fancy explainability algorithms  
✅ **Readable:** Plain text, percentages, context  
✅ **Debuggable:** Enough for developers to understand  
✅ **User-Friendly:** Enough for users to understand prediction  

---

## What This Is

✅ **Basic Explainability:** Shows inputs and calculation  
✅ **Readable Metadata:** Short, clear explanations  
✅ **Debuggable Output:** Helps understand results  
✅ **Not ML Explainability:** No complex algorithms  

---

## What This Is NOT

❌ **LIME/SHAP:** Not advanced explainability  
❌ **Feature Importance:** No machine learning to explain  
❌ **Model Internals:** Not exposing algorithm details  
❌ **Complex Explanation:** Simple, readable only  

---

## Next Steps (Not in This Phase)

- **FÁZE 5.1D:** Add user-friendly summary (non-technical)
- **FÁZE 5.1E:** Add prediction confidence intervals
- **FÁZE 5.2:** Integrate real ML model explanation
- **FÁZE 5.3:** Add learning feedback explanation

---

## Summary

**FÁZE 5.1C:** ✅ **COMPLETE**

Added **basic explain/debug metadata** showing:

- ✅ Input summary (transactions, months, expense-to-income)
- ✅ Confidence breakdown (why each factor scored)
- ✅ Calculation method (what formula was used)
- ✅ Readable format (percentages, counts, context)
- ✅ Debuggable (helps understand predictions)

Python response now has **basic explainability** built in.

---

**Implementation Location:** `ml-runtime/app.py`  
- `calculate_baseline_prediction()` — builds _debug info
- `/predict` endpoint — adds debug to debugMetadata

**Status:** Production-ready  
**Explainability Level:** Basic (non-complex)  

