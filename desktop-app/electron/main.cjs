const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");

// Dev mode: Vite picks a free port starting from 5173
// VITE_PORT env var is set by the start script, fallback to 5173
const VITE_PORT = process.env.VITE_PORT || "5173";

// Firebase project id used to build Cloud Function URLs.
// The Electron main process is plain Node and does NOT receive Vite's import.meta.env,
// so it can be overridden via process env; otherwise it falls back to the project's
// public Firebase project id (same value committed in .firebaserc and index.html CSP).
const FIREBASE_PROJECT_ID =
  process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || "evidence-vydaju";

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
  const projectId = FIREBASE_PROJECT_ID;
  const url = `https://europe-west1-${projectId}.cloudfunctions.net/runLevel2ShadowPipeline`;

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
    console.error('Level 2 pipeline request failed', { error: err.message });
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
  const projectId = FIREBASE_PROJECT_ID;
  const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;

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
    console.error('Cloud Function request failed', { functionName, error: err.message });
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

ipcMain.handle("generateAiProfile", async (event, idToken, userId) => {
  const projectId = FIREBASE_PROJECT_ID;
  const functionName = 'adminGenerateAiProfile';
  const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body: JSON.stringify({ userId }),
    });

    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      result = { raw: responseText };
    }

    if (!response.ok) {
      const errMsg = result?.error || `Cloud Function ${functionName} returned HTTP ${response.status}`;
      return { ok: false, error: errMsg };
    }

    return result;
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Failed to call Cloud Function',
    };
  }
});

ipcMain.handle("generateAllAiProfiles", async (event, idToken) => {
  const projectId = FIREBASE_PROJECT_ID;
  const functionName = 'adminGenerateAllAiProfiles';
  const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;

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

    if (!response.ok) {
      const errMsg = result?.error || `Cloud Function ${functionName} returned HTTP ${response.status}`;
      return { ok: false, error: errMsg };
    }

    return result;
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Failed to call Cloud Function',
    };
  }
});

ipcMain.handle("regenerateStaleProfiles", async (event, idToken) => {
  const projectId = FIREBASE_PROJECT_ID;
  const functionName = 'adminRegenerateStaleProfiles';
  const url = `https://europe-west1-${projectId}.cloudfunctions.net/${functionName}`;

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

    if (!response.ok) {
      const errMsg = result?.error || `Cloud Function ${functionName} returned HTTP ${response.status}`;
      return { ok: false, error: errMsg };
    }

    return result;
  } catch (err) {
    return {
      ok: false,
      error: err.message || 'Failed to call Cloud Function',
    };
  }
});
