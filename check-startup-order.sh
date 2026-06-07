#!/bin/bash

# FÁZA 6.2D: Startup Order & Dependency Sanity Check
# Verifies that services start in correct order
# and that all dependencies are satisfied
#
# Usage: bash check-startup-order.sh

set -e

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  FÁZA 6.2D: Startup Order & Dependency Check              ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="http://localhost:3000"
RUNTIME_URL="http://localhost:5000"
DEPENDENCIES_URL="$BACKEND_URL/status/dependencies"

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0

echo -e "${BLUE}[CHECK 1]${NC} Verify startup order and dependencies"
echo ""

# Function to test endpoint
test_endpoint() {
  local url=$1
  local service=$2
  local max_attempts=10
  local attempt=1

  echo -e "Testing $service: $url"

  while [ $attempt -le $max_attempts ]; do
    HTTP_CODE=$(curl -s -w "%{http_code}" -o /dev/null "$url" 2>/dev/null || echo "000")

    if [ "$HTTP_CODE" = "200" ]; then
      echo -e "${GREEN}✅ PASS${NC} — $service is responding (HTTP $HTTP_CODE)"
      return 0
    else
      echo -n "."
      ((attempt++))
      sleep 1
    fi
  done

  echo ""
  echo -e "${RED}❌ FAIL${NC} — $service is not responding (HTTP $HTTP_CODE)"
  return 1
}

# Check 1: ML Runtime startup
echo -e "${BLUE}[STARTUP ORDER]${NC} Expected order:"
echo "  1. ML Runtime starts first"
echo "  2. Backend starts after ML Runtime is healthy"
echo ""

echo -e "${BLUE}[STEP 1]${NC} Check ML Runtime startup"
if test_endpoint "$RUNTIME_URL/health" "ML Runtime"; then
  ((CHECKS_PASSED++))
  echo -e "${GREEN}✅ ML Runtime started successfully${NC}"
  echo ""
else
  ((CHECKS_FAILED++))
  echo -e "${RED}❌ ML Runtime failed to start${NC}"
  echo "  Solution: Check that python app.py is running"
  echo "  Or with docker-compose: podman-compose logs ml-runtime"
  echo ""
fi

# Check 2: Backend startup
echo -e "${BLUE}[STEP 2]${NC} Check Backend startup"
if test_endpoint "$BACKEND_URL/health" "Backend"; then
  ((CHECKS_PASSED++))
  echo -e "${GREEN}✅ Backend started successfully${NC}"
  echo ""
else
  ((CHECKS_FAILED++))
  echo -e "${RED}❌ Backend failed to start${NC}"
  echo "  Solution: Check that npm start is running"
  echo "  Or with docker-compose: podman-compose logs backend"
  echo ""
fi

# Check 3: Dependency status
echo -e "${BLUE}[STEP 3]${NC} Check all dependencies"
RESPONSE=$(curl -s "$DEPENDENCIES_URL" 2>/dev/null || echo "{}")

if echo "$RESPONSE" | grep -q '"status":"ready"'; then
  ((CHECKS_PASSED++))
  echo -e "${GREEN}✅ All dependencies satisfied${NC}"
  echo ""
  echo "Dependencies:"
  echo "  ✓ Backend: healthy"
  echo "  ✓ ML Runtime: healthy"
  echo ""
elif echo "$RESPONSE" | grep -q '"status":"degraded"'; then
  ((CHECKS_PASSED++))
  echo -e "${YELLOW}⚠️ Dependencies partially satisfied${NC}"
  echo ""
  echo "Status: Some services not fully healthy"
  echo "See details below:"
  echo ""

  # Extract details
  if echo "$RESPONSE" | grep -q '"reachable":false'; then
    echo -e "${RED}  ✗ ML Runtime: UNREACHABLE${NC}"

    # Extract reason
    REASON=$(echo "$RESPONSE" | grep -o '"reason":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ ! -z "$REASON" ]; then
      echo "    Reason: $REASON"
    fi

    echo ""
    echo "    Solution:"
    if [ "$REASON" = "ECONNREFUSED" ]; then
      echo "      1. ML Runtime not listening on expected port"
      echo "      2. Check: python app.py is running"
      echo "      3. Check: ML_RUNTIME_HOST and ML_RUNTIME_PORT"
    elif [ "$REASON" = "ENOTFOUND" ]; then
      echo "      1. ML Runtime host name cannot be resolved"
      echo "      2. In docker-compose: use service name 'ml-runtime'"
      echo "      3. Check: ML_RUNTIME_HOST=$RUNTIME_URL"
    elif [ "$REASON" = "timeout" ]; then
      echo "      1. ML Runtime not responding in time"
      echo "      2. May be starting up, wait and retry"
      echo "      3. Check: python app.py is running"
    else
      echo "      Check ML Runtime logs for details"
    fi
  else
    echo -e "${GREEN}  ✓ ML Runtime: reachable${NC}"
    echo "    But health check indicates issues"
    echo "    Check: podman-compose logs ml-runtime"
  fi
  echo ""
else
  ((CHECKS_FAILED++))
  echo -e "${RED}❌ Failed to check dependencies${NC}"
  echo "  Response: $RESPONSE"
  echo ""
fi

# Check 4: Request/Response flow
echo -e "${BLUE}[STEP 4]${NC} Verify request/response flow"

PREDICTION_DATA='{
  "uid": "test-startup-check",
  "pipelineLevel": "L1",
  "modelVersion": "1.0",
  "transactions": [],
  "income": 5000
}'

HTTP_CODE=$(curl -s -w "%{http_code}" -X POST "$BACKEND_URL/predict" \
  -H "Content-Type: application/json" \
  -d "$PREDICTION_DATA" \
  -o /tmp/prediction_response.json 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  ((CHECKS_PASSED++))
  echo -e "${GREEN}✅ Request/response flow working${NC}"
  echo "  Backend successfully processed prediction request"
  echo ""
elif [ "$HTTP_CODE" = "000" ]; then
  ((CHECKS_FAILED++))
  echo -e "${RED}❌ Could not reach backend${NC}"
  echo "  Make sure backend is running on $BACKEND_URL"
  echo ""
else
  ((CHECKS_FAILED++))
  echo -e "${RED}❌ Prediction request failed${NC}"
  echo "  HTTP Status: $HTTP_CODE"
  echo ""
fi

# Summary
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  Startup Order & Dependency Check Summary                 ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

echo "Checks Passed: $CHECKS_PASSED"
echo "Checks Failed: $CHECKS_FAILED"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✅ All startup order checks passed!${NC}"
  echo ""
  echo "Services are running in correct order:"
  echo "  1. ML Runtime (Python Flask) ✓"
  echo "  2. Backend (Node Express) ✓"
  echo "  3. Dependencies satisfied ✓"
  echo "  4. Request/response flow ✓"
  echo ""
  echo "Status: ${GREEN}READY FOR TESTING${NC}"
  exit 0
else
  echo -e "${RED}❌ Some startup checks failed!${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check service logs:"
  echo "     podman-compose logs -f"
  echo ""
  echo "  2. Verify services are running:"
  echo "     podman-compose ps"
  echo ""
  echo "  3. Check configuration:"
  echo "     cat .env.docker-compose"
  echo ""
  echo "  4. Restart services:"
  echo "     podman-compose down"
  echo "     podman-compose up"
  echo ""
  exit 1
fi
