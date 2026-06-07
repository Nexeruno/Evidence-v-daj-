/**
 * FÁZE 5.0A: ML Runtime HTTP Client
 * Bridges Node/Firebase layer with external Python runtime
 *
 * This client:
 * - Calls external Python server at http://127.0.0.1:5000
 * - Sends ML pipeline requests
 * - Receives predictions and metadata
 * - Handles errors with readable messages
 */

const fetch = require('node-fetch');

// ═══════════════════════════════════════════════════════════════════════════════
// FÁZA 6.1C: Configuration — Host, Port, Enable Flag
// ═══════════════════════════════════════════════════════════════════════════════

// Runtime Location (configurable via environment variables)
const ML_RUNTIME_HOST = process.env.ML_RUNTIME_HOST || '127.0.0.1';
const ML_RUNTIME_PORT = process.env.ML_RUNTIME_PORT || '5000';
const ML_RUNTIME_ENABLED = process.env.ML_RUNTIME_ENABLED !== 'false'; // Default: true

// Backward compatible URL construction
const ML_RUNTIME_URL = process.env.ML_RUNTIME_URL || `http://${ML_RUNTIME_HOST}:${ML_RUNTIME_PORT}`;

// Timeouts
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const PREDICT_TIMEOUT = 30000; // 30 seconds

/**
 * Verify ML runtime is available
 * FÁZA 6.1C: Checks if runtime is enabled before attempting connection
 * @returns {Promise<boolean>}
 */
async function checkMlRuntimeHealth() {
  // FÁZA 6.1C: Return false if runtime disabled
  if (!ML_RUNTIME_ENABLED) {
    console.log(`⚠️ ML Runtime disabled (ML_RUNTIME_ENABLED=${ML_RUNTIME_ENABLED})`);
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${ML_RUNTIME_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`ML Runtime health check failed: ${response.status}`);
      return false;
    }

    const data = await response.json();
    const isHealthy = data.status === 'healthy' && data.service === 'ml-runtime';

    if (isHealthy) {
      console.log(`✅ ML Runtime is healthy (${ML_RUNTIME_URL})`);
    } else {
      console.error(`⚠️ ML Runtime returned unhealthy status: ${JSON.stringify(data)}`);
    }

    return isHealthy;
  } catch (error) {
    console.error(`ML Runtime health check error: ${error.message}`);
    return false;
  }
}

/**
 * Send prediction request to external Python runtime
 * FÁZE 5.0E: With structured logging for external Python call flow
 * FÁZE 6.1B: With fallback behavior when runtime unavailable
 *
 * @param {Object} requestData - ML request payload
 * @param {Object} options - Options (includesFallback: whether to return fallback or throw)
 * @returns {Promise<Object>} - Prediction response from Python or fallback
 */
async function callMlRuntime(requestData, options = {}) {
  const uid = requestData.uid;
  const pipelineLevel = requestData.pipelineLevel;
  const callStartTime = Date.now();
  const allowFallback = options.allowFallback !== false; // Default: allow fallback

  // ─────────────────────────────────────────────────────────────
  // FÁZA 6.1C: CHECK RUNTIME ENABLED
  // ─────────────────────────────────────────────────────────────

  if (!ML_RUNTIME_ENABLED) {
    console.warn(`[ML] ⚠️ DISABLED | ML_RUNTIME_ENABLED=false | uid=${uid}`);
    const elapsedMs = Date.now() - callStartTime;
    if (allowFallback) {
      return {
        status: 'fallback',
        uid: uid,
        reason: 'runtime_disabled',
        message: 'ML Runtime is disabled',
        fallback: {
          predictedExpense: null,
          confidence: 0.0,
          confidenceFactors: {
            dataFrequency: 0,
            transactionCount: 0,
            expenseRatio: 0,
            incomeConstraint: 0
          }
        },
        debugMetadata: {
          processingTimeMs: elapsedMs,
          fallbackReason: 'runtime_disabled',
          timestamp: new Date().toISOString()
        }
      };
    }
    throw new Error('ML Runtime is disabled');
  }

  // ─────────────────────────────────────────────────────────────
  // STAGE 1: VALIDATE REQUEST CONTRACT
  // ─────────────────────────────────────────────────────────────

  const requiredFields = ['uid', 'pipelineLevel', 'modelVersion'];
  for (const field of requiredFields) {
    if (!requestData[field]) {
      console.error(`[ML] ❌ REQUEST VALIDATION FAILED: ${field} | uid=${uid}`);
      throw new Error(`Missing required field: ${field}`);
    }
  }

  console.log(
    `[ML] ✅ REQUEST VALIDATED | uid=${uid}, pipeline=${pipelineLevel}, txns=${requestData.transactions?.length || 0}`
  );

  try {
    // ─────────────────────────────────────────────────────────────
    // STAGE 2: SEND REQUEST
    // ─────────────────────────────────────────────────────────────

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PREDICT_TIMEOUT);

    console.log(`[ML] 📤 REQUEST SENT | url=${ML_RUNTIME_URL}/predict | uid=${uid}`);

    const response = await fetch(`${ML_RUNTIME_URL}/predict`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Node-Firebase-ML-Client/5.0.0'
      },
      body: JSON.stringify(requestData)
    });

    clearTimeout(timeoutId);

    const httpStatus = response.status;
    const elapsedMs = Date.now() - callStartTime;

    // ─────────────────────────────────────────────────────────────
    // STAGE 3: RECEIVE RESPONSE
    // ─────────────────────────────────────────────────────────────

    const data = await response.json();

    console.log(
      `[ML] 📥 RESPONSE RECEIVED | status=${httpStatus}, elapsed=${elapsedMs}ms | uid=${uid}`
    );

    if (!response.ok) {
      console.error(
        `[ML] ❌ HTTP ERROR | status=${httpStatus}, error=${data.error} | uid=${uid}`
      );
      throw new Error(data.error || `HTTP ${httpStatus}`);
    }

    // ─────────────────────────────────────────────────────────────
    // STAGE 4: VALIDATE RESPONSE CONTRACT
    // ─────────────────────────────────────────────────────────────

    if (data.status !== 'success') {
      console.error(
        `[ML] ❌ RESPONSE VALIDATION FAILED: status=${data.status} | uid=${uid}`
      );
      throw new Error(data.error || 'Prediction failed');
    }

    if (!data.predictions || !Array.isArray(data.predictions)) {
      console.error(
        `[ML] ❌ RESPONSE VALIDATION FAILED: missing predictions | uid=${uid}`
      );
      throw new Error('Invalid response: missing predictions array');
    }

    // ─────────────────────────────────────────────────────────────
    // STAGE 5: SUCCESS
    // ─────────────────────────────────────────────────────────────

    const confidence = data.predictions[0]?.confidence || 0;
    const processingTimeMs = data.debugMetadata?.processingTimeMs || 0;
    const totalTimeMs = Date.now() - callStartTime;

    console.log(
      `[ML] ✅ SUCCESS | uid=${uid}, confidence=${confidence}, python_time=${processingTimeMs}ms, total_time=${totalTimeMs}ms`
    );

    return data;

  } catch (error) {
    // ─────────────────────────────────────────────────────────────
    // ERROR HANDLING - FÁZE 5.0F: Structured error detection
    // ─────────────────────────────────────────────────────────────

    const elapsedMs = Date.now() - callStartTime;
    let errorType = 'UNKNOWN';
    let errorMsg = error.message || 'Unknown error';
    let friendlyMsg = 'ML Runtime error';

    // ──────────────────────────────────────────────────────────
    // ERROR TYPE DETECTION
    // ──────────────────────────────────────────────────────────

    if (error.name === 'AbortError') {
      errorType = 'TIMEOUT';
      errorMsg = 'Request timeout';
      friendlyMsg = `ML Runtime did not respond within ${PREDICT_TIMEOUT}ms`;
      console.error(
        `[ML] ❌ TIMEOUT | timeout=${PREDICT_TIMEOUT}ms, elapsed=${elapsedMs}ms | uid=${uid}`
      );
    } else if (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('Connection refused') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('getaddrinfo')
    ) {
      errorType = 'UNAVAILABLE';
      errorMsg = 'Python runtime not available';
      friendlyMsg = `ML Runtime unavailable at ${ML_RUNTIME_URL}. Ensure Python server is running on localhost:5000`;
      console.error(
        `[ML] ❌ UNAVAILABLE | reason=${error.message}, elapsed=${elapsedMs}ms | uid=${uid}`
      );

      // FÁZE 6.1B: Return fallback response if allowed
      if (allowFallback) {
        console.warn(`[ML] ⚠️ FALLBACK | uid=${uid}, returning fallback status`);
        return {
          status: 'fallback',
          uid: uid,
          reason: 'runtime_unavailable',
          message: 'ML Runtime unavailable - using fallback response',
          fallback: {
            predictedExpense: null,
            confidence: 0.0,
            confidenceFactors: {
              dataFrequency: 0,
              transactionCount: 0,
              expenseRatio: 0,
              incomeConstraint: 0
            }
          },
          debugMetadata: {
            processingTimeMs: elapsedMs,
            fallbackReason: 'runtime_not_available',
            timestamp: new Date().toISOString()
          }
        };
      }
    } else if (
      error.message.includes('Invalid response') ||
      error.message.includes('missing predictions')
    ) {
      errorType = 'INVALID_RESPONSE';
      errorMsg = 'Python returned invalid response';
      friendlyMsg = `ML Runtime response format error: ${error.message}`;
      console.error(
        `[ML] ❌ INVALID_RESPONSE | reason=${error.message}, elapsed=${elapsedMs}ms | uid=${uid}`
      );
    } else if (error.message.includes('HTTP')) {
      errorType = 'HTTP_ERROR';
      friendlyMsg = `ML Runtime HTTP error: ${error.message}`;
      console.error(
        `[ML] ❌ HTTP_ERROR | reason=${error.message}, elapsed=${elapsedMs}ms | uid=${uid}`
      );
    } else if (error.message.includes('SyntaxError')) {
      errorType = 'PARSE_ERROR';
      errorMsg = 'Failed to parse Python response';
      friendlyMsg = 'ML Runtime returned malformed JSON';
      console.error(
        `[ML] ❌ PARSE_ERROR | reason=${error.message}, elapsed=${elapsedMs}ms | uid=${uid}`
      );
    } else if (error.message.includes('Prediction failed')) {
      errorType = 'PREDICTION_ERROR';
      errorMsg = 'Python prediction failed';
      friendlyMsg = `ML prediction error: ${error.message}`;
      console.error(
        `[ML] ❌ PREDICTION_ERROR | reason=${error.message}, elapsed=${elapsedMs}ms | uid=${uid}`
      );
    } else {
      // Generic error
      errorType = 'GENERIC';
      friendlyMsg = `ML Runtime error: ${errorMsg}`;
      console.error(
        `[ML] ❌ ERROR | type=${errorType}, reason=${errorMsg}, elapsed=${elapsedMs}ms | uid=${uid}`
      );
    }

    // ──────────────────────────────────────────────────────────
    // THROW STRUCTURED ERROR
    // ──────────────────────────────────────────────────────────

    const structuredError = new Error(friendlyMsg);
    structuredError.errorType = errorType;
    structuredError.originalError = errorMsg;
    structuredError.elapsed = elapsedMs;
    structuredError.uid = uid;

    throw structuredError;
  }
}

/**
 * FÁZE 5.4A: Call evaluation endpoint for dataset analysis
 * @param {Object} requestData - Evaluation request payload
 * @returns {Promise<Object>} - Evaluation summary response
 */
async function callEvaluateSummary(requestData) {
  const uid = requestData.uid;
  const pipelineLevel = requestData.pipelineLevel;
  const callStartTime = Date.now();

  console.log(
    `[EVAL] 📊 EVALUATION STARTED | uid=${uid}, txns=${requestData.transactions?.length || 0}`
  );

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PREDICT_TIMEOUT);

    const response = await fetch(`${ML_RUNTIME_URL}/evaluate-summary`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Node-Firebase-ML-Client/5.0.0'
      },
      body: JSON.stringify(requestData)
    });

    clearTimeout(timeoutId);

    const httpStatus = response.status;
    const elapsedMs = Date.now() - callStartTime;

    const data = await response.json();

    if (!response.ok) {
      console.error(`[EVAL] ❌ HTTP ERROR | status=${httpStatus}, error=${data.error} | uid=${uid}`);
      throw new Error(data.error || `HTTP ${httpStatus}`);
    }

    if (data.status !== 'success') {
      console.error(`[EVAL] ❌ EVALUATION FAILED | status=${data.status} | uid=${uid}`);
      throw new Error(data.error || 'Evaluation failed');
    }

    const summary = data.evaluation || {};
    const verdict = summary.readiness?.verdict || 'unknown';
    const totalRows = summary.summary?.total_row_count || 0;
    const validRows = summary.summary?.valid_result_count || 0;

    console.log(
      `[EVAL] ✅ SUCCESS | uid=${uid}, verdict=${verdict}, rows=${totalRows}, valid=${validRows}, elapsed=${elapsedMs}ms`
    );

    return data;

  } catch (error) {
    const elapsedMs = Date.now() - callStartTime;
    console.error(
      `[EVAL] ❌ ERROR | uid=${uid}, error=${error.message}, elapsed=${elapsedMs}ms`
    );
    throw error;
  }
}

/**
 * Get ML runtime status
 * @returns {Promise<Object>} - Runtime status and capabilities
 */
async function getMlRuntimeStatus() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${ML_RUNTIME_URL}/status`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Failed to get ML runtime status: ${error.message}`);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRACT DEFINITIONS (for documentation)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * ML Runtime Request Contract
 *
 * Required fields:
 * - uid (string): User ID
 * - pipelineLevel (string): "L1" | "L2" | "L3"
 * - modelVersion (string): Semantic version "1.0.0"
 *
 * Optional fields:
 * - transactions (array): User transaction history
 * - income (number): User income
 * - debugMode (boolean): Enable debug output
 *
 * Example:
 * {
 *   "uid": "user-123",
 *   "pipelineLevel": "L1",
 *   "modelVersion": "1.0",
 *   "transactions": [
 *     { "category": "food", "amount": 50.00, "date": "2026-06-01" },
 *     { "category": "transport", "amount": 25.00, "date": "2026-06-02" }
 *   ],
 *   "income": 5000.00,
 *   "debugMode": false
 * }
 */

/**
 * ML Runtime Response Contract
 *
 * Success response (status: 200):
 * {
 *   "status": "success",
 *   "uid": "user-123",
 *   "pipelineLevel": "L1",
 *   "modelVersion": "1.0",
 *   "processedAt": "2026-06-07T15:30:00.000Z",
 *   "predictions": [
 *     {
 *       "period": "2026-06",
 *       "totalPredictedExpense": 3500.00,
 *       "confidence": 0.87,
 *       "categories": {
 *         "food": 1200.00,
 *         "transport": 800.00,
 *         "entertainment": 500.00
 *       },
 *       "dataPoints": 45,
 *       "pipelineLevel": "L1"
 *     }
 *   ],
 *   "error": null,
 *   "debugMetadata": {
 *     "processingTimeMs": 125,
 *     "pythonRuntime": "3.9",
 *     "frameworkVersion": "Flask/1.1.2"
 *   }
 * }
 *
 * Error response (status: 400/500):
 * {
 *   "status": "failed",
 *   "error": "Missing required field: uid",
 *   "uid": null,
 *   "debugMetadata": {
 *     "processingTimeMs": 5
 *   }
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  callMlRuntime,
  callEvaluateSummary,
  checkMlRuntimeHealth,
  getMlRuntimeStatus,
  ML_RUNTIME_URL,
  ML_RUNTIME_HOST,
  ML_RUNTIME_PORT,
  ML_RUNTIME_ENABLED
};
