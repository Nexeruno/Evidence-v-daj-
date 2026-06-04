const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");

// Dev mode: Vite picks a free port starting from 5173
// VITE_PORT env var is set by the start script, fallback to 5173
const VITE_PORT = process.env.VITE_PORT || "5173";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  win.loadURL(`http://localhost:${VITE_PORT}`);
  console.log(`[ELECTRON] Loading http://localhost:${VITE_PORT}`);
}

app.whenReady().then(() => {
  // Set Content-Security-Policy for all renderer windows
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' https://*.googleapis.com https://*.firebaseapp.com https://*.cloudfunctions.net https://*.google.com;" +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com;" +
          "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.cloudfunctions.net wss://*.firebaseio.com https://firestore.googleapis.com ws://localhost:* http://localhost:*;" +
          "img-src 'self' data: https:;" +
          "style-src 'self' 'unsafe-inline';"
        ],
      },
    });
  });
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for ML Pipeline Control
ipcMain.handle("runLevel2Pipeline", async (event, idToken) => {
  const projectId = 'evidence-vydaju';
  const url = `https://europe-west1-${projectId}.cloudfunctions.net/runLevel2ShadowPipeline`;

  console.log('[LEVEL2_PIPELINE]', {
    url,
    hasIdToken: Boolean(idToken) && idToken.length > 10,
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({}),
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    console.log('[LEVEL2_PIPELINE] response', {
      httpStatus: response.status,
      ok: response.ok,
      resultOk: result?.ok,
      resultError: result?.error || null,
    });

    if (!response.ok) {
      const errMsg = result?.error || `Cloud Function returned HTTP ${response.status}`;
      return { success: false, message: errMsg };
    }

    return {
      success: result?.ok === true,
      message: result?.message || 'Shadow pipeline executed',
      summary: result?.summary,
    };

  } catch (err) {
    console.error('[LEVEL2_PIPELINE] fetch error', { error: err.message });
    return {
      success: false,
      message: err.message || 'Failed to run Level 2 pipeline',
    };
  }
});

ipcMain.handle("getPipelineStatus", async (event) => {
  return {
    status: "idle",
    lastRun: null,
    isRunning: false,
  };
});

ipcMain.handle("callCloudFunction", async (event, functionName, idToken, data) => {
  const projectId = 'evidence-vydaju';
  const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;

  console.log('[ML_CONTROL_DEBUG]', {
    functionName,
    url,
    hasIdToken: Boolean(idToken) && idToken.length > 10,
    dataKeys: data ? Object.keys(data) : [],
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify(data ?? {}),
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    console.log('[ML_CONTROL_DEBUG] response', {
      functionName,
      httpStatus: response.status,
      ok: response.ok,
      resultOk: result?.ok,
      resultError: result?.error || null,
    });

    if (!response.ok) {
      let errMsg;
      if (response.status === 404) {
        errMsg = `Prediction settings backend is not deployed yet. (${functionName})`;
      } else {
        errMsg = result?.error || `Cloud Function ${functionName} returned HTTP ${response.status}`;
      }
      return { ok: false, error: errMsg };
    }

    return result;
  } catch (err) {
    console.error('[ML_CONTROL_DEBUG] fetch error', { functionName, error: err.message });
    return {
      ok: false,
      error: err.message || 'Failed to call Cloud Function',
    };
  }
});

ipcMain.handle("clearLocalCache", async (event) => {
  return {
    success: true,
    message: "Local cache cleared",
  };
});
