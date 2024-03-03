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
var progressWindow = null;

// Utility to fetch data from a URL
async function fetchData(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { "User-Agent": "RoeLiteInstaller" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data.trim()));
      }
    );
    req.on("error", (err) => reject(err));
    req.end();
  });
}

// Get the latest release version and download URL from GitHub
async function getLatestReleaseInfo() {
  try {
    const releasesUrl =
      "https://api.github.com/repos/roe69/roelite-launcher/releases/latest";
    const releaseData = await fetchData(releasesUrl);
    const release = JSON.parse(releaseData);
    const version = release.name;
    const asset = release.assets.find(
      (asset) => asset.name === "RoeLiteInstaller.exe"
    );
    if (!asset)
      throw new Error(
        "RoeLiteInstaller.exe not found in latest release assets."
      );
    return { version, downloadUrl: asset.browser_download_url };
  } catch (error) {
    log.error("Failed to get latest release info:", error);
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
    const { version: remoteVersion, downloadUrl } =
      await getLatestReleaseInfo();
    log.info(
      "Remote version: " + remoteVersion + ", download url: " + downloadUrl
    );
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
      localVersion = `${localVersion} -> ${remoteVersion}`;
      log.info(`Update available from ${localVersion}`);
      sendVersionInfo(mainWindow, localVersion, true);
    } else {
      sendVersionInfo(mainWindow, localVersion, false);
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
  if (progressWindow === null) {
    progressWindow = new BrowserWindow({
      icon: path.join(__dirname, "../icons/roelite.ico"),
      width: 500,
      height: 100,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });
    progressWindow.setAlwaysOnTop(true);
    progressWindow.setResizable(false);
    progressWindow.setFullScreenable(false);
    progressWindow.setMinimizable(false);
    progressWindow.setClosable(false);
    progressWindow.setMaximizable(false);
    progressWindow.setMenuBarVisibility(false);
    progressWindow.loadFile(path.join(__dirname, "progress.html"));
  }
  return progressWindow;
}

async function downloadAndUpdate() {
  const { version: remoteVersion, downloadUrl } = await getLatestReleaseInfo();
  log.info(
    "Remote version: " + remoteVersion + ", download url: " + downloadUrl
  );
  dlUrl(downloadUrl);
}

function dlUrl(downloadUrl) {
  log.info("Downloading launcher from:", downloadUrl);
  const updateExePath = path.join(roeliteDir, "RoeLiteInstaller.exe");
  let progressWin = createProgressWindow();
  // Function to update the progress window
  function updateProgressDialog(progress, message) {
    progressWin.webContents.send("update-progress", { progress, message });
  }
  updateProgressDialog(0, "Update available");
  // Modified part: Using request options for HTTPS get request
  const requestOptions = {
    method: "GET",
    headers: {
      "User-Agent": "RoeLiteInstaller",
    },
  };

  https
    .get(downloadUrl, requestOptions, (response) => {
      // Check if the response is a redirect
      if (
        response.statusCode > 300 &&
        response.statusCode < 399 &&
        response.headers.location
      ) {
        // If so, call downloadAndUpdate recursively with the new location
        dlUrl(response.headers.location);
      } else {
        // Handle the download
        const fileStream = fs.createWriteStream(updateExePath);
        response.pipe(fileStream);
        let downloadedBytes = 0;
        const totalBytes = parseInt(response.headers["content-length"], 10);

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;
          const progressPercentage = (downloadedBytes / totalBytes) * 100;
          updateProgressDialog(
            progressPercentage,
            `Downloading update: ${Math.round(progressPercentage)}%`
          );
        });

        fileStream.on("finish", () => {
          fileStream.close();
          updateLocalVersion(remoteVersion);
          updateProgressDialog(100, "Restarting...");
          log.info("Update downloaded, starting the update process...");
          exec(updateExePath, (error) => {
            app.quit(); // Quit the app to allow the installer to run
            if (error) {
              log.error(`Error executing update: ${error}`);
              throw error;
            }
          });
        });
      }
    })
    .on("error", (err) => {
      log.error(`Error downloading update: ${err}`);
    });
}

module.exports = { checkForUpdates, downloadAndUpdate };
