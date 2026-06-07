# FÁZA 6.2A: Multi-Service Podman Setup

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Create minimal multi-service orchestration for Node backend + Python runtime

---

## Executive Summary

**FÁZA 6.2A Objective:** *"Připrav první jednoduchou multi-service lokální orchestraci pro Podman"*

**Status:** ✅ **ACHIEVED**

Multi-service Podman setup ready:
- ✅ Node.js Express backend service
- ✅ Python Flask ML runtime service
- ✅ Docker Compose (Podman compatible) orchestration
- ✅ Service networking bridge
- ✅ Health checks for both services
- ✅ Minimal configuration (no Kubernetes, no extras)

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│          Docker Compose Network                 │
│  (Podman Compatible - ml-network)              │
│                                                 │
│  ┌─────────────────┐        ┌─────────────────┐│
│  │  Node Backend   │        │  Python Runtime ││
│  │  Port: 3000     │───────→│  Port: 5000     ││
│  │                 │ HTTP   │                 ││
│  │ - Express app   │        │ - Flask server  ││
│  │ - Health check  │        │ - Health check  ││
│  │ - Predict API   │        │ - ML models     ││
│  └─────────────────┘        └─────────────────┘│
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## Services

### Service 1: Node Backend (node-backend)

**Purpose:** Express API server that bridges to ML runtime

**Configuration:**
- Container: `node-backend`
- Port: `3000` (exposed to host)
- Environment:
  - `PORT=3000`
  - `ML_RUNTIME_HOST=ml-runtime` (service name)
  - `ML_RUNTIME_PORT=5000`
  - `ML_RUNTIME_ENABLED=true`

**Health Check:**
- Endpoint: `GET http://localhost:3000/health`
- Interval: 30 seconds
- Timeout: 10 seconds
- Retries: 3

**Endpoints:**
```
GET  /health              — Server health check
GET  /ml-runtime/status   — ML Runtime connectivity status
GET  /ml-runtime/health   — ML Runtime health check
POST /predict             — Make prediction request
```

### Service 2: Python ML Runtime (ml-runtime)

**Purpose:** Flask server with ML prediction models

**Configuration:**
- Container: `ml-runtime`
- Port: `5000` (exposed to host)
- Environment:
  - `PYTHONUNBUFFERED=1`
  - `PYTHONDONTWRITEBYTECODE=1`

**Health Check:**
- Endpoint: `GET http://localhost:5000/health`
- Interval: 30 seconds
- Timeout: 10 seconds
- Retries: 3

**Endpoints:**
```
GET  /health              — Runtime health check
GET  /readiness           — Readiness check
GET  /status-summary      — Status summary
POST /predict             — Make prediction
POST /evaluate-summary    — Evaluate dataset
```

---

## Files Created

### 1. backend/server.js
**Simple Express server** that:
- Provides HTTP API for predictions
- Imports `mlRuntimeClient.js` from functions
- Connects to Python runtime via ML_RUNTIME_HOST
- Provides health/status endpoints

**Key Features:**
- CORS enabled
- JSON request/response
- Error handling
- Graceful shutdown
- Startup logging

### 2. backend/package.json
**Dependencies:**
- `express` — Web framework
- `cors` — CORS middleware
- `dotenv` — Environment variables
- `node-fetch` — HTTP client (for mlRuntimeClient)

### 3. backend/Containerfile
**Build Node backend as container**
- Base: `node:20-slim`
- Copies backend code
- Installs dependencies
- Health check configured
- Exposes port 3000

### 4. docker-compose.yml
**Multi-service orchestration**
- Two services: `backend` and `ml-runtime`
- Shared network: `ml-network`
- Environment variables
- Health checks
- Logging configured
- Restart policies

---

## Quick Start

### Prerequisites

```bash
# Install Podman (if not already installed)
# macOS: brew install podman
# Linux: sudo apt install podman
# Windows: Follow official Podman documentation

# Verify Podman is installed
podman --version

# Install podman-compose
pip install podman-compose
```

### Start Services

```bash
# Navigate to project root
cd /path/to/Evidence\ výdajů

# Start all services (builds images if needed)
podman-compose up

# Or start in background
podman-compose up -d

# Or rebuild and start
podman-compose up --build
```

### View Logs

```bash
# Follow all logs
podman-compose logs -f

# Follow specific service logs
podman-compose logs -f backend
podman-compose logs -f ml-runtime

# View last 100 lines
podman-compose logs --tail 100
```

### Test Services

```bash
# Test backend health
curl http://localhost:3000/health

# Test ML Runtime connectivity
curl http://localhost:3000/ml-runtime/status

# Test ML Runtime health
curl http://localhost:3000/ml-runtime/health

# Make prediction
curl -X POST http://localhost:3000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "test-user-123",
    "pipelineLevel": "L1",
    "modelVersion": "1.0",
    "transactions": [],
    "income": 5000
  }'
```

### Stop Services

```bash
# Stop all services (keep volumes)
podman-compose down

# Stop and remove volumes
podman-compose down -v

# Stop specific service
podman-compose stop backend
podman-compose stop ml-runtime
```

### Restart Services

```bash
# Restart all
podman-compose restart

# Restart specific service
podman-compose restart backend
podman-compose restart ml-runtime
```

---

## Network Communication

### Service-to-Service Communication

**Backend → ML Runtime:**
```
Backend container resolves `ml-runtime:5000` via Docker DNS
↓
Connects to Python runtime
↓
Makes HTTP requests to /predict, /health, etc.
```

**Key Points:**
- Services communicate via service name (not localhost)
- Network: `ml-network` (bridge network)
- Port 5000 is internal (not exposed to host, only via backend)
- Port 3000 is exposed for external access

### External Access

**From Host Machine:**
```
curl http://localhost:3000/predict
↓
Node backend receives request
↓
Backend connects to ml-runtime:5000 (service network)
↓
Python runtime processes
↓
Response back to backend
↓
Backend returns to host
```

---

## Environment Variables

### Backend Service

```bash
NODE_ENV=development          # Node environment
PORT=3000                     # Backend port
ML_RUNTIME_HOST=ml-runtime    # Service name (not 127.0.0.1!)
ML_RUNTIME_PORT=5000          # Runtime port
ML_RUNTIME_ENABLED=true       # Enable runtime calls
```

### Python Runtime Service

```bash
PYTHONUNBUFFERED=1           # No output buffering
PYTHONDONTWRITEBYTECODE=1    # No .pyc files
```

### Custom Configuration

Create `.env` file in project root:

```bash
# backend/.env (not needed, uses docker-compose.yml env)
# ml-runtime/.env (if Python runtime needs config)
```

---

## Health Checks

### Backend Health Check

```
Endpoint: GET http://localhost:3000/health
Response: {
  "status": "healthy",
  "service": "node-backend",
  "timestamp": "2026-06-07T20:58:05.000Z"
}
```

### ML Runtime Health Check

```
Endpoint: GET http://localhost:3000/ml-runtime/health
Response: {
  "status": "healthy",
  "mlRuntime": {
    "healthy": true,
    "url": "http://ml-runtime:5000"
  },
  "timestamp": "2026-06-07T20:58:05.000Z"
}
```

### Service Readiness

Docker Compose monitors health checks:
- Services must pass health check before becoming "healthy"
- Backend waits for ml-runtime to be healthy before starting
- If service fails health check repeatedly, it restarts

---

## Logging

### Log Levels

Each service logs to stderr/stdout:

**Backend:**
```
[STARTUP] Node Server starting on port 3000
[STARTUP] ML Runtime URL: http://ml-runtime:5000
[STARTUP] ML Runtime is reachable
```

**Python Runtime:**
```
[CONTAINER-STARTUP] Flask server started
[CONTAINER] Request received: POST /predict
[CONTAINER] Response returned: status=200
```

### View Logs

```bash
# All services
podman-compose logs

# Specific service
podman-compose logs backend
podman-compose logs ml-runtime

# Follow in real-time
podman-compose logs -f

# Last 50 lines
podman-compose logs --tail 50

# Search in logs
podman-compose logs | grep "ERROR"
```

---

## Troubleshooting

### Services Won't Start

```bash
# Check if ports are already in use
lsof -i :3000  # Backend port
lsof -i :5000  # Runtime port

# Kill process using port (if needed)
kill -9 <PID>

# Try building fresh
podman-compose down
podman-compose up --build
```

### Backend Can't Connect to Runtime

```bash
# Check ML Runtime is running
podman-compose logs ml-runtime

# Check health check
podman-compose ps
# Status should be "healthy"

# Test from backend
podman-compose exec backend curl http://ml-runtime:5000/health
```

### Network Issues

```bash
# Verify network exists
podman network ls

# Inspect network
podman network inspect ml-network

# Reconnect services to network
podman-compose down
podman-compose up --force-recreate
```

### Container Exit Code Errors

```bash
# View exit code
podman-compose ps

# Check logs for error
podman-compose logs --tail 50 <service-name>

# Rebuild and restart
podman-compose down
podman-compose up --build
```

---

## File Structure

```
Evidence výdajů/
├── docker-compose.yml              ← Orchestration (FÁZA 6.2A)
├── backend/                        ← Node backend (FÁZA 6.2A)
│   ├── Containerfile              ← Container image
│   ├── package.json               ← Dependencies
│   └── server.js                  ← Express server
├── ml-runtime/                     ← Python runtime (FÁZA 6.0A)
│   ├── Containerfile              ← Container image
│   ├── app.py                     ← Flask server
│   ├── requirements.txt           ← Dependencies
│   └── ...
├── functions/
│   ├── mlRuntimeClient.js         ← Integration client (FÁZA 6.1A-6.1E)
│   ├── package.json               ← Firebase functions
│   └── ...
└── FAZE_6_2A_MULTI_SERVICE_SETUP.md  ← This guide
```

---

## What's Included

✅ **Node Backend Service**
- Express API server
- Health checks
- Connects to ML runtime
- Prediction endpoint

✅ **Python Runtime Service**
- Containerized from FÁZA 6.0A
- Health checks
- ML predictions
- Evaluation endpoints

✅ **Docker Compose Orchestration**
- Service networking
- Health check monitoring
- Environment variables
- Logging configuration
- Restart policies

✅ **Documentation**
- Quick start guide
- Troubleshooting
- Architecture diagram
- CLI commands

---

## What's NOT Included (Out of Scope)

❌ Kubernetes setup (planned later)  
❌ Production-grade monitoring  
❌ Training pipeline  
❌ UI integration  
❌ Database services  
❌ Message queues  
❌ Load balancing  
❌ SSL/TLS certificates  
❌ Secret management  

---

## Performance Notes

### Resource Limits

Current setup uses default Podman limits:
- Backend: Node.js typically uses 100-200MB RAM
- Runtime: Python typically uses 200-300MB RAM
- Total: ~500MB for both services

**Adjust if needed:**
```yaml
services:
  backend:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Startup Time

Expected startup times:
- Backend: ~2 seconds (depends on npm install)
- Runtime: ~3 seconds (depends on Python startup)
- Total: ~5-10 seconds to reach healthy state

---

## Summary

**FÁZA 6.2A:** ✅ **COMPLETE**

Minimal multi-service Podman setup created:

- ✅ Node.js Express backend service
- ✅ Python Flask ML runtime service
- ✅ Docker Compose orchestration
- ✅ Service networking (bridge network)
- ✅ Health checks for both
- ✅ Simple configuration
- ✅ No Kubernetes, no extras
- ✅ Full documentation

Node backend and Python runtime can now run together in Docker Compose/Podman with proper networking and health monitoring.

---

**Implementation Files:**
- `backend/server.js` — Node backend
- `backend/package.json` — Backend dependencies
- `backend/Containerfile` — Backend container image
- `docker-compose.yml` — Multi-service orchestration

**Status:** Complete and tested  
**Next:** FÁZA 6.2B (Advanced Podman setup) or production deployment

