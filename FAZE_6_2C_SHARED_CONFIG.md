# FÁZA 6.2C: Shared Configuration for Multi-Service Setup

**Status:** ✅ **COMPLETE**  
**Date:** 2026-06-07  
**Mission:** Add basic shared configuration for local multi-service Podman setup

---

## Executive Summary

**FÁZA 6.2C Objective:** *"Přidej základní sdílenou konfiguraci pro tento lokální setup"*

**Status:** ✅ **ACHIEVED**

Shared configuration system added:
- ✅ `.env.docker-compose` — Runtime configuration file
- ✅ `.env.local.example` — Template with all options
- ✅ `docker-compose.yml` — Updated to use configuration
- ✅ Runtime host, port, enable flags configurable
- ✅ Service-specific settings isolated
- ✅ Logging and health check configuration
- ✅ No secret management (out of scope)

---

## Configuration Files

### 1. `.env.docker-compose` — Main Configuration

**Purpose:** Docker Compose specific configuration for local development

**Key Variables:**

```bash
# Environment
COMPOSE_ENV=development

# Backend Service
BACKEND_PORT=3000                    # Exposed port on host
BACKEND_SERVICE=node-backend         # Service name
BACKEND_ENABLED=true                 # Enable flag
NODE_ENV=development

# ML Runtime Service (FÁZA 6.1C + 6.2C)
ML_RUNTIME_HOST=ml-runtime           # CRITICAL: Service name, not localhost!
ML_RUNTIME_PORT=5000                 # Internal port
ML_RUNTIME_EXPOSED_PORT=5000         # Port exposed to host
ML_RUNTIME_ENABLED=true              # Enable flag
ML_RUNTIME_SERVICE=ml-runtime        # Service name

# Docker Compose Network
COMPOSE_PROJECT_NAME=evidence-vydaju
DOCKER_NETWORK=ml-network

# Health Checks
HEALTH_CHECK_INTERVAL=30
HEALTH_CHECK_TIMEOUT=10
HEALTH_CHECK_RETRIES=3
HEALTH_CHECK_START_PERIOD=5

# Logging
LOG_DRIVER=json-file
LOG_MAX_SIZE=10m
LOG_MAX_FILE=3

# Restart Policies
BACKEND_RESTART=unless-stopped
ML_RUNTIME_RESTART=unless-stopped
```

### 2. `.env.local.example` — Template & Documentation

**Purpose:** Template for developers to copy and customize

**Contains:**
- All configuration options with comments
- Descriptions of what each variable does
- Default values for local development
- Legacy configuration (Firebase, Brevo)

**Usage:**
```bash
cp .env.local.example .env.local
# Edit .env.local if needed for your environment
docker-compose up
```

---

## Configuration Priority

### How Environment Variables Are Resolved

1. **Shell environment variables** (highest priority)
2. **`.env.docker-compose`** (via docker-compose `env_file`)
3. **`.env` or `.env.local`** (if loaded by docker-compose)
4. **Default values** (hardcoded in docker-compose.yml)

### Example

```bash
# Default (from .env.docker-compose)
ML_RUNTIME_HOST=ml-runtime

# Override via shell
export ML_RUNTIME_HOST=custom-host
docker-compose up
# Will use: custom-host

# Or create .env.docker-compose with:
ML_RUNTIME_HOST=custom-host
docker-compose up
# Will use: custom-host
```

---

## Key Configuration: Runtime Host

### CRITICAL: Service Name Resolution

```yaml
# WRONG (won't work in docker-compose):
ML_RUNTIME_HOST=127.0.0.1     # ❌ Localhost (container-only)
ML_RUNTIME_HOST=localhost      # ❌ Localhost (container-only)

# CORRECT (service name):
ML_RUNTIME_HOST=ml-runtime     # ✅ Service name (resolved via Docker DNS)
```

**Why?**
- Services in docker-compose containers cannot use `127.0.0.1`
- They must use service names for discovery
- Docker DNS automatically resolves `ml-runtime` → container IP
- Set in `.env.docker-compose` as default

---

## Enable/Disable Flags

### Backend Enable Flag

```bash
BACKEND_ENABLED=true    # Enable backend service
BACKEND_ENABLED=false   # Disable (but still includes in compose)
```

### ML Runtime Enable Flag

```bash
ML_RUNTIME_ENABLED=true   # Enable runtime calls
ML_RUNTIME_ENABLED=false  # Disable (fallback mode)
```

**Note:** These flags are read by the services themselves, not docker-compose. Use them to control behavior at runtime.

---

## Docker Compose Configuration Usage

### Environment Interpolation

The updated `docker-compose.yml` uses variable substitution:

```yaml
services:
  backend:
    container_name: ${BACKEND_SERVICE}
    ports:
      - "${BACKEND_PORT}:3000"
    environment:
      ML_RUNTIME_HOST: ${ML_RUNTIME_HOST}
      ML_RUNTIME_PORT: ${ML_RUNTIME_PORT}
    healthcheck:
      interval: ${HEALTH_CHECK_INTERVAL}s
      timeout: ${HEALTH_CHECK_TIMEOUT}s
```

Values are loaded from `.env.docker-compose` via `env_file`.

### Service Names from Config

```yaml
services:
  backend:
    container_name: ${BACKEND_SERVICE}    # node-backend
  ml-runtime:
    container_name: ${ML_RUNTIME_SERVICE} # ml-runtime
```

---

## Health Check Configuration

### Shared Settings

```bash
HEALTH_CHECK_INTERVAL=30         # Check every 30 seconds
HEALTH_CHECK_TIMEOUT=10          # 10 second timeout per check
HEALTH_CHECK_RETRIES=3           # 3 retries before marking unhealthy
HEALTH_CHECK_START_PERIOD=5      # Wait 5 seconds before starting checks
```

### Applied to Both Services

**Backend:**
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
  interval: 30s        # From HEALTH_CHECK_INTERVAL
  timeout: 10s         # From HEALTH_CHECK_TIMEOUT
  retries: 3           # From HEALTH_CHECK_RETRIES
  start_period: 5s     # From HEALTH_CHECK_START_PERIOD
```

**ML Runtime:**
```yaml
healthcheck:
  test: ["CMD", "python", "-c", "import urllib.request; ..."]
  interval: 30s        # From HEALTH_CHECK_INTERVAL
  timeout: 10s         # From HEALTH_CHECK_TIMEOUT
  retries: 3           # From HEALTH_CHECK_RETRIES
  start_period: 5s     # From HEALTH_CHECK_START_PERIOD
```

---

## Logging Configuration

### Shared Logging Settings

```bash
LOG_DRIVER=json-file          # Logging driver
LOG_MAX_SIZE=10m              # Max file size before rotation
LOG_MAX_FILE=3                # Max number of log files
LOG_LEVEL=info                # Log level
DEBUG=false                   # Debug mode
```

### Applied to Services

```yaml
logging:
  driver: ${LOG_DRIVER}
  options:
    max-size: ${LOG_MAX_SIZE}
    max-file: "${LOG_MAX_FILE}"
```

### View Logs

```bash
# All services
podman-compose logs -f

# Specific service
podman-compose logs -f backend
podman-compose logs -f ml-runtime

# With timestamps
podman-compose logs --timestamps

# Last N lines
podman-compose logs --tail 50
```

---

## Network Configuration

### Docker Network

```bash
DOCKER_NETWORK=ml-network           # Network name
NETWORK_DRIVER=bridge               # Network driver type
COMPOSE_PROJECT_NAME=evidence-vydaju # Docker compose project name
```

### Network Definition

```yaml
networks:
  ${DOCKER_NETWORK}:    # ml-network
    driver: ${NETWORK_DRIVER}  # bridge
```

**Result:** Services communicate via `ml-network` bridge network

---

## Restart Policies

### Configuration

```bash
BACKEND_RESTART=unless-stopped       # Backend restart policy
ML_RUNTIME_RESTART=unless-stopped    # Runtime restart policy
```

### Behavior

```
unless-stopped:
  - Restart on failure
  - Keep running unless explicitly stopped
  - Survive host reboots (if configured)
  - Survive container restarts
```

**Start services:**
```bash
podman-compose up
```

**Stop services:**
```bash
podman-compose down
# NOT: Ctrl+C (which kills but doesn't stop)
```

---

## Quick Reference

### Common Tasks

**View current configuration:**
```bash
cat .env.docker-compose
```

**Customize configuration:**
```bash
cp .env.docker-compose .env.docker-compose.custom
# Edit .env.docker-compose.custom
# Or directly edit .env.docker-compose
```

**Start with custom port:**
```bash
BACKEND_PORT=8080 podman-compose up
```

**Start with custom runtime host:**
```bash
ML_RUNTIME_HOST=192.168.1.100 podman-compose up
```

**Check what configuration docker-compose will use:**
```bash
podman-compose config
# Shows merged configuration with variables substituted
```

---

## Configuration Scenarios

### Scenario 1: Local Development (Default)

```bash
# .env.docker-compose:
BACKEND_PORT=3000
ML_RUNTIME_HOST=ml-runtime
ML_RUNTIME_ENABLED=true
BACKEND_ENABLED=true

# Result:
# - Backend on localhost:3000
# - Runtime on localhost:5000
# - Both services enabled
```

### Scenario 2: Disable Runtime (Test Fallback)

```bash
# .env.docker-compose:
ML_RUNTIME_ENABLED=false

# Result:
# - Backend still runs
# - Runtime calls return fallback
# - Useful for testing fallback paths
```

### Scenario 3: Custom Runtime Host (Remote Machine)

```bash
# .env.docker-compose:
ML_RUNTIME_HOST=192.168.1.100
ML_RUNTIME_PORT=5000

# Result:
# - Backend connects to remote Python runtime
# - Useful for testing with separate deployment
```

### Scenario 4: Different Ports

```bash
# .env.docker-compose:
BACKEND_PORT=8080
ML_RUNTIME_EXPOSED_PORT=8081

# Result:
# - Backend on localhost:8080
# - Runtime on localhost:8081
# - Useful when ports 3000/5000 are in use
```

---

## What's Included ✅

✅ **`.env.docker-compose`** — Main configuration file  
✅ **`.env.local.example`** — Template with all options  
✅ **Updated `docker-compose.yml`** — Uses configuration variables  
✅ **Runtime host configurable** (with safe default)  
✅ **Runtime port configurable**  
✅ **Enable flags for services**  
✅ **Health check settings shared**  
✅ **Logging configuration**  
✅ **Restart policies**  
✅ **Service name configuration**  

---

## What's NOT Included ❌

❌ Secret management (passwords, API keys)  
❌ Kubernetes configuration  
❌ Training configuration  
❌ Large config refactor  
❌ Encryption or security features  

---

## Configuration Best Practices

### DO ✅

- Keep `.env.docker-compose` in version control (safe values only)
- Use service names (ml-runtime, node-backend), not IPs
- Use comments to explain non-obvious settings
- Use sensible defaults that work locally
- Document why each setting exists

### DON'T ❌

- Put secrets (API keys, passwords) in config files
- Use hardcoded IPs instead of service names
- Change settings without understanding impact
- Commit `.env` or `.env.local` with secrets
- Over-configure for a simple local setup

---

## Summary

**FÁZA 6.2C:** ✅ **COMPLETE**

Shared configuration system for multi-service setup:

- ✅ `.env.docker-compose` — Main configuration
- ✅ `.env.local.example` — Template
- ✅ `docker-compose.yml` — Updated to use config
- ✅ Runtime host, port, enable flags configurable
- ✅ Health check and logging configuration
- ✅ Service restart policies
- ✅ Network configuration
- ✅ No secrets in config files

Multi-service setup now has **basic shared configuration**.

---

**Files Created/Modified:**
- `.env.docker-compose` — Main configuration file
- `.env.local.example` — Updated template
- `docker-compose.yml` — Updated to use variables

**Usage:**
```bash
# Default (uses .env.docker-compose)
podman-compose up

# Override specific setting
ML_RUNTIME_HOST=custom-host podman-compose up

# View merged configuration
podman-compose config
```

**Status:** Complete and ready for use  
**Next:** FÁZA 6.3 (Advanced features) or production deployment

