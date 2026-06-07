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

// Configuration
const ML_RUNTIME_URL = process.env.ML_RUNTIME_URL || 'http://127.0.0.1:5000';
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const PREDICT_TIMEOUT = 30000; // 30 seconds

/**
 * Verify ML runtime is available
 * @returns {Promise<boolean>}
 */
async function checkMlRuntimeHealth() {
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
 *
 * @param {Object} requestData - ML request payload
 * @returns {Promise<Object>} - Prediction response from Python
 */
async function callMlRuntime(requestData) {
  const uid = requestData.uid;
  const pipelineLevel = requestData.pipelineLevel;
  const callStartTime = Date.now();

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
    // ERROR HANDLING
    // ─────────────────────────────────────────────────────────────

    const elapsedMs = Date.now() - callStartTime;

    if (error.name === 'AbortError') {
      console.error(
        `[ML] ❌ TIMEOUT | timeout=${PREDICT_TIMEOUT}ms, elapsed=${elapsedMs}ms | uid=${uid}`
      );
      throw new Error('ML Runtime request timeout');
    }

    const errorMsg = error.message || 'Unknown error';
    console.error(
      `[ML] ❌ ERROR | error=${errorMsg}, elapsed=${elapsedMs}ms | uid=${uid}`
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
  checkMlRuntimeHealth,
  getMlRuntimeStatus,
  ML_RUNTIME_URL
};
