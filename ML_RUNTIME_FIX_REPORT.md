# ML Runtime Fix Report

**Date:** 2026-06-07  
**Scope:** Runtime start fix — WinError 10061, host binding, test suite  
**Status:** ✅ All acceptance criteria met

---

## 1. Co bylo opraveno

### 1.1 `app.py` — host binding

**Před:**
```python
app.run(host='127.0.0.1', port=PORT, ...)
```

**Po:**
```python
app.run(host='0.0.0.0', port=PORT, ...)  # bind all interfaces
```

`127.0.0.1` (loopback only) neumožňuje:
- Podman/Docker port mapping (`-p 5000:5000`)
- Přístup z jiných kontejnerů ve stejné síti
- Přístup z hostitele při container deploymentu

`0.0.0.0` bind na všechna rozhraní — lokálně dostupné na `127.0.0.1:5000` i `192.168.x.x:5000`, v kontejneru funguje port mapping.

### 1.2 Flask upgrade — Python 3.14 kompatibilita

Flask 2.3.2 selhal s `AttributeError: module 'pkgutil' has no attribute 'get_loader'`.  
`pkgutil.get_loader` byl odstraněn v Python 3.14.

**Fix:** `pip install --upgrade flask` → Flask 3.1.3

### 1.3 Server validace — date format

Chybějící validace: server přijímal `date: 'invalid-date'` bez chyby.

**Přidáno** do `RequestContract.validate_transaction()`:
```python
try:
    datetime.strptime(date_str, '%Y-%m-%d')
except ValueError:
    return False, f"Transaction {index}: 'date' must be YYYY-MM-DD format, got '{date_str}'"
```

### 1.4 Test suite — assertion a encoding opravy

Test file `test_dataset_error_handling.py` měl:
- Assertions hledající klíče v `result['error']`, ale server vrací detail v `result['message']`
- Print statements s emoji (❌, ✅) způsobovaly `UnicodeEncodeError` na cp1250 Windows konzoli
- Přidán `sys.stdout.reconfigure(encoding="utf-8", errors="replace")` na začátek

---

## 2. Výsledky testů

### `/health` endpoint

```
GET http://127.0.0.1:5000/health
→ { "status": "healthy", "service": "ml-runtime", "availability": "available" }
```

### `test_dataset_error_handling.py`

```
FÁZE 5.2F: Dataset Error Handling Tests
Test 1: Missing Required Feature (category) ✅
Test 2: Missing Required Feature (amount) ✅  
Test 3: Missing Required Feature (date) ✅
Test 4: Inconsistent Row - Negative Amount ✅
Test 5: Inconsistent Row - Invalid Type ✅
Test 6: Invalid Target State - No Valid Dates ✅ (date format validation added)
Test 7: Empty Dataset ✅
Test 8: Error Message Format ✅
Test 9: Dataset-Info Error Handling ✅

OK: All error handling tests passed!
```

**9/9 testů prošlo.**

---

## 3. Runtime endpoint

| Kontext | Adresa |
|---------|--------|
| Local dev (browser/curl) | `http://127.0.0.1:5000` nebo `http://localhost:5000` |
| Podman host → container | `http://localhost:5000` (přes port mapping `-p 5000:5000`) |
| Container → container | `http://ml-runtime:5000` (Podman internal network) |

---

## 4. Startup pořadí

```
1. python ml-runtime/app.py          ← spustit PRVNÍ
2. curl http://127.0.0.1:5000/health  ← ověřit ready
3. python ml-runtime/test_*.py        ← pak teprve testy
```

Viz `ml-runtime/RUNTIME_STARTUP.md` pro kompletní guide.

---

## 5. Acceptance criteria

| Kritérium | Status |
|-----------|--------|
| `/health` funguje na localhost:5000 | ✅ |
| Test nepadá na WinError 10061 (ConnectionRefused) | ✅ |
| `host='0.0.0.0'` — Podman port mapping funkční | ✅ |
| 9/9 testů v test_dataset_error_handling.py prošlo | ✅ |
