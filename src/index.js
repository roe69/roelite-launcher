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
const {loadChecksums, getChecksum, getFileChecksum} = require("./util/checksums");
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

if (require("electron-squirrel-startup")) return;
// this should be placed at top of main.js to handle setup events quickly
if (handleSquirrelEvent()) {
}

loadChecksums();
setInterval(() => loadChecksums(), 1_800_000);//every 30 minutes

function checkFiles() {
    if (!fs.existsSync(roeliteDir)) {
        fs.mkdir(roeliteDir, () => {
        });
        log.info("Created roelite dir");
    }
}

app.whenReady().then(() => {
    setupLogging();
    checkFiles();
    // Create the browser window.
    mainWindow = new BrowserWindow({
        icon: path.join(__dirname, "./img/icons/roelite.ico"),
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

ipcMain.on("downloadAndUpdate", (event) => {
    downloadAndUpdate();
});

ipcMain.on("runJar", (event, filePath) => {
    runJar(filePath);
});

async function runJar(filePath) {
    let progressInterval;
    try {
        const jarPath = await downloadJarIfChanged(filePath);
        const jarName = path.basename(filePath);
        updateProgress("Starting " + jarName, 0);
        const javaPath = path.join(roeliteDir, "jre", "bin", "java.exe");

        const process = exec(`"${javaPath}" -jar "${jarPath}"`, (error, stdout, stderr) => {
            clearInterval(progressInterval); // Ensure the interval is cleared when the process completes
            if (error) {
                log.error("JAR launch failed:", error);
                log.info("Deleting the invalid JAR file.");
                fs.unlink(jarPath, err => {
                    if (err) {
                        log.error("Failed to delete invalid JAR file:", err);
                    } else {
                        log.info(jarName + " was deleted successfully.");
                    }
                });
            } else {
                log.info("JAR launched successfully:", stdout);
            }
        });

        let progress = 0;
        progressInterval = setInterval(() => {
            progress += 1; // Increment progress
            if (progress > 20) {
                updateProgress("Running " + jarName, progress);
            } else {
                updateProgress("Starting " + jarName, progress);
            }
            if (progress >= 100) {
                clearInterval(progressInterval);
            }
        }, 100); // Update progress every .1s
    } catch (error) {
        clearInterval(progressInterval); // Clear the interval on error
        console.error("Error during JAR operation:", error);
        fs.unlink(filePath, err => {
            if (err) console.error("Failed to delete the JAR file after preparation error:", err);
            else console.log("Deleted the JAR file after encountering an error in preparation.");
        });
    }
}

async function downloadJarIfChanged(filePath) {
    const jarName = path.basename(filePath);
    const jarPath = path.join(os.homedir(), ".roelite", jarName);
    // Ensure checksums are loaded and compared
    const remoteChecksum = getChecksum(filePath); // getChecksum seems to be synchronous now
    const localChecksum = await getFileChecksum(jarPath);
    console.log("Local:", localChecksum, "Remote:", remoteChecksum);
    // If checksums match, the file is up to date
    if (localChecksum === remoteChecksum) {
        console.log(`${jarName} is up to date.`);
        return jarPath;
    }
    // Check for write access
    if (localChecksum) {
        const canWrite = await canWriteToFile(jarPath);
        if (!canWrite) {
            console.error(`Cannot write to ${jarName}: file may be in use.`);
            return jarPath;
        }
    }
    console.log("Downloading JAR from path: " + filePath);
    return new Promise((resolve, reject) => {
        const fileStream = fs.createWriteStream(jarPath, {flags: 'w'});
        fileStream.on('error', err => {
            console.error(`Error writing to file ${jarName}:`, err);
            reject(new Error(`Error writing to file ${jarName}: ${err.message}`));
        });
        const options = {
            hostname: 'cloud.roelite.net',
            port: 443,
            path: '/files/download',
            method: 'GET',
            headers: {
                'branch': "dev",
                'filename': filePath,
            },
            rejectUnauthorized: false,
        };
        const request = https.get(options, response => {
            if (response.statusCode === 200) {
                response.pipe(fileStream).on('finish', () => {
                    console.log(`${jarName} downloaded successfully.`);
                    resolve(jarPath);
                });
            } else {
                console.error(`Failed to download ${jarName}: Server responded with status code ${response.statusCode}`);
                fileStream.end(() => {
                    fs.unlink(jarPath, () => reject(new Error(`Failed to download ${jarName}: Server responded with status code ${response.statusCode}`)));
                });
            }
        });
        request.on('error', err => {
            console.error(`Problem with request: ${err.message}`);
            fileStream.end(() => {
                fs.unlink(jarPath, () => reject(err));
            });
        });
    });
}

function canWriteToFile(filePath) {
    return new Promise((resolve) => {
        fs.open(filePath, 'r+', (err, fd) => {
            if (err) {
                resolve(false); // If there's an error opening the file for writing, resolve as false
            } else {
                fs.close(fd, (err) => {
                    if (err) {
                        console.error(`Error closing file ${filePath}:`, err);
                    }
                    resolve(true); // Successfully opened and closed the file for writing
                });
            }
        });
    });
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
    exec(`"${javaBin}/java.exe" -version`, (error, stdout, stderr) => {
        if (error) {
            log.error("Error checking Java version: " + error);
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