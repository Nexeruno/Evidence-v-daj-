/**
 * FÁZA 6.2A: Simple Node.js Backend Server
 *
 * Bridges Firebase Functions logic with Podman Python ML Runtime
 * Runs locally for testing and development
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

// Import ML Runtime client
const mlRuntimeClient = require('../functions/mlRuntimeClient');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5176'],
  credentials: true
}));
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH & STATUS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'node-backend',
    timestamp: new Date().toISOString()
  });
});

/**
 * ML Runtime status endpoint
 */
app.get('/ml-runtime/status', async (req, res) => {
  try {
    const connectivity = await mlRuntimeClient.checkMlRuntimeConnectivity();
    res.json({
      status: 'ok',
      mlRuntime: {
        reachable: connectivity.reachable,
        host: connectivity.host,
        port: connectivity.port,
        reason: connectivity.reason || null,
        url: mlRuntimeClient.ML_RUNTIME_URL,
        enabled: mlRuntimeClient.ML_RUNTIME_ENABLED
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * ML Runtime health check endpoint
 */
app.get('/ml-runtime/health', async (req, res) => {
  try {
    const isHealthy = await mlRuntimeClient.checkMlRuntimeHealth();
    res.json({
      status: isHealthy ? 'healthy' : 'unhealthy',
      mlRuntime: {
        healthy: isHealthy,
        url: mlRuntimeClient.ML_RUNTIME_URL
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * FÁZA 6.2D: Dependency status endpoint
 * Shows status of all service dependencies
 */
app.get('/status/dependencies', async (req, res) => {
  try {
    const connectivity = await mlRuntimeClient.checkMlRuntimeConnectivity();
    const health = await mlRuntimeClient.checkMlRuntimeHealth();

    const dependencies = {
      backend: {
        name: 'Node Backend',
        status: 'healthy',
        enabled: true
      },
      mlRuntime: {
        name: 'ML Runtime (Python)',
        status: health ? 'healthy' : 'unhealthy',
        reachable: connectivity.reachable,
        enabled: mlRuntimeClient.ML_RUNTIME_ENABLED,
        host: mlRuntimeClient.ML_RUNTIME_HOST,
        port: mlRuntimeClient.ML_RUNTIME_PORT,
        url: mlRuntimeClient.ML_RUNTIME_URL,
        reason: connectivity.reason || null
      }
    };

    // Overall status
    const allHealthy = dependencies.backend.status === 'healthy' &&
                       dependencies.mlRuntime.status === 'healthy';

    res.json({
      status: allHealthy ? 'ready' : 'degraded',
      dependencies: dependencies,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to check dependencies',
      error: error.message
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PREDICTION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Predict expense endpoint
 * FÁZA 6.2A: Simple prediction call to ML Runtime
 */
app.post('/predict', async (req, res) => {
  try {
    const { uid, pipelineLevel, modelVersion, transactions, income } = req.body;

    // Validate request
    if (!uid) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing uid'
      });
    }

    // Call ML Runtime
    const result = await mlRuntimeClient.callMlRuntime({
      uid: uid,
      pipelineLevel: pipelineLevel || 'L1',
      modelVersion: modelVersion || '1.0',
      transactions: transactions || [],
      income: income || 0
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
      uid: req.body?.uid || 'unknown'
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// STARTUP & SERVER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FÁZA 6.2D: Startup with dependency sanity check
 */
async function startup() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  FÁZA 6.2D: Node Backend Startup with Dependency Check   ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  // Log configuration
  console.log('[STARTUP] Configuration:');
  console.log(`  Backend Port: ${PORT}`);
  console.log(`  ML Runtime Host: ${mlRuntimeClient.ML_RUNTIME_HOST}`);
  console.log(`  ML Runtime Port: ${mlRuntimeClient.ML_RUNTIME_PORT}`);
  console.log(`  ML Runtime URL: ${mlRuntimeClient.ML_RUNTIME_URL}`);
  console.log(`  ML Runtime Enabled: ${mlRuntimeClient.ML_RUNTIME_ENABLED}`);
  console.log('');

  // Check dependencies
  console.log('[STARTUP] Checking dependencies...');
  console.log('');

  // Check ML Runtime connectivity and health
  const connectivity = await mlRuntimeClient.checkMlRuntimeConnectivity();
  const isHealthy = await mlRuntimeClient.checkMlRuntimeHealth();

  let allDependenciesSatisfied = true;

  // ML Runtime dependency check
  console.log('[STARTUP] Dependency: ML Runtime');
  if (!mlRuntimeClient.ML_RUNTIME_ENABLED) {
    console.log('  ⚠️ Status: DISABLED (ML_RUNTIME_ENABLED=false)');
    console.log('  Impact: Prediction calls will return fallback responses');
  } else if (!connectivity.reachable) {
    console.log(`  ❌ Status: UNREACHABLE`);
    console.log(`  Reason: ${connectivity.reason}`);
    console.log(`  Expected: http://${mlRuntimeClient.ML_RUNTIME_HOST}:${mlRuntimeClient.ML_RUNTIME_PORT}`);
    console.log('');
    console.log('  ⚠️ DEPENDENCY MISSING!');
    console.log('');
    console.log('  Solution 1: If using docker-compose');
    console.log('    podman-compose down');
    console.log('    podman-compose up');
    console.log('');
    console.log('  Solution 2: If running standalone');
    console.log(`    cd ml-runtime`);
    console.log(`    python app.py`);
    console.log('');
    console.log('  Solution 3: Check configuration');
    console.log(`    ML_RUNTIME_HOST=${mlRuntimeClient.ML_RUNTIME_HOST}`);
    console.log(`    ML_RUNTIME_PORT=${mlRuntimeClient.ML_RUNTIME_PORT}`);
    console.log('');
    allDependenciesSatisfied = false;
  } else if (!isHealthy) {
    console.log('  ⚠️ Status: REACHABLE but UNHEALTHY');
    console.log('  Impact: Some predictions may fail');
  } else {
    console.log('  ✅ Status: HEALTHY');
  }
  console.log('');

  // Summary
  console.log('[STARTUP] Available endpoints:');
  console.log('  GET  /health                    — Server health check');
  console.log('  GET  /ml-runtime/status         — ML Runtime connectivity');
  console.log('  GET  /ml-runtime/health         — ML Runtime health');
  console.log('  GET  /status/dependencies       — All dependencies status (FÁZA 6.2D)');
  console.log('  POST /predict                   — Make prediction request');
  console.log('');

  if (allDependenciesSatisfied && !mlRuntimeClient.ML_RUNTIME_ENABLED) {
    console.log('[STARTUP] ⚠️ NOTE: ML Runtime disabled, predictions will use fallback');
  } else if (!allDependenciesSatisfied) {
    console.log('[STARTUP] ❌ CRITICAL: Required dependencies not satisfied!');
    console.log('[STARTUP] Check error messages above for details.');
  } else {
    console.log('[STARTUP] ✅ All dependencies satisfied');
  }
  console.log('');
}

// Start server
const server = app.listen(PORT, async () => {
  await startup();
  console.log(`[STARTUP] Server ready! Listening on http://localhost:${PORT}`);
  console.log('');
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('[SHUTDOWN] SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[SHUTDOWN] SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('[SHUTDOWN] Server closed');
    process.exit(0);
  });
});

module.exports = app;
