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
 * Startup logging
 */
async function startup() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  FÁZA 6.2A: Node Backend Server Startup                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log(`[STARTUP] Node Server starting on port ${PORT}`);
  console.log(`[STARTUP] ML Runtime URL: ${mlRuntimeClient.ML_RUNTIME_URL}`);
  console.log(`[STARTUP] ML Runtime Host: ${mlRuntimeClient.ML_RUNTIME_HOST}`);
  console.log(`[STARTUP] ML Runtime Port: ${mlRuntimeClient.ML_RUNTIME_PORT}`);
  console.log(`[STARTUP] ML Runtime Enabled: ${mlRuntimeClient.ML_RUNTIME_ENABLED}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /health                    — Server health check');
  console.log('  GET  /ml-runtime/status         — ML Runtime connectivity status');
  console.log('  GET  /ml-runtime/health         — ML Runtime health check');
  console.log('  POST /predict                   — Make prediction request');
  console.log('');

  // Check ML Runtime connectivity
  const connectivity = await mlRuntimeClient.checkMlRuntimeConnectivity();
  if (connectivity.reachable) {
    console.log('✅ [STARTUP] ML Runtime is reachable');
  } else {
    console.log(`⚠️ [STARTUP] ML Runtime is unreachable: ${connectivity.reason}`);
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
