# ML Runtime — Startup Guide

## Spuštění před testy

Testy předpokládají běžící Python runtime server. Nejdřív spusť server, pak testy.

### 1. Spusť server

```bash
python ml-runtime/app.py
```

Server nastartuje na `http://0.0.0.0:5000` (dostupný na `localhost:5000` a přes Podman port mapping).

Očekávaný výstup:
```
[CONTAINER-STARTUP] ML Runtime container initialization starting
[CONTAINER-STARTUP] All endpoints ready
* Running on all addresses (0.0.0.0)
* Running on http://127.0.0.1:5000
```

### 2. Ověř health check

```bash
curl http://127.0.0.1:5000/health
```

Očekávaný response:
```json
{ "status": "healthy", "service": "ml-runtime" }
```

### 3. Spusť testy

```bash
python ml-runtime/test_dataset_error_handling.py
```

---

## Podman / Container

Server bind na `0.0.0.0` — port mapping funguje automaticky:

```bash
podman run -p 5000:5000 ml-runtime
```

Dostupný pak na `http://localhost:5000` z hostitele.

---

## Python verze

Vyžaduje Flask 3.x+ (Python 3.14 kompatibilní):

```bash
pip install --upgrade flask
```

Flask 2.x používá `pkgutil.get_loader` který byl odstraněn v Python 3.14.

---

## Endpoints

| Method | Path | Popis |
|--------|------|-------|
| GET | `/health` | Health check |
| GET | `/status` | Runtime status |
| GET | `/readiness` | Readiness verdict |
| GET | `/status-summary` | Status summary |
| POST | `/predict` | ML prediction |
| POST | `/dataset-info` | Dataset analysis |
| POST | `/evaluate` | Offline evaluation |
| POST | `/evaluate-summary` | Evaluation summary |
