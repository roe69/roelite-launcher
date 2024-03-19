const {checkForUpdates, downloadAndUpdate} = require("./js/updatemanager");
const {handleSquirrelEvent} = require("./js/squirrelevents");
const log = require("electron-log");
const path = require("path");
const {app, BrowserWindow} = require("electron");
const fs = require("fs");
const os = require("os");
const https = require("https");
const {exec} = require("child_process");
const {ipcMain, net} = require("electron");
const extract = require("extract-zip");
const roeliteDir = path.join(os.homedir(), ".roelite");
const javaBin = path.join(roeliteDir, "jre", "bin");
const jdkZipPath = path.join(roeliteDir, "openjdk-11.zip");
var mainWindow = null;

function setupLogging() {
    // Configure logging
    log.transports.file.resolvePathFn = () =>
        path.join(os.homedir(), ".roelite", "logs", "electron.log");
    log.info("Application starting...");
}

function checkFiles() {
    if (!fs.existsSync(roeliteDir)) {
        fs.mkdir(roeliteDir);
        log.info("Created roelite dir");
    }

    if (require("electron-squirrel-startup")) return;
    // this should be placed at top of main.js to handle setup events quickly
    if (handleSquirrelEvent()) {
        // squirrel event handled and app will exit in 1000ms, so don't do anything else
        return;
    }
}

app.whenReady().then(() => {
    setupLogging();
    checkFiles();
    // Create the browser window.
    mainWindow = new BrowserWindow({
        icon: path.join(__dirname, "/icons/roelite.ico"),
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, "preload.js"),
        },
    });
    mainWindow.setMenuBarVisibility(false);
    mainWindow.setFullScreenable(false);
    mainWindow.setTitle("RoeLite Launcher");
    mainWindow.setMinimumSize(800, 600);
    mainWindow.loadFile(path.join(__dirname, "index.html")).then(r => {
        checkForUpdates(mainWindow).then(r => {
            log.info("Checked for updates.")
        });
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

ipcMain.on("jarExists", (event, jarName) => {
    const jarPath = path.join(roeliteDir, jarName);
    event.returnValue = fs.existsSync(jarPath);
});

ipcMain.on("checkJava11", (event) => {
    fs.unlink(jdkZipPath, (err) => {
    });
    checkJavaVersion((javaVersion) => {
        if (javaVersion) {
            event.reply("versionInfo", {
                javaVersion,
                launcherVersion: "n/a",
                shouldUpdate: false,
            });
            updateProgress("Installation Complete", 100);
        } else {
            installJava11();
        }
    });
});

ipcMain.on("downloadJar", (event, jarName, url) => {
    downloadJar(jarName, url);
});

ipcMain.on("downloadAndUpdate", (event) => {
    downloadAndUpdate();
});

ipcMain.on("runJar", (event, jarName) => {
    runJar(jarName);
});

function runJar(jarName) {
    updateProgress("Starting " + jarName, 0);
    const javaPath = path.join(roeliteDir, "jre", "bin", "java.exe");
    const jarPath = path.join(os.homedir(), ".roelite", jarName);
    exec(`${javaPath} -jar ${jarPath}`, (err, stdout, stderr) => {
        if (err) {
            log.error(`exec error: ${err}`);
            return;
        }
        log.info(`stdout: ${stdout}`);
        log.error(`stderr: ${stderr}`);
    });
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress += 1; // Increment progress
        if (progress > 20) {
            updateProgress("Running " + jarName, progress);
        } else {
            updateProgress("Starting " + jarName, progress);
        }
        // If progress reaches 100%, stop incrementing it.
        if (progress > 100) {
            clearInterval(progressInterval);
        }
    }, 100); // Update progress every .1s
}

function downloadJar(jarName, url) {
    const jarPath = path.join(os.homedir(), ".roelite", jarName);
    if (!fs.existsSync(jarPath)) {
        const file = fs.createWriteStream(jarPath);
        https.get(url, function (response) {
            const totalBytes = 1000000; //1mb
            let downloadedBytes = 0;
            response.on("data", function (chunk) {
                file.write(chunk);
                downloadedBytes += chunk.length;
                updateProgress(
                    "Downloading " + jarName,
                    Math.floor((downloadedBytes / totalBytes) * 90)
                );
            });
            response.on("end", function () {
                file.end();
                updateProgress("Installation Complete", 100);
                mainWindow.webContents.send("downloadComplete", jarName);
            });
        });
    } else {
        log.info(jarName + " already exists.");
    }
}

// Function to download and install Java 11
function installJava11() {
    updateProgress("Downloading Java", 0);
    const jdkUrl =
        "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.22%2B7/OpenJDK11U-jre_x64_windows_hotspot_11.0.22_7.zip";
    const request = net.request(jdkUrl);
    request.on("response", (response) => {
        const totalBytes = parseInt(response.headers["content-length"], 10);
        let downloadedBytes = 0;
        const writeStream = fs.createWriteStream(jdkZipPath);
        response.on("data", (chunk) => {
            writeStream.write(chunk);
            downloadedBytes += chunk.length;
            updateProgress(
                "Downloading Java",
                Math.floor((downloadedBytes / totalBytes) * 90)
            );
        });
        response.on("end", async () => {
            writeStream.close();
            updateProgress("Unzipping Files", 90);
            try {
                await extract(jdkZipPath, {dir: roeliteDir});
                updateProgress("Renaming Folder", 95); // Assume unzipping almost complete
                fs.rename(
                    path.join(roeliteDir, "jdk-11.0.22+7-jre"),
                    path.join(roeliteDir, "jre"),
                    (err) => {
                        if (err) throw err;
                        // After renaming, re-check the Java version to confirm installation
                        checkJavaVersion((javaVersion) => {
                            if (javaVersion) {
                                mainWindow.webContents.send("versionInfo", {
                                    javaVersion,
                                    launcherVersion: "n/a",
                                    shouldUpdate: false,
                                }); // Ensure UI is updated with the new version
                                fs.unlink(jdkZipPath, (err) => {
                                });
                                updateProgress("Installation Complete", 100);
                            } else {
                                // Handle error or notify user of installation failure
                                log.error("Java installation check failed.");
                            }
                        });
                    }
                );
            } catch (error) {
                log.error("Failed to unzip JDK:", error);
            }
        });
    });
    request.end();
}

// Helper function to check Java version
function checkJavaVersion(callback) {
    exec(`${javaBin}/java.exe -version`, (error, stdout, stderr) => {
        if (error) {
            return callback(null);
        }
        const versionMatch = stderr.match(/version "(\d+\.\d+\.\d+)/);
        const version = versionMatch ? versionMatch[1] : null;
        log.info("JRE: " + version);
        callback(version);
    });
}

function updateProgress(stage, progress) {
    mainWindow.webContents.send("installProgress", {stage, progress});
}
