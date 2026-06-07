# FÁZE 5.3D: Shrnutí — Failure Reason Analysis

**Status:** ✅ **HOTOVO**  
**Datum:** 2026-06-07

---

## Co Bylo Vytvořeno

### Failure Reason Analysis

Evaluation nyní obsahuje analýzu **proč rows selhaly**:

```json
"debug_summary": {
  "top_failure_reasons": {
    "missing_category": 3,
    "missing_amount": 2,
    "empty_category": 1,
    "negative_amount": 1
  },
  "failure_reason_count": 4
}
```

---

## Sledované Failure Reasons

| Reason | Popis |
|--------|-------|
| **missing_category** | Pole category chybí |
| **missing_amount** | Pole amount chybí |
| **missing_date** | Pole date chybí |
| **empty_category** | Category je prázdný string "" |
| **empty_date** | Date je prázdný string "" |
| **negative_amount** | Amount je < 0 |
| **invalid_category_type** | Category není string |
| **invalid_amount_type** | Amount není číslo |
| **invalid_date_type** | Date není string |
| **not_a_dict** | Row není dictionary |

---

## Příklad

Máme 7 rows:
- 3 success ✅
- 4 errors ❌

Evaluation vrátí:

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

## Co Je Hotovo

✅ Detection 10 failure types  
✅ Count tracking per reason  
✅ Top 5 reasons returned  
✅ Simple readable format  
✅ /evaluate-summary integration  
✅ 6 comprehensive tests  
✅ Documentation  

---

## Use Cases

1. **Quick Debugging** — "Proč 30% rows selhalo?"
2. **Data Quality** — Track failure reasons v čase
3. **Actionable Feedback** — Řekni team "oprav missing_category"

---

## Shrnutí

**FÁZA 5.3D: ✅ COMPLETE**

Existuje stručný evaluation debug summary:

- ✅ Top failure reasons
- ✅ Count per reason
- ✅ Jednoduchý textový output
- ✅ Integrováno v /evaluate-summary

Evaluation teď vysvětluje **proč** rows selhaly.

---

**Implementace:** `ml-runtime/app.py`  
**Testy:** `ml-runtime/test_failure_reason_analysis.py`  
**Dokumentace:** `FAZE_5_3D_FAILURE_REASON_ANALYSIS.md`  
**Status:** Production-ready  
**Evaluation Framework:** Feature-complete (5.3A + 5.3B + 5.3C + 5.3D)

