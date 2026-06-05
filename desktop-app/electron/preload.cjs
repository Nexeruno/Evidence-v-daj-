const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ipcApi", {
  runLevel2Pipeline: (idToken) =>
    ipcRenderer.invoke("runLevel2Pipeline", idToken),
  getPipelineStatus: () =>
    ipcRenderer.invoke("getPipelineStatus"),
  callCloudFunction: (functionName, idToken, data) =>
    ipcRenderer.invoke("callCloudFunction", functionName, idToken, data),
  clearLocalCache: () =>
    ipcRenderer.invoke("clearLocalCache"),
  generateAiProfile: (idToken, userId) =>
    ipcRenderer.invoke("generateAiProfile", idToken, userId),
  generateAllAiProfiles: (idToken) =>
    ipcRenderer.invoke("generateAllAiProfiles", idToken),
});
