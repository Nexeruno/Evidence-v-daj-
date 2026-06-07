# FÁZE 5.0B: Shrnutí — Input Parsing & Validation

**Status:** ✅ **HOTOVO**  
**Datum:** 2026-06-07

---

## Co Bylo Vytvořeno

### 1. Vylepšené RequestContract (Detailní Validace)

```python
class RequestContract:
    REQUIRED_FIELDS = {'uid': str, 'pipelineLevel': str, 'modelVersion': str}
    OPTIONAL_FIELDS = {'transactions': list, 'income': (int, float), 'debugMode': bool}
    VALID_PIPELINE_LEVELS = ['L1', 'L2', 'L3']
```

**Nová validace:**
- ✅ Semantic validation (enums, semantic version)
- ✅ Value range checking (min/max)
- ✅ Nested structure validation (transactions)
- ✅ Detailní error messages s field/index info
- ✅ Prázdné stringy detekce
- ✅ Maximum length/count enforcement

**Validovanéfields:**
- `uid` — non-empty string, max 256 chars
- `pipelineLevel` — must be L1, L2, nebo L3
- `modelVersion` — must be semantic version (1.0, 1.0.0)
- `transactions` — array, max 10,000 items
  - Každá transakce: category, amount, date
  - Amount ≥ 0, category non-empty
- `income` — ≥ 0, max 1 miliarda
- `debugMode` — boolean

### 2. Nová RequestParser Třída

```python
class RequestParser:
    @staticmethod
    def parse(data: Dict) -> Dict         # Parse & normalize
    @staticmethod
    def parse_transaction(tx: Dict) -> Dict  # Parse single tx
    @staticmethod
    def get_summary(parsed_data: Dict) -> Dict  # Get summary
```

**Co dělá:**
- Normalizuje uid na trimmed string
- Normalizuje pipelineLevel na uppercase (L1, L2, L3)
- Parsuje transactions (category lowercase, amount float)
- Konvertuje income na float (default 0)
- Konvertuje debugMode na boolean (default False)
- Vrací normalized data + original pro debugging

**Výstup:**
```python
{
    'uid': 'user-123',
    'pipelineLevel': 'L1',        # Normalizované
    'modelVersion': '1.0',
    'transactions': [
        {'category': 'food', 'amount': 50.0, 'date': '2026-06-01'},
        {'category': 'transport', 'amount': 25.0, 'date': '2026-06-02'}
    ],
    'income': 5000.0,
    'debugMode': False,
    '_originalData': {...}        # Pro debugging
}
```

### 3. Aktualizovaný /predict Endpoint

**5-step processing:**
1. Get JSON — Check Content-Type, extract body
2. Validate Contract — Detailní validace se semantic checks
3. Parse Input — Normalizuj data, error handling
4. Generate Prediction — Použij normalized data
5. Build Response — Include parsing metadata v debugMetadata

**Error Handling:**
- Specifické error messages pro každou fázi
- Field name/index v transaction errors
- Logging s context (uid pokud dostupný)
- Správné HTTP status codes (400 validation, 500 exception)

**Response s Parsing Metadata:**
```json
{
  "status": "success",
  "uid": "user-123",
  "debugMetadata": {
    "processingTimeMs": 5,
    "parsed": {
      "uid": "user-123",
      "pipelineLevel": "L1",
      "modelVersion": "1.0",
      "transactionCount": 2,
      "income": 5000.0,
      "debugMode": false
    }
  }
}
```

---

## Error Message Examples

```
❌ Missing field
"Missing required field: modelVersion"

❌ Wrong type
"Field 'income' must be int or float, got str"

❌ Invalid enum
"Field 'pipelineLevel' must be one of ['L1', 'L2', 'L3'], got 'L4'"

❌ Bad semantic version
"Field 'modelVersion' must be semantic version (e.g., 1.0 or 1.0.0), got '1'"

❌ Bad transaction
"Transaction 1: missing 'amount' field"

❌ Value error
"Field 'income' must be >= 0, got -100"
```

---

## Validace Matrix

| Field | Type | Required | Enum | Range | Nested |
|-------|------|----------|------|-------|--------|
| uid | string | ✅ | - | 1-256 | - |
| pipelineLevel | string | ✅ | L1,L2,L3 | - | - |
| modelVersion | string | ✅ | semver | - | - |
| transactions | array | ❌ | - | 0-10K | ✅ |
| income | number | ❌ | - | ≥0 | - |
| debugMode | boolean | ❌ | - | - | - |

---

## Příklady Testování

### Valid Request ✅
```bash
curl -X POST http://127.0.0.1:5000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "user-123",
    "pipelineLevel": "L1",
    "modelVersion": "1.0",
    "transactions": [
      {"category": "food", "amount": 50.00, "date": "2026-06-01"}
    ],
    "income": 5000.00
  }'
```

Vrací: 200 OK s success response + parsed metadata

### Invalid Request ❌
```bash
curl -X POST http://127.0.0.1:5000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "user-123",
    "pipelineLevel": "L4",  # ❌ Invalid enum
    "modelVersion": "1.0"
  }'
```

Vrací: 400 Bad Request
```json
{
  "status": "failed",
  "error": "Field 'pipelineLevel' must be one of ['L1', 'L2', 'L3'], got 'L4'",
  "uid": "user-123"
}
```

---

## Logging

```
[INFO] Request parsed successfully: {'uid': 'user-123', 'pipelineLevel': 'L1', 'transactionCount': 1, ...}
[INFO] [PREDICT] Processing: uid=user-123, level=L1, txns=1
[INFO] [SUCCESS] Prediction completed: uid=user-123, level=L1, confidence=0.68, time=5ms
[WARNING] Request validation failed: Field 'pipelineLevel' must be one of ['L1', 'L2', 'L3'], got 'L4'
[ERROR] Request parsing failed: Transaction 0: missing 'amount' field
```

---

## Klíčové Features

✅ **Input Parsing** — Normalizovaná všechna data konzistentně  
✅ **Detailní Validace** — Komplexní contract validation se semantic checks  
✅ **Clear Error Messages** — Specifické errors s field/index info  
✅ **Logging** — Plná viditelnost  
✅ **Metadata** — Parsing details v response  
✅ **Type Flexibility** — Support pro int nebo float  
✅ **Bounds Checking** — Limity na field length a array size  
✅ **Nested Validation** — Recursive validace transactions  

---

## Co Není Zahrnuto (Podle Scope)

❌ Model training  
❌ Podman/Docker  
❌ Kubernetes  
❌ Nové UI prvky  

---

## Souhrn

**FÁZE 5.0B: ✅ COMPLETE**

Python entrypoint teď má:
1. **Detailní input validation** podle contract
2. **Parsing & normalization** všech dat
3. **Specifické error messages** pro validační chyby
4. **Metadata** ukazující co bylo parsováno
5. **Full logging** validation process

**Přechází:** FÁZE 5.0A (External Python runtime boundary)  
**Aktuální:** FÁZE 5.0B (Input parsing & validation)  
**Příští:** FÁZE 5.1 (Model training)

---

**Plná dokumentace:** `FAZE_5_0B_INPUT_PARSING_VALIDATION.md`
