# Evidence v Datech / AURIX Core

Portfolio project: personal finance tracking web app with a separate Electron admin console (AURIX Core), Firebase backend, and an experimental Python ML runtime for prediction observability.

The project demonstrates a full-stack product workflow: data entry, role-aware management, ML pipeline monitoring, runtime health checks, and container orchestration with Podman/Docker Compose.

## Highlights

- React/Vite finance tracker for income and expense data entry
- **AURIX Core** — Electron desktop admin console with ML control, AI profiles, observability, and audit trails
- Firebase Authentication, Firestore, Cloud Functions, and audit logging
- Python Flask ML runtime with health, readiness, prediction, dataset validation, and evaluation endpoints
- Local Node.js backend proxy for runtime dependency checks
- Podman/Docker Compose stack for `backend` + `ml-runtime`
- Kubernetes manifests and CI/CD workflow examples
- Security: local secrets and env files are git-ignored and excluded from container build context

## Tech Stack

| Area | Technology |
| --- | --- |
| Web app | React 18, Vite, Tailwind CSS |
| Desktop admin | Electron, React, TypeScript |
| Backend | Firebase Cloud Functions, Node.js proxy |
| Database/Auth | Firestore, Firebase Authentication |
| ML runtime | Python, Flask |
| Containers | Podman/Docker Compose |
| Infrastructure | Kubernetes manifests, GitHub Actions |
| Testing | Vitest, TypeScript checks, Python runtime tests |

## Repository Layout

```text
backend/              Node.js backend proxy for ML runtime checks
desktop-app/          AURIX Core — Electron admin and ML control center
docs/                 Guides, reports, screenshots
functions/            Firebase Cloud Functions
k8s/                  Kubernetes manifests
ml-pipeline/          Experimental ML contract and validation utilities
ml-runtime/           Python Flask ML runtime
scripts/              Startup and helper scripts
src/                  Main web application (React/Vite)
tests/                Manual test scripts
docker-compose.yml    Podman/Docker Compose stack definition
```

---

## Quick Start

### 1. Install dependencies

```powershell
npm install
cd desktop-app && npm install && cd ..
cd backend && npm install && cd ..
```

### 2. Configure Firebase

```powershell
Copy-Item .env.example .env.local
```

Fill in your Firebase project values. Never commit `.env*` files — they are git-ignored.

### 3. Run the web app

```powershell
npm run dev
```

Opens at `http://localhost:5173`

---

## AURIX Core (Desktop Admin App)

AURIX Core is the admin and ML control center. It runs as a standalone Electron app.

### Option A — PowerShell launcher script (recommended)

```powershell
.\scripts\startup\start-aurix-core.ps1
```

The script checks for Node.js, installs dependencies on first run, and launches the app automatically.

### Option B — manual

```powershell
cd desktop-app
npm run electron-dev
```

This starts the Vite dev server and opens the Electron window once `http://localhost:5173` is ready.

### What's inside AURIX Core

| Section | Description |
| --- | --- |
| Dashboard | Overview of users, system health, recent activity |
| ML Predictions | L1 / L2 shadow prediction flow and results |
| Training Data | Approved feedback records for ML learning |
| AI Profiles | Per-user feature layer — freshness, staleness, confidence |
| AI Observability | Runtime health, run history, debug export |
| Audit Trail | Full action log with filters |

---

## Python ML Runtime

Run locally:

```powershell
python ml-runtime/app.py
```

Health check: `http://localhost:5000/health`

Expected response:

```json
{ "status": "healthy", "service": "ml-runtime" }
```

---

## Backend Proxy

```powershell
cd backend
$env:ML_RUNTIME_HOST="localhost"
npm start
```

Dependency check: `http://localhost:3000/status/dependencies`

---

## Podman / Docker Compose

```powershell
Copy-Item .env.docker-compose.example .env.docker-compose
podman machine start
podman network create ml-network
podman run -d --name ml-runtime --network ml-network -p 5000:5000 evidence-vydaju-ml-runtime
podman run -d --name node-backend --network ml-network -p 3000:3000 `
  -e ML_RUNTIME_HOST=ml-runtime -e ML_RUNTIME_PORT=5000 `
  -e ML_RUNTIME_ENABLED=true -e PORT=3000 evidence-vydaju-backend
```

> Note: `podman compose up --build` delegates to `docker-compose.exe` which has a credential-store conflict with Podman. Use `podman build` + `podman run` directly as shown above.

---

## Verification

Type check (desktop app):

```powershell
cd desktop-app
npm run type-check
```

Python runtime tests:

```powershell
python ml-runtime/test_dataset_error_handling.py
```

Runtime health:

```powershell
Invoke-WebRequest http://localhost:5000/health -UseBasicParsing
Invoke-WebRequest http://localhost:3000/status/dependencies -UseBasicParsing
```

---

## Demo Flow

1. Show the finance web app — income/expense tracking, dashboard.
2. Launch AURIX Core and walk through the sidebar sections.
3. Show ML Predictions — explain L1 vs. L2 shadow flow.
4. Show AI Profiles — per-user feature layer, freshness/staleness.
5. Show AI Observability — Python runtime health, run history, debug export.
6. Open `ml-runtime/app.py` — explain the Python service contract.
7. Show `docker-compose.yml` — explain the container stack.

---

## Security Notes

- Local `.env*` files are git-ignored.
- Service-account JSON files are git-ignored.
- Docker build context excludes env files, credentials, docs, and local cache via `.dockerignore`.
- Example files (`.env.example`, `.env.docker-compose.example`) are safe templates.

---

## Documentation

- Portfolio guide: `docs/PORTFOLIO_GUIDE.md`
- Setup guides: `docs/guides/`
- Phase and audit reports: `docs/reports/`

---

## About

This project was built by **Daniel Řezáč** using an AI-assisted development workflow. The architecture, feature decisions, and direction were driven by the author — Claude (Anthropic) was used as the implementation assistant throughout the process, writing code based on the author's instructions and requirements.

All technical choices, scope definitions, and product decisions were made by the author.
