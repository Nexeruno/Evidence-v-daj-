# FÁZE 5.1C: Shrnutí — Debug Metadata & Explanation

**Status:** ✅ **HOTOVO**  
**Datum:** 2026-06-07

---

## Co Bylo Vytvořeno

### 1. Input Summary v Debug Metadata

Nový field vysvětlující, z jakých inputů výsledek vznikl:

```json
"inputs": {
  "transactions": 45,
  "monthsOfHistory": 6,
  "totalHistoricalExpense": 23500.00,
  "income": 5000.00,
  "expenseToIncomeRatio": "4.7x"
}
```

Ukazuje:
- Kolik transakcí bylo analyzováno
- Kolik měsíců historie je dostupné
- Jaké množství bylo historicky vydáno
- Jaký je poměr výdajů k příjmu

### 2. Confidence Explanation v Debug Metadata

Nový field vysvětlující, jak byla spočítána confidence:

```json
"confidenceExplained": {
  "dataFrequency": "50% (6 months)",
  "transactionCount": "90% (45 txns)",
  "expenseRatio": "20% (4.7x income)",
  "incomeConstraint": "100% (provided)"
}
```

Ukazuje:
- Jaké skóre dostal každý faktor
- Proč dostal dané skóre
- Jaká byla podmínka

### 3. Calculation Method v Debug Metadata

Nový field vysvětlující jaký výpočet byl použit:

```json
"calculationMethod": "weighted recent (60%) + overall (40%) average"
```

Ukazuje:
- Jaký vzorec byl použit
- Jak byla vážena historická data

---

## Příklad Odpovědi

```json
{
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

## Čtelnost & Stručnost

✅ Krátké - jeden řádek per faktor  
✅ Čitelné - procenta, počty v závorkách  
✅ Jasné - proč dostal faktor skóre  
✅ Bez Jargonu - srozumitelný jazyk  

---

## Příklady Vysvětlení

### Dobrá data
```
inputs: 45 txns, 6 months, 4.7x expense-to-income
confidenceExplained:
  - 6 months = 50%
  - 45 txns = 90%
  - 4.7x income = 20% (problém)
  - income provided = 100%
calculationMethod: recent (60%) + overall (40%)
```

### Omezená data
```
inputs: 10 txns, 2 months, 1.0x balanced
confidenceExplained:
  - 2 months = 17% (málo)
  - 10 txns = 20% (málo)
  - 1.0x income = 50% (dobrý)
  - income provided = 100%
calculationMethod: monthly average (nedostatek pro trend)
```

### Bez dat
```
inputs: 0 txns, 0 months, N/A
confidenceExplained:
  - 0 months = 0%
  - 0 txns = 0%
  - no data = 0%
  - no income = 20%
calculationMethod: no data available
```

---

## Vlastnosti

✅ **Transparentní** - vysvětluje co se stalo  
✅ **Čitelné** - bez technického žargonu  
✅ **Debugovatelné** - dost info pro porozumění  
✅ **Uživatelsky přívětivé** - srozumitelné  

---

## Co Tohle NENÍ

❌ LIME/SHAP (advanced explainability)  
❌ Feature importance (ML vysvětlení)  
❌ Model internals (implementační detaily)  
❌ Složitá vysvětlení (jen jednoduché)  

---

## Shrnutí

**FÁZE 5.1C: ✅ COMPLETE**

Přidáno **základní explain/debug metadata**:

- ✅ Input summary (transakce, měsíce, poměr výdajů)
- ✅ Confidence breakdown (proč se skóroval každý faktor)
- ✅ Calculation method (jaký vzorec byl použit)
- ✅ Čitelný formát (procenta, počty, kontext)

**Python response teď má základní vysvětlitelnost.**

---

**Implementace:** `ml-runtime/app.py`  
**Status:** Production-ready  

