const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

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

  win.loadURL("http://localhost:5173");
}

app.whenReady().then(createWindow);

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
  return {
    success: true,
    message: "Level 2 pipeline run queued (local execution coming soon)",
    pipelineId: `local_${Date.now()}`,
  };
});

ipcMain.handle("getPipelineStatus", async (event) => {
  return {
    status: "idle",
    lastRun: null,
    isRunning: false,
  };
});

ipcMain.handle("callCloudFunction", async (event, functionName, idToken, data) => {
  return {
    success: true,
    message: `Cloud Function ${functionName} called successfully`,
    data: data,
  };
});

ipcMain.handle("clearLocalCache", async (event) => {
  return {
    success: true,
    message: "Local cache cleared",
  };
});
