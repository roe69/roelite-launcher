const fs = require("fs");
const path = require("path");
const { app, BrowserWindow } = require("electron");
const log = require("electron-log");
const semver = require("semver");
const https = require("https");
const os = require("os");
const exec = require("child_process").exec;

const roeliteDir = path.join(os.homedir(), ".roelite");
const localVersionPath = path.join(roeliteDir, ".launcherversion");
var remoteVersion = "Unknown";
// Utility to fetch data from a URL
async function fetchData(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data.trim()));
      })
      .on("error", (err) => reject(err));
  });
}

// Extract the direct download link from the Dropbox page
async function extractDirectDownloadLink(url) {
  const data = await fetchData(url);
  const matches = data.match(/https:\/\/[^\s]+?dl=1/);
  if (!matches) throw new Error("Direct download link extraction failed.");
  return matches[0];
}

// Get the remote version from the version file
async function getRemoteVersion() {
  try {
    const versionUrl =
      "https://www.dropbox.com/scl/fi/6a0udocnjvq8nfmvl838u/version.txt?rlkey=ylxiy8ot8479bitl7lyjlisyq&dl=1";
    const directLink = await extractDirectDownloadLink(versionUrl);
    const remoteVersion = await fetchData(directLink);
    log.info("Remote version retrieved:", remoteVersion);
    return remoteVersion;
  } catch (error) {
    log.error("Failed to get remote version:", error);
    throw error;
  }
}

// Update the local version file
function updateLocalVersion(version) {
  fs.writeFileSync(localVersionPath, version);
  log.info(`Local version updated to: ${version}`);
}

// Check for updates and handle the update process
async function checkForUpdates(mainWindow) {
  try {
    remoteVersion = await getRemoteVersion();
    if (
      !fs.existsSync(localVersionPath) ||
      !semver.valid(fs.readFileSync(localVersionPath, "utf-8").trim())
    ) {
      updateLocalVersion(remoteVersion);
      log.info(
        "Local version file was missing or invalid. Reset to remote version."
      );
      sendVersionInfo(mainWindow, remoteVersion, false);
      return;
    }
    var localVersion = fs.readFileSync(localVersionPath, "utf-8").trim();
    if (semver.valid(remoteVersion) && semver.gt(remoteVersion, localVersion)) {
      localVersion = `Update available: ${localVersion} -> ${remoteVersion}`;
      log.info(localVersion);
      sendVersionInfo(mainWindow, localVersion, true);
    } else {
      sendVersionInfo(mainWindow, localVersion, true);
      log.info("No updates found or already up to date.");
    }
  } catch (error) {
    sendVersionInfo(mainWindow, "Error", false);
    log.error("Update check failed:", error);
  }
}

// Send version information to the renderer process
function sendVersionInfo(mainWindow, launcherVersion, shouldUpdate) {
  mainWindow.webContents.send("versionInfo", {
    javaVersion: "n/a",
    launcherVersion,
    shouldUpdate,
  });
}

function createProgressWindow() {
  let progressWin = new BrowserWindow({
    icon: path.join(__dirname, "../icons/roelite.ico"),
    width: 500,
    height: 100,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  progressWin.setAlwaysOnTop(true);
  progressWin.setResizable(false);
  progressWin.setFullScreenable(false);
  progressWin.setMinimizable(false);
  progressWin.setClosable(false);
  progressWin.setMaximizable(false);
  progressWin.setMenuBarVisibility(false);
  progressWin.loadFile(path.join(__dirname, "progress.html"));
  return progressWin;
}

function downloadAndUpdate() {
  const updateExePath = path.join(roeliteDir, "RoeLiteInstaller.exe");
  const updateUrl =
    "https://www.dropbox.com/scl/fi/va6tz1r8o2p8e03wt9kho/RoeLiteInstaller.exe?rlkey=34zo13iuyno3c5aolr785c0q8&dl=1";
  let progressWin = createProgressWindow();
  // Function to update the progress window
  function updateProgressDialog(progress, message) {
    progressWin.webContents.send("update-progress", { progress, message });
  }
  updateProgressDialog(0, "Update available");
  var updatedLocal = false;
  https
    .get(updateUrl, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        const matches = data.match(/https:\/\/[^\s]+?dl=1/);
        if (matches && matches[0]) {
          const directDownloadUrl = matches[0];
          const fileStream = fs.createWriteStream(updateExePath);
          https.get(directDownloadUrl, (downloadResponse) => {
            let downloadedBytes = 0;
            const totalBytes = parseInt(
              downloadResponse.headers["content-length"],
              10
            );
            downloadResponse.on("data", (chunk) => {
              downloadedBytes += chunk.length;
              const progressPercentage = (downloadedBytes / totalBytes) * 100;
              updateProgressDialog(
                progressPercentage,
                `Downloading update: ${Math.round(progressPercentage)}%`
              );
              if (progressPercentage > 98.0) {
                if (!updatedLocal) {
                  updatedLocal = true;
                  fs.writeFileSync(localVersionPath, remoteVersion);
                }
                updateProgressDialog(100, "Restarting...");
              } else if (progressPercentage > 94.0) {
                updateProgressDialog(94, "Update downloaded, applying...");
              }
            });
            downloadResponse.pipe(fileStream);
            fileStream.on("finish", () => {
              fs.writeFileSync(localVersionPath, remoteVersion);
              progressWin.setClosable(true);
              fileStream.close();
              log.info("Update downloaded, starting the update process...");
              exec(updateExePath, (error) => {
                if (error) {
                  log.error(`Error executing update: ${error}`);
                }
                app.quit(); // Quit the app to allow the installer to run
              });
            });
          });
        } else {
          log.error("Could not extract the direct download URL.");
        }
      });
    })
    .on("error", (err) => {
      log.error(`Error downloading update: ${err}`);
    });
}

module.exports = { checkForUpdates, downloadAndUpdate };
