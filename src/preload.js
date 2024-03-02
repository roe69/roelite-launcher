const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  downloadJar: (jarName, url) => ipcRenderer.send("downloadJar", jarName, url),
  jarExists: (jarName) => {
    return ipcRenderer.sendSync("jarExists", jarName);
  },
  runJar: (jarName) => ipcRenderer.send("runJar", jarName),
  onDownloadComplete: (callback) =>
    ipcRenderer.on("downloadComplete", callback),
  // New methods for Java 11 check and installation
  checkJava11: () => ipcRenderer.send("checkJava11"),
  onVersionInfo: (callback) =>
    ipcRenderer.on("versionInfo", (_, data) => callback(data)),
  onInstallProgress: (callback) =>
    ipcRenderer.on("installProgress", (_, data) => callback(data)),
});
