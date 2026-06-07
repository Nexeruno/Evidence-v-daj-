# AI Observability Stabilization Report

**Date:** 2026-06-07  
**Scope:** STAB-A — Encoding, runtime health, debug console, run detail modal  
**Status:** ✅ All acceptance criteria met

---

## 1. What Was Found

### 1.1 Encoding Corruption (Critical)
`AiObservabilityPage.tsx` contained pervasive mojibake throughout:

| Broken display | Correct | Root cause |
|---|---|---|
| `FĂZE` / `FĂZA` | `FÁZE` / `FÁZA` | cp1250 double-encode of Á |
| `âś…` | ✅ | cp1250 double-encode of U+2705 |
| `âťŚ` | ❌ | cp1250 double-encode of U+274C |
| `âš ď¸Ź` | ⚠️ | cp1250 double-encode of U+26A0 U+FE0F |
| `đźź˘` | 🟢 | cp1250 double-encode of U+1F7E2 |
| `đź"´` | 🔴 | cp1250 double-encode of U+1F534 |
| `đź"—` | 🔗 | cp1250 double-encode of U+1F517 |
| `đź"Š` | 📊 | cp1250 double-encode of U+1F4CA |
| `â€"` | — | cp1250 double-encode of U+2014 |
| `â†'` | → | cp1250 double-encode of U+2192 |

**Root cause:** UTF-8 bytes were decoded as `cp1250` (Windows-1250, the default Czech Windows code page) then re-encoded as UTF-8, creating double-encoded sequences. This was an original file issue, not caused by the session edits.

`RunDetailModal.tsx`, `useSuccessfulRuns.ts`, `useFailedRuns.ts`, `symbols.ts` — **no encoding issues found** in these files.

---

### 1.2 Runtime Health Check Confusion (Critical)

**Before STAB-A:**
- `useRuntimeStatus` called `localhost:3000/status/dependencies` (after 6.FIX-A)
- `localhost:3000` **does not exist** in local dev mode — `functions/index.js` are Firebase Cloud Functions deployed to Google Cloud, not a local Express server
- Result: runtime always shown as unavailable even when Python is running

**Before 6.FIX-A (and correctly):**
- `useRuntimeStatus` called `localhost:5000/health` directly — correct for local dev

**After STAB-A (correct final state):**
- `useRuntimeStatus` → calls `localhost:5000/health` directly from browser ✓
- `usePodmanRuntimeStatus` → calls `localhost:3000/status/dependencies` (only meaningful with Podman stack) ✓
- These two statuses are independent in the UI

---

### 1.3 Debug Console Placeholder (Medium)
Console contained fake log lines:
```
[PLACEHOLDER] Console initialized
[PLACEHOLDER] Version: 4.6A (skeleton)
[PLACEHOLDER] Status: Ready
[PLACEHOLDER] --- 
[PLACEHOLDER] Debug information will appear here
[PLACEHOLDER] Real-time logs coming in future phases
```

---

### 1.4 Run Detail Modal (Previously Fixed, Verified)
Fixed in OBS-2B/2C sessions:
- `useMemo` was called after early return (React hooks violation) → caused grey overlay
- `ModalContentErrorBoundary` added to catch render errors without freezing UI
- Escape key handler added
- `openRunDetail` wrapped in try/catch
- `onClose` resets `selectedRun` to null

---

## 2. What Was Fixed

### 2.1 Encoding Fix
Applied automated cp1250 → UTF-8 recovery via Python:
```python
# For each broken sequence in file:
recovered = broken.encode('cp1250').decode('utf-8')
```
Plus direct string replacement for `FÁZE`/`FÁZA` (Á = U+00C1 whose UTF-8 bytes C3 81 got double-encoded to U+0102 + U+0081).

**Result:** All mojibake eliminated. Zero suspicious characters remain.

### 2.2 Runtime Health Check Fix
Reverted `useRuntimeStatus` to direct `localhost:5000/health` fetch:
```typescript
export const RUNTIME_URL = 'http://localhost:5000'
const HEALTH_ENDPOINT = `${RUNTIME_URL}/health`
// Fetches directly from browser — no proxy layer in local dev
```

Python runtime response shape expected:
```json
{ "status": "healthy", "service": "ml-runtime", ... }
```

`usePodmanRuntimeStatus` retained as-is — calls `localhost:3000/status/dependencies` which is only meaningful when full Podman stack runs.

### 2.3 Debug Console
Replaced all `[PLACEHOLDER]` entries with live state from already-loaded hooks:
- Python runtime: available/unavailable + endpoint + last check time + error
- Podman backend: connected/not running + error reason
- Run counts: success loaded / failed loaded + any errors
- Honest footer: `No real-time log stream available. Run a check or execute pipeline to see live data.`

---

## 3. Canonical Runtime Endpoint

### For browser / local dev mode
```
http://localhost:5000
```
Python Flask server (`ml-runtime/app.py`) listens on this address.  
Health check: `GET http://localhost:5000/health`  
Expected response: `{ "status": "healthy", "service": "ml-runtime" }`

### For Podman container network (backend-internal only)
```
http://ml-runtime:5000
```
Used by the backend proxy when Podman multi-service stack is running.  
The browser **never** reaches this address directly.

---

## 4. Python Runtime Status vs Backend Dependency Status

| | Python Runtime Status | Backend Dependency Status |
|---|---|---|
| **Hook** | `useRuntimeStatus` | `usePodmanRuntimeStatus` |
| **Endpoint** | `localhost:5000/health` | `localhost:3000/status/dependencies` |
| **What it means** | Python Flask server is running | Full Podman stack is running |
| **Failure in local dev** | Python not started | Expected — Podman not used |
| **UI label** | "Python Runtime: Available / Unavailable" | "Podman Runtime: Connected / Disconnected" |
| **Independent?** | ✅ Yes | ✅ Yes |

**Key rule:** Backend unavailable ≠ Python runtime unavailable. They are checked independently.

---

## 5. Debug Console Status

**Before:** Skeleton placeholder with fake `[PLACEHOLDER]` log entries.  
**After:** Honest debug state showing live runtime data from hooks.

Real-time log streaming is **not implemented** — the console correctly states this instead of showing fake placeholder content.

---

## 6. Run Detail Modal Status

| Check | Status |
|---|---|
| Click on run opens modal | ✅ |
| Modal visible above overlay | ✅ (hooks violation fixed in OBS-2B) |
| Modal closeable: click-outside | ✅ |
| Modal closeable: close button | ✅ |
| Modal closeable: Escape key | ✅ (added in OBS-2C) |
| Invalid data shows fallback | ✅ (`isDataIncomplete` guard) |
| Render error shows fallback | ✅ (`ModalContentErrorBoundary`) |
| UI never stuck in grey overlay | ✅ (try/catch in `openRunDetail`) |

---

## 7. What Remains Open

- **Real-time log streaming** — Debug Console shows live state from hooks but no actual log stream. Requires backend WebSocket or polling endpoint.
- **Podman stack** — `usePodmanRuntimeStatus` will always show "Disconnected" in local dev. This is truthful, not a bug.
- **Python runtime not auto-started** — UI correctly shows "unavailable" when `ml-runtime/app.py` is not running. User must start it manually.

---

## 8. Verdict

| Area | Status |
|---|---|
| Encoding | ✅ Clean — no mojibake |
| Python runtime status | ✅ Correct — `localhost:5000/health` direct |
| Backend dependency status | ✅ Correct and independent |
| UI: Python vs Backend distinction | ✅ Clearly separated |
| Debug Console | ✅ No placeholders — honest state |
| Run Detail modal | ✅ Opens, closes, error-safe |
| TypeScript type-check | ✅ 0 errors |

**Ready for 7.x:** ✅ YES — AI Observability is stable, truthful, and type-safe.  
The remaining open items (log streaming, Podman) are known limitations, not bugs.
