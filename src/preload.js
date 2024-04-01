const {contextBridge, ipcRenderer} = require("electron");

contextBridge.exposeInMainWorld("api", {
    downloadAndUpdate: () => ipcRenderer.send("downloadAndUpdate"),
    runJar: (branch) => ipcRenderer.send("runJar", branch),
    // New methods for Java 11 check and installation
    checkJava11: () => ipcRenderer.send("checkJava11"),
    onVersionInfo: (callback) =>
        ipcRenderer.on("versionInfo", (_, data) => callback(data)),
    onInstallProgress: (callback) =>
        ipcRenderer.on("installProgress", (_, data) => callback(data)),
});
