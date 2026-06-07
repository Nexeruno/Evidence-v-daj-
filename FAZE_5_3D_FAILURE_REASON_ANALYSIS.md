# FÁZE 5.3D: Failure Reason Analysis in Evaluation

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add failure reason analysis to evaluation debug summary

---

## Executive Summary

**FÁZE 5.3D Objective:** *"Přidej stručný evaluation debug summary: top failure reasons, count per failure reason. Stačí jednoduchý textový/reporting výstup"*

**Status:** ✅ **ACHIEVED**

Failure reason analysis now includes:
- ✅ Detection of 10 different failure types
- ✅ Count tracking per failure reason
- ✅ Top 5 failure reasons returned
- ✅ Simple, readable debug summary
- ✅ Included in /evaluate-summary response
- ✅ 6 comprehensive tests

---

## What Was Implemented

### Failure Reason Types Detected

| Reason | Meaning | Example |
|--------|---------|---------|
| **missing_category** | Category field not provided | `{amount: 100, date: "2026-01-01"}` |
| **missing_amount** | Amount field not provided | `{category: "food", date: "2026-01-01"}` |
| **missing_date** | Date field not provided | `{category: "food", amount: 100}` |
| **empty_category** | Category is empty string | `{category: "", amount: 100, date}` |
| **empty_date** | Date is empty string | `{category: "food", amount: 100, date: ""}` |
| **negative_amount** | Amount is less than 0 | `{category: "food", amount: -50, date}` |
| **invalid_category_type** | Category is not string | `{category: 123, amount: 100, date}` |
| **invalid_amount_type** | Amount is not numeric | `{category: "food", amount: "text", date}` |
| **invalid_date_type** | Date is not string | `{category: "food", amount: 100, date: 123}` |
| **not_a_dict** | Row is not a dictionary | `"invalid"` or `123` |

### Debug Summary Section

Added to evaluation response:

```json
"debug_summary": {
  "top_failure_reasons": {
    "missing_amount": 3,
    "missing_category": 2,
    "empty_category": 1,
    "negative_amount": 1
  },
  "failure_reason_count": 4
}
```

**Features:**
- Returns top 5 failure reasons (limited for conciseness)
- Sorted by frequency (highest first)
- Count tracking per reason
- Easy to understand for debugging

---

## Example: Real Data Analysis

### Input Data (7 rows)

```
Row 1: category=food, amount=100, date=2026-01-05    ✅ Success
Row 2: category=food, amount=100, date=2026-01-15    ✅ Success
Row 3: (missing category), amount=100, date=2026-02-05  ❌ missing_category
Row 4: category=food, (missing amount), date=2026-02-15 ❌ missing_amount
Row 5: category="", amount=50, date=2026-03-05       ❌ empty_category
Row 6: category=food, amount=-50, date=2026-03-15    ❌ negative_amount
Row 7: category=food, amount=75, date=2026-04-05     ✅ Success
```

### Evaluation Output

```json
{
  "comparison": {
    "usable_output_rows": 3,
    "error_rows": 4,
    "success_rate": 42.9,
    "error_rate": 57.1
  },
  "debug_summary": {
    "top_failure_reasons": {
      "missing_category": 1,
      "missing_amount": 1,
      "empty_category": 1,
      "negative_amount": 1
    },
    "failure_reason_count": 4
  }
}
```

### Readable Interpretation

```
Evaluation Summary:
  Total rows: 7
  ✓ Usable: 3 (42.9%)
  ✗ Errors: 4 (57.1%)

Top Failure Reasons:
  - missing_category: 1
  - missing_amount: 1
  - empty_category: 1
  - negative_amount: 1
```

---

## Integration

Evaluation response structure:

```json
{
  "evaluation": {
    "summary": {...},
    "comparison": {...},
    "debug_summary": {
      "top_failure_reasons": {...},
      "failure_reason_count": N
    },
    "confidence": {...},
    "quality_score": {...}
  }
}
```

---

## Use Cases

### 1. Quick Debugging
```
"Why are 30% of rows failing?"
→ Check top_failure_reasons
→ If "missing_category" is top → Fix data source
```

### 2. Data Quality Insights
```
Track failure reasons over time
→ Identify patterns
→ Address root cause (e.g., schema mismatch)
```

### 3. Actionable Feedback
```
Report to data team:
"Top 3 issues: missing_category (25%), empty_amount (15%), negative_values (10%)"
→ Team can prioritize fixes
```

---

## Key Properties

✅ **Simple** — Just failure types and counts  
✅ **Readable** — Clear reason names  
✅ **Actionable** — Identifies what to fix  
✅ **Limited** — Top 5 only (concise)  
✅ **Observable** — Always included in response  

---

## Test Coverage

✅ Failure reason detection (multiple types)  
✅ Accurate counting per reason  
✅ No failures case (empty reasons)  
✅ Top 5 limit enforcement  
✅ Readable summary formatting  
✅ Reasons match error count  

---

## Complete Evaluation Framework

**FÁZA 5.3A:** Offline evaluation with metrics (train/test split)  
**FÁZA 5.3B:** Simple summary (row count, confidence, quality)  
**FÁZA 5.3C:** Success vs. failure comparison (counts + rates)  
**FÁZA 5.3D:** Failure reason analysis (this phase)  

✅ Evaluation framework now feature-complete with debugging

---

## What This Is NOT

❌ **Detailed Error Messages** — Just types, not per-row details  
❌ **Advanced Analytics** — Just counting and sorting  
❌ **Visualization** — Just text summary  
❌ **Automatic Fixing** — Just diagnosis  

---

## Summary

**FÁZE 5.3D:** ✅ **COMPLETE**

Failure reason analysis implemented:

- ✅ Detection of 10 failure types
- ✅ Count tracking per reason
- ✅ Top 5 reasons returned
- ✅ Simple, readable debug summary
- ✅ Integrated in /evaluate-summary
- ✅ 6 comprehensive tests

Evaluation now explains failure reasons for quick debugging and data quality improvement.

---

**Implementation Location:** `ml-runtime/app.py`
- EvaluationSummary.analyze_failure_reasons(): New method
- EvaluationSummary.calculate_summary(): Enhanced with debug_summary

**New Files:**
- `ml-runtime/test_failure_reason_analysis.py` — 6 comprehensive tests

**Enhanced Response:**
- `/evaluate-summary` includes "debug_summary" section

**Status:** Complete and production-ready  
**Evaluation Framework:** Feature-complete (5.3A + 5.3B + 5.3C + 5.3D)

